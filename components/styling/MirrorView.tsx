/**
 * MirrorView.tsx — 라이브 거울 React 래퍼.
 *
 * MirrorEngine(순수 엔진)을 캔버스에 연결 + 컨트롤 UI(색·불투명도·프리셋).
 * 웹캠 프레임은 전부 온디바이스 — 서버 전송 없음.
 */
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { MirrorEngine, DEFAULT_PARAMS, type MirrorParams, type MirrorStats } from "@/lib/ar/mirror/mirrorEngine";
import { looksForFace, presetToParams, type LookPreset } from "@/lib/ar/presets/looks";
import type { FaceShape } from "@/lib/faceShape";

const C = {
  panel: "#171a21",
  line: "#262b36",
  mut: "#9aa3b2",
  acc: "#3b82f6",
  text: "#e7e9ee",
};

// [r,g,b] 0-1 → hex
function toHex(rgb: [number, number, number]): string {
  return "#" + rgb.map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("");
}
function fromHex(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

interface Props {
  /** 결과 페이지에서 전달된 얼굴형 (프리셋 추천용). 없으면 계란형 기본 */
  faceShape?: FaceShape;
}

export function MirrorView({ faceShape = "계란형" }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<MirrorEngine | null>(null);
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState("");
  const [stats, setStats] = useState<MirrorStats>({ fps: 0, faceMs: 0, hairMs: 0 });
  const [params, setParams] = useState<MirrorParams>({ ...DEFAULT_PARAMS });
  const [activePreset, setActivePreset] = useState<string | null>(null);

  const { presets, hint } = looksForFace(faceShape);

  // 엔진 초기화 (canvas mount 후)
  useEffect(() => {
    if (!canvasRef.current) return;
    let engine: MirrorEngine;
    try {
      engine = new MirrorEngine(canvasRef.current);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      return;
    }
    engine.onStatsUpdate(setStats);
    engine.onErrorMessage(setErr);
    engineRef.current = engine;
    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  // params 변경 → 엔진 반영
  useEffect(() => {
    engineRef.current?.setParams(params);
  }, [params]);

  const start = useCallback(async () => {
    setErr("");
    await engineRef.current?.start({ width: 1280, height: 720 });
    setRunning(true);
  }, []);

  const stop = useCallback(() => {
    engineRef.current?.stop();
    setRunning(false);
  }, []);

  const applyPreset = useCallback((preset: LookPreset) => {
    const p = presetToParams(preset);
    setParams((prev) => ({ ...prev, ...p }));
    setActivePreset(preset.id);
  }, []);

  // 슬라이더 헬퍼
  const updateMakeup = (key: "lip" | "cheek" | "hair", field: "alpha" | "enabled" | "color", value: number | boolean | string) => {
    setParams((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        [field]: field === "color" ? fromHex(value as string) : value,
      },
    }));
    setActivePreset(null); // 수동 조정 시 프리셋 해제
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 16, alignItems: "start" }} className="mirror-layout">
      {/* 영상 스테이지 */}
      <div style={{ position: "relative", background: "#000", borderRadius: 14, overflow: "hidden", aspectRatio: "4/3", display: "grid", placeItems: "center" }}>
        <canvas ref={canvasRef} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        {running && (
          <div style={{ position: "absolute", top: 10, left: 10, background: "rgba(0,0,0,.6)", border: "1px solid #2a2f3a", borderRadius: 10, padding: "6px 10px", font: "12px ui-monospace, monospace", color: C.text }}>
            <span style={{ fontSize: 18, color: "#4ade80" }}>{stats.fps || "–"}</span> fps
          </div>
        )}
        {!running && (
          <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: C.mut, fontSize: 14, pointerEvents: "none" }}>
            🪞 거울을 시작하면 실시간 메이크업이 적용돼요
          </div>
        )}
      </div>

      {/* 컨트롤 패널 */}
      <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 14, padding: 16, color: C.text }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          {!running ? (
            <button onClick={start} style={btnStyle(C.acc)}>● 거울 시작</button>
          ) : (
            <button onClick={stop} style={btnStyle("#222834")}>정지</button>
          )}
        </div>

        {/* 추천 룩 프리셋 */}
        <div style={{ marginBottom: 14 }}>
          <Label>추천 룩 <span style={{ color: C.mut, fontWeight: 400 }}>({faceShape})</span></Label>
          <div style={{ fontSize: 11, color: C.mut, marginBottom: 8 }}>{hint}</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {presets.map((p) => (
              <button
                key={p.id}
                onClick={() => applyPreset(p)}
                title={p.desc}
                style={{
                  padding: "6px 12px",
                  borderRadius: 999,
                  border: activePreset === p.id ? `1.5px solid ${C.acc}` : `1px solid ${C.line}`,
                  background: activePreset === p.id ? `${C.acc}22` : "transparent",
                  color: C.text,
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>

        {/* 요소별 컨트롤 */}
        <MakeupControl label="립" mk={params.lip} onColor={(v) => updateMakeup("lip", "color", v)} onAlpha={(v) => updateMakeup("lip", "alpha", v)} onToggle={(v) => updateMakeup("lip", "enabled", v)} />
        <MakeupControl label="블러셔" mk={params.cheek} onColor={(v) => updateMakeup("cheek", "color", v)} onAlpha={(v) => updateMakeup("cheek", "alpha", v)} onToggle={(v) => updateMakeup("cheek", "enabled", v)} />
        <MakeupControl label="헤어색" mk={params.hair} onColor={(v) => updateMakeup("hair", "color", v)} onAlpha={(v) => updateMakeup("hair", "alpha", v)} onToggle={(v) => updateMakeup("hair", "enabled", v)} />

        {err && <div style={{ color: "#fca5a5", fontSize: 12, marginTop: 10 }}>{err}</div>}
        <p style={{ color: C.mut, fontSize: 11, lineHeight: 1.5, marginTop: 12 }}>
          📷 영상은 기기 안에서만 처리되며 어디에도 전송되지 않아요. (참고용)
        </p>
      </div>

      <style>{`@media(max-width:768px){.mirror-layout{grid-template-columns:1fr !important}}`}</style>
    </div>
  );
}

function MakeupControl({
  label,
  mk,
  onColor,
  onAlpha,
  onToggle,
}: {
  label: string;
  mk: MirrorParams["lip"];
  onColor: (v: string) => void;
  onAlpha: (v: number) => void;
  onToggle: (v: boolean) => void;
}) {
  return (
    <div style={{ marginBottom: 12, paddingBottom: 12, borderBottom: `1px solid ${C.line}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{label}</span>
        <input type="checkbox" checked={mk.enabled} onChange={(e) => onToggle(e.target.checked)} style={{ accentColor: C.acc }} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, opacity: mk.enabled ? 1 : 0.4 }}>
        <input type="color" value={toHex(mk.color)} onChange={(e) => onColor(e.target.value)} disabled={!mk.enabled} style={{ width: 32, height: 28, border: "none", borderRadius: 6, background: "none", cursor: "pointer" }} />
        <input type="range" min={0} max={1} step={0.05} value={mk.alpha} onChange={(e) => onAlpha(parseFloat(e.target.value))} disabled={!mk.enabled} style={{ flex: 1, accentColor: C.acc }} />
        <span style={{ fontSize: 11, color: C.mut, minWidth: 28 }}>{mk.alpha.toFixed(2)}</span>
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12, fontWeight: 700, color: C.mut, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 6 }}>{children}</div>;
}

function btnStyle(bg: string): React.CSSProperties {
  return { background: bg, color: "#fff", border: 0, borderRadius: 10, padding: "10px 16px", fontSize: 14, cursor: "pointer", flex: 1 };
}
