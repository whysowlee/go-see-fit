/**
 * mirrorEngine.ts — 라이브 거울 엔진 (PoC mirror/main.js 이식).
 *
 * getUserMedia + MediaPipe(FaceLandmarker + Hair ImageSegmenter) + WebGL2 렌더.
 * 메인 스레드 실행 (PoC에서 모듈 워커 WASM 글루 로드 불가 확인 — ModuleFactory not set).
 *
 * 절대 제약: 웹캠 프레임은 브라우저 밖으로 안 나감. 전부 온디바이스(WASM/WebGL).
 *
 * React 비의존 — 순수 엔진. MirrorView.tsx가 canvas/params를 주입.
 *
 * 사용:
 *   const engine = new MirrorEngine(canvas);
 *   await engine.start({ width, height });
 *   engine.setParams({ lip: { color, alpha }, hair: { color, alpha }, ... });
 *   engine.stop();
 */
import { FilesetResolver, FaceLandmarker, ImageSegmenter } from "@mediapipe/tasks-vision";

const WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";
const FACE_MODEL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const HAIR_MODEL =
  "https://storage.googleapis.com/mediapipe-models/image_segmenter/hair_segmenter/float32/latest/hair_segmenter.tflite";

// 립 외곽 랜드마크 (MediaPipe FaceMesh 468 인덱스)
const LIP = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185];

export interface MakeupParam {
  /** RGB 0-1 */
  color: [number, number, number];
  /** 0-1 */
  alpha: number;
  enabled: boolean;
}

export interface MirrorParams {
  lip: MakeupParam;
  cheek: MakeupParam;
  hair: MakeupParam;
  /** 헤어 세그멘테이션 cadence (N프레임마다 1회) */
  hairEvery: number;
  /** 세그멘터 입력 다운스케일 (0.4~1.0) */
  segScale: number;
}

export interface MirrorStats {
  fps: number;
  faceMs: number;
  hairMs: number;
}

export const DEFAULT_PARAMS: MirrorParams = {
  lip: { color: [0.75, 0.05, 0.2], alpha: 0.35, enabled: true },
  cheek: { color: [0.95, 0.5, 0.55], alpha: 0.2, enabled: false },
  hair: { color: [0.55, 0.18, 0.3], alpha: 0.6, enabled: true },
  hairEvery: 3,
  segScale: 0.6,
};

// 블러셔 영역 중심 랜드마크 (좌/우 광대)
const CHEEK_L = 50; // 왼쪽 광대 근방
const CHEEK_R = 280; // 오른쪽 광대 근방

export class MirrorEngine {
  private canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext;
  private video: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;
  private running = false;

  private faceLM: FaceLandmarker | null = null;
  private segmenter: ImageSegmenter | null = null;
  private modelsReady = false;

  private lastFaceTs = 0;
  private lastHairTs = 0;
  private frameCount = 0;
  private maskValid = false;
  private faceMsEMA = 0;
  private hairMsEMA = 0;
  private renderTimes: number[] = [];
  private rvfc: number | null = null;

  private params: MirrorParams = { ...DEFAULT_PARAMS };
  private onStats?: (s: MirrorStats) => void;
  private onError?: (msg: string) => void;

  // WebGL
  private bgProg!: WebGLProgram;
  private overlayProg!: WebGLProgram;
  private uHairLoc!: WebGLUniformLocation | null;
  private uHairColorLoc!: WebGLUniformLocation | null;
  private uHairAmtLoc!: WebGLUniformLocation | null;
  private uOverlayColorLoc!: WebGLUniformLocation | null;
  private uOverlayAlphaLoc!: WebGLUniformLocation | null;
  private bgTex!: WebGLTexture;
  private maskTex!: WebGLTexture;
  private vaoQuad!: WebGLVertexArrayObject;
  private vaoOverlay!: WebGLVertexArrayObject;
  private overlayBuf!: WebGLBuffer;

  private segCanvas: HTMLCanvasElement;
  private segCtx: CanvasRenderingContext2D;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext("webgl2", { antialias: false, premultipliedAlpha: false });
    if (!gl) throw new Error("WebGL2 미지원 브라우저입니다.");
    this.gl = gl;
    this.segCanvas = document.createElement("canvas");
    this.segCtx = this.segCanvas.getContext("2d")!;
    this.initGL();
  }

  setParams(p: Partial<MirrorParams>) {
    this.params = { ...this.params, ...p };
  }

  onStatsUpdate(cb: (s: MirrorStats) => void) {
    this.onStats = cb;
  }
  onErrorMessage(cb: (msg: string) => void) {
    this.onError = cb;
  }

  // ---------- 모델 ----------
  private async loadModels() {
    try {
      const fileset = await FilesetResolver.forVisionTasks(WASM);
      this.faceLM = await FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: FACE_MODEL, delegate: "GPU" },
        runningMode: "VIDEO",
        numFaces: 1,
      });
      this.segmenter = await ImageSegmenter.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: HAIR_MODEL, delegate: "GPU" },
        runningMode: "VIDEO",
        outputCategoryMask: true,
        outputConfidenceMasks: false,
      });
      this.modelsReady = true;
    } catch (err) {
      this.onError?.("모델 로드 실패: " + (err instanceof Error ? err.message : String(err)));
      throw err;
    }
  }

  // ---------- 카메라 / 루프 ----------
  async start(res: { width: number; height: number } = { width: 1280, height: 720 }) {
    if (this.running) return;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: res.width }, height: { ideal: res.height }, facingMode: "user" },
        audio: false,
      });
    } catch (e) {
      this.onError?.("카메라 접근 실패: " + (e instanceof Error ? e.message : String(e)));
      return;
    }

    if (!this.video) {
      this.video = document.createElement("video");
      this.video.playsInline = true;
      this.video.muted = true;
    }
    this.video.srcObject = this.stream;
    await this.video.play();

    if (!this.modelsReady) await this.loadModels();

    this.running = true;
    this.loop();
  }

  stop() {
    this.running = false;
    if (this.rvfc != null && this.video?.cancelVideoFrameCallback) {
      this.video.cancelVideoFrameCallback(this.rvfc);
    }
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
  }

  /** 엔진 완전 해제 (컴포넌트 unmount 시) */
  dispose() {
    this.stop();
    this.faceLM?.close();
    this.segmenter?.close();
  }

  private loop() {
    if (!this.running || !this.video) return;
    this.rvfc = this.video.requestVideoFrameCallback(() => {
      try {
        this.onFrame();
      } catch (e) {
        this.onError?.("프레임 처리 오류: " + (e instanceof Error ? e.message : String(e)));
      }
      this.loop();
    });
  }

  private ts(prev: number): number {
    const t = Math.round(performance.now());
    return t <= prev ? prev + 1 : t;
  }

  private onFrame() {
    const video = this.video!;
    const gl = this.gl;
    const w = video.videoWidth,
      h = video.videoHeight;
    if (!w || !h) return;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    const p = this.params;

    // 배경(영상) 텍스처
    gl.bindTexture(gl.TEXTURE_2D, this.bgTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);

    // 얼굴 (매 프레임)
    let lipVerts: Float32Array | null = null;
    let cheekVerts: Float32Array | null = null;
    if (this.modelsReady && (p.lip.enabled || p.cheek.enabled)) {
      const t0 = performance.now();
      this.lastFaceTs = this.ts(this.lastFaceTs);
      const r = this.faceLM!.detectForVideo(video, this.lastFaceTs);
      this.faceMsEMA = this.faceMsEMA * 0.8 + (performance.now() - t0) * 0.2;
      const lm = r.faceLandmarks?.[0];
      if (lm) {
        if (p.lip.enabled) lipVerts = this.buildPolygon(lm, LIP);
        if (p.cheek.enabled) cheekVerts = this.buildCheeks(lm);
      }
    }

    // 헤어 (N프레임마다)
    if (this.modelsReady && p.hair.enabled && this.frameCount % p.hairEvery === 0) {
      const t0 = performance.now();
      let input: HTMLVideoElement | HTMLCanvasElement = video;
      if (p.segScale < 0.999) {
        this.segCanvas.width = Math.max(64, Math.round(w * p.segScale));
        this.segCanvas.height = Math.max(64, Math.round(h * p.segScale));
        this.segCtx.drawImage(video, 0, 0, this.segCanvas.width, this.segCanvas.height);
        input = this.segCanvas;
      }
      this.lastHairTs = this.ts(this.lastHairTs);
      this.segmenter!.segmentForVideo(input, this.lastHairTs, (result) => {
        const mask = result.categoryMask;
        if (mask) {
          this.uploadMask(mask.getAsUint8Array(), mask.width, mask.height);
        }
        result.close();
      });
      this.hairMsEMA = this.hairMsEMA * 0.8 + (performance.now() - t0) * 0.2;
    }

    this.render(lipVerts, cheekVerts);
    this.renderTimes.push(performance.now());
    this.frameCount++;
    this.postStats();
  }

  // 좌우 미러 + 상하 플립 (PoC와 동일 좌표계)
  private buildPolygon(lm: Array<{ x: number; y: number }>, indices: number[]): Float32Array {
    let cx = 0,
      cy = 0;
    const ring: number[] = [];
    for (const i of indices) {
      const pt = lm[i];
      const x = 1 - 2 * pt.x,
        y = 1 - 2 * pt.y;
      ring.push(x, y);
      cx += x;
      cy += y;
    }
    cx /= indices.length;
    cy /= indices.length;
    return new Float32Array([cx, cy, ...ring, ring[0], ring[1]]);
  }

  // 양 볼 블러셔 — 광대 근방에 작은 원형 fan 2개 (간단 버전: 중심점 주변 다각형)
  private buildCheeks(lm: Array<{ x: number; y: number }>): Float32Array {
    const verts: number[] = [];
    for (const idx of [CHEEK_L, CHEEK_R]) {
      const pt = lm[idx];
      const cx = 1 - 2 * pt.x,
        cy = 1 - 2 * pt.y;
      const radius = 0.06;
      const seg = 12;
      verts.push(cx, cy);
      for (let s = 0; s <= seg; s++) {
        const a = (s / seg) * Math.PI * 2;
        verts.push(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius * 1.2);
      }
    }
    return new Float32Array(verts);
  }

  private postStats() {
    const now = performance.now();
    this.renderTimes = this.renderTimes.filter((t) => now - t <= 1000);
    this.onStats?.({
      fps: this.renderTimes.length,
      faceMs: this.faceMsEMA,
      hairMs: this.hairMsEMA,
    });
  }

  // ---------- WebGL ----------
  private initGL() {
    const gl = this.gl;
    const VS_BG = `#version 300 es
    layout(location=0) in vec2 aPos; layout(location=1) in vec2 aUv;
    out vec2 vUv; void main(){ vUv=aUv; gl_Position=vec4(aPos,0.0,1.0); }`;
    const FS_BG = `#version 300 es
    precision mediump float; in vec2 vUv; out vec4 o;
    uniform sampler2D uBg; uniform sampler2D uMask; uniform float uHair;
    uniform vec3 uHairColor; uniform float uHairAmt;
    void main(){
      vec3 c = texture(uBg, vUv).rgb;
      if(uHair > 0.5){
        float m = texture(uMask, vUv).r;
        if(m > 0.003){ c = mix(c, c*0.45 + uHairColor*0.55, uHairAmt); }
      }
      o = vec4(c, 1.0);
    }`;
    // 메이크업 오버레이 (립·블러셔 공용) — 색·알파 유니폼
    const VS_OVERLAY = `#version 300 es
    layout(location=0) in vec2 aPos; void main(){ gl_Position=vec4(aPos,0.0,1.0); }`;
    const FS_OVERLAY = `#version 300 es
    precision mediump float; out vec4 o;
    uniform vec3 uColor; uniform float uAlpha;
    void main(){ o=vec4(uColor, uAlpha); }`;

    this.bgProg = this.link(VS_BG, FS_BG);
    this.overlayProg = this.link(VS_OVERLAY, FS_OVERLAY);

    gl.useProgram(this.bgProg);
    gl.uniform1i(gl.getUniformLocation(this.bgProg, "uBg"), 0);
    gl.uniform1i(gl.getUniformLocation(this.bgProg, "uMask"), 1);
    this.uHairLoc = gl.getUniformLocation(this.bgProg, "uHair");
    this.uHairColorLoc = gl.getUniformLocation(this.bgProg, "uHairColor");
    this.uHairAmtLoc = gl.getUniformLocation(this.bgProg, "uHairAmt");
    this.uOverlayColorLoc = gl.getUniformLocation(this.overlayProg, "uColor");
    this.uOverlayAlphaLoc = gl.getUniformLocation(this.overlayProg, "uAlpha");

    const quad = new Float32Array([-1, 1, 1, 0, 1, 1, 0, 0, -1, -1, 1, 1, 1, -1, 0, 1]);
    this.vaoQuad = gl.createVertexArray()!;
    gl.bindVertexArray(this.vaoQuad);
    const qb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, qb);
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);

    this.vaoOverlay = gl.createVertexArray()!;
    gl.bindVertexArray(this.vaoOverlay);
    this.overlayBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.overlayBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(256), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
    gl.bindVertexArray(null);

    this.bgTex = this.newTex();
    this.maskTex = this.newTex();
    gl.bindTexture(gl.TEXTURE_2D, this.maskTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 1, 1, 0, gl.RED, gl.UNSIGNED_BYTE, new Uint8Array([0]));
  }

  private uploadMask(data: Uint8Array, mw: number, mh: number) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.maskTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, mw, mh, 0, gl.RED, gl.UNSIGNED_BYTE, data);
    this.maskValid = true;
  }

  private render(lipVerts: Float32Array | null, cheekVerts: Float32Array | null) {
    const gl = this.gl;
    const p = this.params;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.disable(gl.BLEND);

    // 배경 + 헤어 틴트
    gl.useProgram(this.bgProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.bgTex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.maskTex);
    gl.uniform1f(this.uHairLoc, p.hair.enabled && this.maskValid ? 1 : 0);
    gl.uniform3fv(this.uHairColorLoc, p.hair.color);
    gl.uniform1f(this.uHairAmtLoc, p.hair.alpha);
    gl.bindVertexArray(this.vaoQuad);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // 메이크업 오버레이
    gl.useProgram(this.overlayProg);
    gl.bindVertexArray(this.vaoOverlay);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.overlayBuf);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    if (cheekVerts && p.cheek.enabled) {
      gl.uniform3fv(this.uOverlayColorLoc, p.cheek.color);
      gl.uniform1f(this.uOverlayAlphaLoc, p.cheek.alpha);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, cheekVerts);
      // 두 개의 fan (각 14 정점: 중심 + 13)
      gl.drawArrays(gl.TRIANGLE_FAN, 0, 14);
      gl.drawArrays(gl.TRIANGLE_FAN, 14, 14);
    }
    if (lipVerts && p.lip.enabled) {
      gl.uniform3fv(this.uOverlayColorLoc, p.lip.color);
      gl.uniform1f(this.uOverlayAlphaLoc, p.lip.alpha);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, lipVerts);
      gl.drawArrays(gl.TRIANGLE_FAN, 0, lipVerts.length / 2);
    }

    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
  }

  private newTex(): WebGLTexture {
    const gl = this.gl;
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  private link(vs: string, fs: string): WebGLProgram {
    const gl = this.gl;
    const p = gl.createProgram()!;
    gl.attachShader(p, this.sh(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, this.sh(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      console.error("link", gl.getProgramInfoLog(p));
    }
    return p;
  }

  private sh(type: number, src: string): WebGLShader {
    const gl = this.gl;
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error("shader", gl.getShaderInfoLog(s));
    }
    return s;
  }
}
