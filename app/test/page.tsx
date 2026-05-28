"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { getFaceLandmarker, getPoseLandmarker } from "@/lib/mediapipe/loader";
import {
  mapToFaceLandmarks,
  FACE_IDX,
  FACE_LABELS,
  FACE_LANDMARK_KEYS,
  type FaceLandmarkKey,
  type LandmarkPoint as FaceLM,
} from "@/lib/mediapipe/faceMap";
import {
  extractBodyMeasurements,
  measureSideDepths,
  estimateSideHeight,
  POSE_IDX,
  POSE_LABELS,
  type PoseKey,
  type LandmarkPoint as BodyLM,
  type SideDepths,
} from "@/lib/mediapipe/bodyExtract";
import type { FaceLandmarks } from "@/lib/faceShape";
import type { BodyMeasurements } from "@/lib/bodyType";

type Status = "idle" | "loading-model" | "detecting" | "done" | "error";

const RANGES: Record<string, [number, number, string]> = {
  shoulderSlopeDeg: [8, 28, "°"],
  jointWidthIndex: [4.0, 7.5, ""],
  whtr: [0.35, 0.55, ""],
  thoraxFlat: [0.60, 0.85, ""],
  bhr: [0.82, 1.08, ""],
  bustHeight: [0.12, 0.25, ""],
  waistPos: [0.55, 0.70, ""],
  shoulderHipRatio: [1.0, 1.6, ""],
  chestMinusWaist_cm: [8, 30, "cm"],
  sittingHeightRatio: [48, 56, "%"],
  shoulderHeightRatio: [0.20, 0.30, ""],
};

function rangeTag(key: string, val: number) {
  const r = RANGES[key];
  if (!r) return null;
  const [lo, hi, unit] = r;
  const inRange = val >= lo && val <= hi;
  return (
    <span className={`ml-1 text-[10px] px-1 rounded ${inRange ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
      {inRange ? "OK" : "범위 밖"} ({lo}–{hi}{unit})
    </span>
  );
}

const SKELETON: [number, number][] = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24], [23, 25], [25, 27],
  [24, 26], [26, 28], [27, 29], [28, 30], [29, 31], [30, 32],
];

function drawPose(canvas: HTMLCanvasElement, img: HTMLImageElement, pose: BodyLM[]) {
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  ctx.strokeStyle = "rgba(0,255,128,0.6)";
  ctx.lineWidth = Math.max(2, canvas.width / 200);
  for (const [a, b] of SKELETON) {
    ctx.beginPath();
    ctx.moveTo(pose[a].x * canvas.width, pose[a].y * canvas.height);
    ctx.lineTo(pose[b].x * canvas.width, pose[b].y * canvas.height);
    ctx.stroke();
  }
  ctx.font = `bold ${Math.max(11, canvas.width / 55)}px sans-serif`;
  ctx.textBaseline = "bottom";
  for (const [key, idx] of Object.entries(POSE_IDX) as [PoseKey, number][]) {
    const lm = pose[idx];
    if (!lm) continue;
    const x = lm.x * canvas.width;
    const y = lm.y * canvas.height;
    const r = Math.max(4, canvas.width / 130);
    ctx.fillStyle = "#3b82f6";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2;
    ctx.strokeText(POSE_LABELS[key], x + r + 2, y - 2);
    ctx.fillText(POSE_LABELS[key], x + r + 2, y - 2);
  }
}

export default function TestPage() {
  const faceCanvasRef = useRef<HTMLCanvasElement>(null);
  const [faceStatus, setFaceStatus] = useState<Status>("idle");
  const [faceError, setFaceError] = useState("");
  const [faceLandmarks, setFaceLandmarks] = useState<FaceLandmarks | null>(null);
  const [faceRawCount, setFaceRawCount] = useState(0);

  const frontCanvasRef = useRef<HTMLCanvasElement>(null);
  const [frontStatus, setFrontStatus] = useState<Status>("idle");
  const [frontError, setFrontError] = useState("");
  const [frontPose, setFrontPose] = useState<BodyLM[] | null>(null);
  const [frontDims, setFrontDims] = useState<{ width: number; height: number } | null>(null);

  const sideCanvasRef = useRef<HTMLCanvasElement>(null);
  const [sideStatus, setSideStatus] = useState<Status>("idle");
  const [sideError, setSideError] = useState("");
  const [sideDims, setSideDims] = useState<{ width: number; height: number } | null>(null);
  const [sideData, setSideData] = useState<SideDepths | null>(null);

  // ── 실측 입력 ──
  const [heightCm, setHeightCm] = useState("");
  const [bustIn, setBustIn] = useState("");
  const [waistIn, setWaistIn] = useState("");
  const [hipIn, setHipIn] = useState("");

  const [bodyMeas, setBodyMeas] = useState<ReturnType<typeof extractBodyMeasurements> | null>(null);

  useEffect(() => {
    if (!frontPose || !frontDims) { setBodyMeas(null); return; }
    const h = parseFloat(heightCm) || undefined;
    const b = parseFloat(bustIn) || undefined;
    const w = parseFloat(waistIn) || undefined;
    const hp = parseFloat(hipIn) || undefined;
    setBodyMeas(
      extractBodyMeasurements(frontPose, {
        frontDims,
        sideDepths: sideData ?? undefined,
        heightCm: h,
        bustIn: b,
        waistIn: w,
        hipIn: hp,
      }),
    );
  }, [frontPose, frontDims, sideData, heightCm, bustIn, waistIn, hipIn]);

  // ── face ──
  const handleFace = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFaceError(""); setFaceLandmarks(null);
    const img = new Image();
    img.src = URL.createObjectURL(file);
    await new Promise((r) => { img.onload = r; });
    try {
      setFaceStatus("loading-model");
      const lm = await getFaceLandmarker();
      setFaceStatus("detecting");
      const res = lm.detect(img);
      if (!res.faceLandmarks?.length) { setFaceError("얼굴 미감지"); setFaceStatus("error"); return; }
      const mesh = res.faceLandmarks[0];
      setFaceRawCount(mesh.length);
      setFaceLandmarks(mapToFaceLandmarks(mesh, img.naturalWidth, img.naturalHeight));
      const c = faceCanvasRef.current!;
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      for (const l of mesh) { ctx.beginPath(); ctx.arc(l.x*c.width, l.y*c.height, 1.5, 0, Math.PI*2); ctx.fill(); }
      ctx.fillStyle = "#ef4444"; ctx.strokeStyle = "#fff"; ctx.lineWidth = 1;
      ctx.font = `bold ${Math.max(12, c.width/50)}px sans-serif`; ctx.textBaseline = "bottom";
      for (const key of FACE_LANDMARK_KEYS) {
        const idx = FACE_IDX[key]; const l = mesh[idx];
        const x = l.x*c.width, y = l.y*c.height, r = Math.max(4, c.width/120);
        ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill(); ctx.stroke();
        ctx.fillStyle="#fff"; ctx.strokeStyle="#000"; ctx.lineWidth=2;
        ctx.strokeText(FACE_LABELS[key],x+r+2,y-2); ctx.fillText(FACE_LABELS[key],x+r+2,y-2);
        ctx.fillStyle="#ef4444"; ctx.strokeStyle="#fff"; ctx.lineWidth=1;
      }
      setFaceStatus("done");
    } catch (err) { setFaceError(String(err)); setFaceStatus("error"); }
    finally { URL.revokeObjectURL(img.src); }
  }, []);

  // ── front ──
  const handleFront = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFrontError(""); setFrontPose(null);
    const img = new Image();
    img.src = URL.createObjectURL(file);
    await new Promise((r) => { img.onload = r; });
    try {
      setFrontStatus("loading-model");
      const lm = await getPoseLandmarker();
      setFrontStatus("detecting");
      const res = lm.detect(img);
      if (!res.landmarks?.length) { setFrontError("전신 미감지"); setFrontStatus("error"); return; }
      const pose = res.landmarks[0] as BodyLM[];
      setFrontPose(pose);
      setFrontDims({ width: img.naturalWidth, height: img.naturalHeight });
      drawPose(frontCanvasRef.current!, img, pose);
      setFrontStatus("done");
    } catch (err) { setFrontError(String(err)); setFrontStatus("error"); }
    finally { URL.revokeObjectURL(img.src); }
  }, []);

  // ── side: 실루엣 스캔으로 AP 깊이 측정 ──
  const handleSide = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSideError(""); setSideData(null);
    const img = new Image();
    img.src = URL.createObjectURL(file);
    await new Promise((r) => { img.onload = r; });
    try {
      setSideStatus("loading-model");
      const lm = await getPoseLandmarker();
      setSideStatus("detecting");
      const res = lm.detect(img);
      if (!res.landmarks?.length) { setSideError("전신 미감지"); setSideStatus("error"); return; }
      const pose = res.landmarks[0] as BodyLM[];
      const dims = { width: img.naturalWidth, height: img.naturalHeight };
      setSideDims(dims);

      // 실루엣 스캔: 원본 이미지에서 body 폭 측정 (annotation 전)
      const tmp = document.createElement("canvas");
      tmp.width = dims.width; tmp.height = dims.height;
      tmp.getContext("2d")!.drawImage(img, 0, 0);
      const depths = measureSideDepths(tmp, pose, dims);
      const personH = estimateSideHeight(pose, dims);
      setSideData({ ...depths, personHeight: personH });

      // 보이는 캔버스에 annotation
      drawPose(sideCanvasRef.current!, img, pose);
      setSideStatus("done");
    } catch (err) { setSideError(String(err)); setSideStatus("error"); }
    finally { URL.revokeObjectURL(img.src); }
  }, []);

  const badge = (s: Status) => {
    const map: Record<Status, [string, string]> = {
      idle: ["대기", "bg-zinc-200 text-zinc-600"],
      "loading-model": ["모델 로딩 중…", "bg-yellow-100 text-yellow-800 animate-pulse"],
      detecting: ["감지 중…", "bg-blue-100 text-blue-800 animate-pulse"],
      done: ["완료", "bg-green-100 text-green-800"],
      error: ["오류", "bg-red-100 text-red-800"],
    };
    const [label, cls] = map[s];
    return <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${cls}`}>{label}</span>;
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-10">
      <h1 className="text-2xl font-bold">MediaPipe 모듈 검증 (임시)</h1>

      {/* FACE */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">얼굴 — FaceLandmarker {badge(faceStatus)}</h2>
        <label className="block">
          <span className="text-sm text-zinc-500">얼굴 정면 사진</span>
          <input type="file" accept="image/*" onChange={handleFace}
            className="block mt-1 text-sm file:mr-3 file:px-3 file:py-1.5 file:rounded file:border-0 file:bg-zinc-800 file:text-white file:cursor-pointer"/>
        </label>
        {faceError && <p className="text-red-600 text-sm">{faceError}</p>}
        <div className="flex flex-col lg:flex-row gap-6">
          <canvas ref={faceCanvasRef} className="border border-zinc-300 rounded max-w-full" style={{maxHeight:480}}/>
          {faceLandmarks && (
            <div className="text-xs font-mono space-y-1 min-w-[260px]">
              <p className="text-zinc-500">raw: {faceRawCount}점 (좌표: px)</p>
              <p className="font-semibold mt-2 text-sm">FaceLandmarks:</p>
              {FACE_LANDMARK_KEYS.map((key) => {
                const p = faceLandmarks[key as keyof FaceLandmarks];
                return (<p key={key}><span className="text-red-600">{FACE_LABELS[key as FaceLandmarkKey]}</span>{" "}x={p.x.toFixed(1)} y={p.y.toFixed(1)}{p.z!=null&&<> z={p.z.toFixed(4)}</>}</p>);
              })}
            </div>
          )}
        </div>
      </section>

      {/* MEASUREMENTS INPUT */}
      <section className="space-y-3 p-4 border border-blue-200 rounded-lg bg-blue-50">
        <h2 className="text-sm font-semibold">실측 입력 (§4-bis)</h2>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            ["키 (cm)", heightCm, setHeightCm, "165"],
            ["가슴둘레 (inch)", bustIn, setBustIn, "33"],
            ["허리둘레 (inch)", waistIn, setWaistIn, "26"],
            ["엉덩이둘레 (inch)", hipIn, setHipIn, "36"],
          ].map(([label, val, setter, ph]) => (
            <label key={label as string} className="block text-xs">
              <span className="text-zinc-600">{label as string}</span>
              <input
                type="number"
                step="0.5"
                value={val as string}
                onChange={(e) => (setter as (v:string)=>void)(e.target.value)}
                placeholder={ph as string}
                className="block w-full mt-0.5 px-2 py-1 border-2 border-zinc-300 rounded bg-white text-black font-medium focus:border-black focus:outline-none text-sm"
              />
            </label>
          ))}
        </div>
        <p className="text-[11px] text-zinc-400">3사이즈는 inch로 입력. 내부에서 cm 변환 후 bhr·whtr·chestMinusWaist에 반영됩니다. 비우면 타원근사 폴백.</p>
      </section>

      {/* BODY */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">전신 — PoseLandmarker</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <h3 className="text-sm font-medium flex items-center gap-2">정면 {badge(frontStatus)}
              {frontDims && <span className="text-zinc-400 text-xs">{frontDims.width}×{frontDims.height}</span>}
            </h3>
            <input type="file" accept="image/*" onChange={handleFront}
              className="text-sm file:mr-3 file:px-3 file:py-1.5 file:rounded file:border-0 file:bg-zinc-800 file:text-white file:cursor-pointer"/>
            {frontError && <p className="text-red-600 text-sm">{frontError}</p>}
            <canvas ref={frontCanvasRef} className="border border-zinc-300 rounded w-full" style={{maxHeight:500}}/>
          </div>
          <div className="space-y-2">
            <h3 className="text-sm font-medium flex items-center gap-2">측면 {badge(sideStatus)}
              {sideDims && <span className="text-zinc-400 text-xs">{sideDims.width}×{sideDims.height}</span>}
            </h3>
            <input type="file" accept="image/*" onChange={handleSide}
              className="text-sm file:mr-3 file:px-3 file:py-1.5 file:rounded file:border-0 file:bg-zinc-800 file:text-white file:cursor-pointer"/>
            {sideError && <p className="text-red-600 text-sm">{sideError}</p>}
            <canvas ref={sideCanvasRef} className="border border-zinc-300 rounded w-full" style={{maxHeight:500}}/>
            {sideData && (
              <div className="text-xs font-mono text-zinc-500 p-2 bg-zinc-100 rounded">
                실루엣 스캔 AP 깊이 — chest: {sideData.chestAP.toFixed(0)}px, waist: {sideData.waistAP.toFixed(0)}px, hip: {sideData.hipAP.toFixed(0)}px
                <br/>인물 키: {sideData.personHeight.toFixed(0)}px
                <br/>키 대비 — chest: {(sideData.chestAP/sideData.personHeight).toFixed(3)}, hip: {(sideData.hipAP/sideData.personHeight).toFixed(3)}
              </div>
            )}
          </div>
        </div>

        {bodyMeas && (
          <div className="mt-4 p-4 border border-zinc-300 rounded-lg bg-white text-zinc-900">
            <h3 className="font-semibold text-sm mb-2">
              BodyMeasurements
              <span className={`ml-2 text-xs px-1.5 py-0.5 rounded ${bodyMeas.sideAvailable?"bg-green-100 text-green-800":"bg-amber-100 text-amber-800"}`}>
                측면: {bodyMeas.sideAvailable?"실루엣 스캔":"미적용 (기본비율)"}
              </span>
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-0.5 text-xs font-mono text-zinc-900">
              {Object.entries(bodyMeas.measurements).map(([k,v])=>(
                <p key={k}><span className="font-semibold text-blue-700">{k}</span>: {typeof v==="boolean"?(v?"true":"false"):Number(v).toFixed(4)}{typeof v==="number"&&rangeTag(k,v)}</p>
              ))}
            </div>
            {bodyMeas.pxPerCm && (
              <p className="mt-2 text-xs text-zinc-700">pxPerCm: {bodyMeas.pxPerCm.toFixed(2)}</p>
            )}
            {bodyMeas.crossValidation && (
              <div className="mt-2 text-xs p-2 bg-indigo-50 rounded text-indigo-900">
                <span className="font-semibold">교차검증</span>{" "}
                thoraxFlat(실루엣): {bodyMeas.measurements.thoraxFlat.toFixed(3)} /
                thoraxFlat(둘레역산): {bodyMeas.crossValidation.thoraxFlat_fromCirc?.toFixed(3) ?? "N/A"}
              </div>
            )}
            {bodyMeas.approximations.length>0&&(
              <div className="mt-3 text-xs text-zinc-800">
                <p className="font-semibold">근사 사항:</p>
                {bodyMeas.approximations.map((a,i)=>(<p key={i} className="text-amber-700">• {a}</p>))}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
