/**
 * app/styling/page.tsx — 가상 스타일링 (라이브 거울 + 디지털 트윈 placeholder).
 *
 * result에서 분류된 얼굴형을 읽어 거울 프리셋 추천에 사용.
 * 분류 결과는 store의 landmarks.faceMapped에서 classifyFaceShape로 재계산
 * (lib/* 읽기 전용 — import해서 호출만).
 */
"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/lib/store";
import { classifyFaceShape } from "@/lib/faceShape";
import { StylingTabs } from "@/components/styling/StylingTabs";

const C = { white: "#faf9f7", black: "#1a1a1a", ash: "#888", indigo: "#2d2466" };

export default function StylingPage() {
  const router = useRouter();
  const { state } = useApp();
  const lm = state.landmarks;

  // 얼굴형 재계산 (store에 분류 결과 미저장 → faceMapped에서 직접)
  const faceShape = useMemo(() => {
    if (!lm?.faceMapped) return undefined;
    try {
      return classifyFaceShape(lm.faceMapped).primary;
    } catch {
      return undefined;
    }
  }, [lm]);

  return (
    <div style={{ minHeight: "100vh", background: C.white }}>
      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "20px 16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: C.indigo, margin: 0 }}>🪞 가상 스타일링</h1>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            {lm && (
              <button onClick={() => router.push("/result")} style={{ color: C.black, fontSize: 13, background: "#fff", border: `1px solid ${C.ash}`, borderRadius: 6, padding: "5px 10px", cursor: "pointer" }}>
                ← 결과로
              </button>
            )}
            <button onClick={() => router.push("/")} style={{ color: C.ash, fontSize: 13, background: "none", border: "none", cursor: "pointer" }}>
              처음부터
            </button>
          </div>
        </div>

        {!lm && (
          <div style={{ fontSize: 13, color: C.ash, marginBottom: 16, padding: "10px 12px", background: "#fff3e0", borderRadius: 8 }}>
            얼굴형 분석을 먼저 하면 맞춤 추천 룩이 제공돼요. (지금은 기본 프리셋으로 진행)
          </div>
        )}

        <StylingTabs faceShape={faceShape} />
      </div>
    </div>
  );
}
