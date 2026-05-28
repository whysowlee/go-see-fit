"use client";

/**
 * ImageCropper — 고정 비율 CropRect
 *
 * 프레임(회색 박스)은 target aspect 비율로 고정.
 * 이미지는 contain으로 프레임 안에 표시 (남는 영역 = 흰 패딩).
 * 크롭 박스는 프레임 전체를 기준으로 0~1 정규화 — 이미지 밖(패딩 영역)도 포함.
 * → 세로 긴 이미지에서 전체 선택하면 양옆 흰 패딩이 자연스럽게 포함됨.
 * cropImage가 프레임 기준으로 출력하므로 패딩 영역은 흰색으로 채워짐.
 */
import { useRef, useState, useEffect } from "react";

const C = { white: "#FFFFFF", black: "#000000", gray: "#8C8C8C", accent: "#8BA3C6", indigo: "#1C2331", ash: "#6B829A" } as const;

export const FACE_ASPECT = 3 / 4;
export const BODY_ASPECT = 9 / 16;

export interface CropRect { x: number; y: number; w: number; h: number }

interface Props {
  imageUrl: string;
  aspect: number;
  value?: CropRect;
  onChange: (c: CropRect) => void;
  onReplace?: () => void;
  title?: string;
}

type Corner = "nw" | "ne" | "sw" | "se";

export default function ImageCropper({ imageUrl, aspect, value, onChange, onReplace, title }: Props) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [imgAR, setImgAR] = useState(0);
  const [crop, setCrop] = useState<CropRect | null>(value ?? null);

  // 프레임 안에서의 이미지 contain 위치 (0~1 프레임 기준)
  const frameAR = aspect; // w/h
  const imgContain = imgAR > 0 ? (() => {
    if (imgAR >= frameAR) {
      const h = frameAR / imgAR;
      return { x: 0, y: (1 - h) / 2, w: 1, h };
    } else {
      const w = imgAR / frameAR;
      return { x: (1 - w) / 2, y: 0, w, h: 1 };
    }
  })() : { x: 0, y: 0, w: 1, h: 1 };

  const set = (c: CropRect) => { setCrop(c); onChange(c); };

  const onImgLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const ar = e.currentTarget.naturalWidth / e.currentTarget.naturalHeight;
    setImgAR(ar);
    if (!crop) set({ x: 0, y: 0, w: 1, h: 1 });
  };

  useEffect(() => {
    if (imgAR > 0 && !value && !crop) set({ x: 0, y: 0, w: 1, h: 1 });
  }, [imgAR]);

  const getRect = () => frameRef.current?.getBoundingClientRect();

  // 크롭 박스는 프레임(0~1) 안에서만 이동
  const clamp = (v: number) => Math.max(0, Math.min(1, v));

  const startMove = (e: React.PointerEvent) => {
    if (!crop) return;
    e.preventDefault();
    const r = getRect(); if (!r) return;
    const sx = e.clientX, sy = e.clientY, c0 = { ...crop };
    const onMove = (ev: PointerEvent) => {
      const dx = (ev.clientX - sx) / r.width;
      const dy = (ev.clientY - sy) / r.height;
      set({ ...c0, x: Math.max(0, Math.min(1 - c0.w, c0.x + dx)), y: Math.max(0, Math.min(1 - c0.h, c0.y + dy)) });
    };
    const onUp = () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); };
    window.addEventListener("pointermove", onMove); window.addEventListener("pointerup", onUp);
  };

  const startResize = (corner: Corner) => (e: React.PointerEvent) => {
    if (!crop) return;
    e.preventDefault(); e.stopPropagation();
    const r = getRect(); if (!r) return;
    const anchor = {
      x: corner === "nw" || corner === "sw" ? crop.x + crop.w : crop.x,
      y: corner === "nw" || corner === "ne" ? crop.y + crop.h : crop.y,
    };
    // 크롭 박스의 비율 = 1:1 (프레임 자체가 이미 target aspect)
    const onMove = (ev: PointerEvent) => {
      const px = clamp((ev.clientX - r.left) / r.width);
      const py = clamp((ev.clientY - r.top) / r.height);
      let w = Math.abs(px - anchor.x);
      let h = Math.abs(py - anchor.y);
      // 정사각 비율 (프레임 기준, 프레임이 이미 target aspect)
      const side = Math.max(w, h);
      w = side; h = side;
      const minS = 0.15;
      if (w < minS) { w = minS; h = minS; }

      let x = corner === "nw" || corner === "sw" ? anchor.x - w : anchor.x;
      let y = corner === "nw" || corner === "ne" ? anchor.y - h : anchor.y;

      // 프레임 안으로 클램프
      if (x < 0) { w += x; h = w; x = 0; }
      if (y < 0) { h += y; w = h; y = 0; }
      if (x + w > 1) { w = 1 - x; h = w; }
      if (y + h > 1) { h = 1 - y; w = h; }
      if (w < minS) return;

      set({ x, y, w, h });
    };
    const onUp = () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); };
    window.addEventListener("pointermove", onMove); window.addEventListener("pointerup", onUp);
  };

  const pct = (v: number) => `${v * 100}%`;
  const handle = (corner: Corner, pos: React.CSSProperties): React.CSSProperties => ({
    position: "absolute", width: 16, height: 16, background: C.white, border: `2px solid ${C.indigo}`, borderRadius: 3, zIndex: 2, ...pos,
    cursor: corner === "nw" || corner === "se" ? "nwse-resize" : "nesw-resize", touchAction: "none",
  });

  return (
    <div style={{ maxWidth: 420, margin: "0 auto" }}>
      {title && <h3 style={{ color: C.indigo, fontWeight: 700, fontSize: 14, margin: "0 0 10px" }}>{title}</h3>}

      {/* 프레임: target aspect 비율 고정, 흰 배경 */}
      <div ref={frameRef} style={{
        position: "relative", width: "100%", aspectRatio: `${aspect}`,
        background: C.white, overflow: "hidden", borderRadius: 8,
        border: "0.5px solid rgba(0,0,0,0.12)", userSelect: "none", touchAction: "none",
      }}>
        {/* 이미지: contain으로 프레임 안에 */}
        <img
          src={imageUrl} alt="" onLoad={onImgLoad} draggable={false}
          style={{
            position: "absolute",
            left: pct(imgContain.x), top: pct(imgContain.y),
            width: pct(imgContain.w), height: pct(imgContain.h),
            objectFit: "fill",
          }}
        />

        {/* 크롭 박스 */}
        {crop && (
          <div
            onPointerDown={startMove}
            style={{
              position: "absolute", left: pct(crop.x), top: pct(crop.y), width: pct(crop.w), height: pct(crop.h),
              boxShadow: "0 0 0 9999px rgba(0,0,0,0.4)", border: `1.5px solid ${C.white}`, cursor: "move", touchAction: "none",
            }}
          >
            <div style={{ position: "absolute", inset: 0, backgroundImage: `linear-gradient(${C.white} 1px, transparent 1px), linear-gradient(90deg, ${C.white} 1px, transparent 1px)`, backgroundSize: "33.33% 33.33%", opacity: 0.25, pointerEvents: "none" }} />
            <div onPointerDown={startResize("nw")} style={handle("nw", { left: -8, top: -8 })} />
            <div onPointerDown={startResize("ne")} style={handle("ne", { right: -8, top: -8 })} />
            <div onPointerDown={startResize("sw")} style={handle("sw", { left: -8, bottom: -8 })} />
            <div onPointerDown={startResize("se")} style={handle("se", { right: -8, bottom: -8 })} />
          </div>
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 8 }}>
        <button onClick={() => set({ x: 0, y: 0, w: 1, h: 1 })} style={{ padding: "6px 12px", borderRadius: 6, border: `1px solid ${C.ash}`, background: C.white, color: C.ash, fontSize: 12, cursor: "pointer" }}>전체 선택</button>
        {onReplace && (
          <button onClick={onReplace} style={{ padding: "6px 12px", borderRadius: 6, border: `1px solid ${C.ash}`, background: C.white, color: C.ash, fontSize: 12, cursor: "pointer" }}>사진 교체</button>
        )}
      </div>
      <p style={{ color: C.gray, fontSize: 12, margin: "8px 0 0", textAlign: "center" }}>
        박스를 움직이거나 모서리를 줄여 영역을 맞춰주세요. 이미지 밖 영역은 흰색으로 채워집니다.
      </p>
    </div>
  );
}

/**
 * 프레임 기준 CropRect → 고정비율 출력.
 * 프레임 = target aspect, 이미지는 contain으로 배치.
 * 크롭 박스가 이미지 밖이면 흰배경.
 */
export async function cropImage(imageUrl: string, aspect: number, crop: CropRect, outWidth = 1080): Promise<string> {
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image(); i.crossOrigin = "anonymous"; i.onload = () => res(i); i.onerror = rej; i.src = imageUrl;
  });

  const outHeight = Math.round(outWidth / aspect);
  const canvas = document.createElement("canvas");
  canvas.width = outWidth; canvas.height = outHeight;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, outWidth, outHeight);

  // 프레임 안 이미지 contain 위치
  const imgAR = img.naturalWidth / img.naturalHeight;
  const frameAR = aspect;
  let imgX: number, imgY: number, imgW: number, imgH: number;
  if (imgAR >= frameAR) {
    imgW = outWidth; imgH = outWidth / imgAR;
    imgX = 0; imgY = (outHeight - imgH) / 2;
  } else {
    imgH = outHeight; imgW = outHeight * imgAR;
    imgX = (outWidth - imgW) / 2; imgY = 0;
  }

  // 크롭 영역 (프레임 기준 px)
  const cx = crop.x * outWidth, cy = crop.y * outHeight;
  const cw = crop.w * outWidth, ch = crop.h * outHeight;

  // 임시 캔버스에 프레임 전체 렌더 (흰배경 + contain 이미지)
  const tmp = document.createElement("canvas");
  tmp.width = outWidth; tmp.height = outHeight;
  const tctx = tmp.getContext("2d")!;
  tctx.fillStyle = "#FFFFFF";
  tctx.fillRect(0, 0, outWidth, outHeight);
  tctx.drawImage(img, imgX, imgY, imgW, imgH);

  // 크롭 영역만 잘라서 출력 캔버스에 fit
  ctx.drawImage(tmp, cx, cy, cw, ch, 0, 0, outWidth, outHeight);
  return canvas.toDataURL("image/jpeg", 0.92);
}
