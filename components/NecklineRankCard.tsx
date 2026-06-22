/**
 * NecklineRankCard.tsx — 넥라인 종합 추천 순위 카드.
 *
 * 1차 피드백: "점수순 순위 나열 + 얼굴형/체형/퍼스널컬러 종합 + 자세한 설명"
 * lib/necklineScore.ts 의 점수를 순위로 표시하고, 각 넥라인의 축별 기여를 분해.
 */
"use client";

import type { NecklineScore } from "@/lib/necklineScore";

const C = {
  cardBg: "#ffffff",
  border: "#e5e5e5",
  indigo: "#2d2466",
  black: "#1a1a1a",
  gray: "#888",
  tint: "#f7f5ff",
};

const VERDICT_COLOR: Record<NecklineScore["verdict"], string> = {
  "강력 추천": "#2d8a2d",
  추천: "#5cae5c",
  보통: "#888",
  주의: "#d4a017",
  비추천: "#c0392b",
};

const AXIS_ICON: Record<string, string> = {
  얼굴형: "🎭",
  골격: "🦴",
  퍼스널컬러: "🎨",
};

export function NecklineRankCard({ scores }: { scores: NecklineScore[] }) {
  if (scores.length === 0) return null;
  const max = Math.max(...scores.map((s) => Math.abs(s.total)), 1);

  return (
    <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 10, padding: "16px 18px", marginTop: 16 }}>
      <h3 style={{ fontSize: 14, fontWeight: 700, color: C.indigo, marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
        👔 넥라인 종합 추천 순위
      </h3>
      <div style={{ fontSize: 11, color: C.gray, marginBottom: 12 }}>
        얼굴형 + 골격 + 퍼스널컬러를 종합한 점수순. 같은 넥라인도 세 요소가 복합적으로 작용해요.
      </div>

      {scores.map((s, i) => {
        const barWidth = Math.max(4, (Math.abs(s.total) / max) * 100);
        const vc = VERDICT_COLOR[s.verdict];
        return (
          <div key={s.neckline} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: i < scores.length - 1 ? "1px dashed #eee" : "none" }}>
            {/* 헤더: 순위 + 넥라인 + 종합 점수 + 판정 */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: C.gray, minWidth: 18 }}>{i + 1}</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: C.black }}>{s.neckline}</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: vc, background: `${vc}15`, padding: "2px 8px", borderRadius: 999 }}>
                  {s.verdict}
                </span>
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: vc }}>
                {s.total > 0 ? "+" : ""}{s.total.toFixed(1)}점
              </span>
            </div>

            {/* 점수 막대 */}
            <div style={{ marginTop: 6, height: 6, background: "#f0f0f0", borderRadius: 3, overflow: "hidden" }}>
              <div style={{ width: `${barWidth}%`, height: "100%", background: vc, borderRadius: 3 }} />
            </div>

            {/* 축별 기여 분해 */}
            <div style={{ marginTop: 8 }}>
              {s.contributions.map((c, j) => (
                <div key={j} style={{ fontSize: 11, color: "#555", marginTop: 3, display: "flex", gap: 6 }}>
                  <span style={{ minWidth: 80, color: C.gray }}>
                    {AXIS_ICON[c.axis]} {c.axis} <strong style={{ color: c.score > 0 ? "#2d8a2d" : c.score < 0 ? "#c0392b" : C.gray }}>{c.score > 0 ? "+" : ""}{c.score}</strong>
                  </span>
                  <span style={{ flex: 1 }}>{c.reason}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      <p style={{ fontSize: 10, color: C.gray, marginTop: 6 }}>
        점수 = 얼굴형(시각 보정) + 골격(상체 라인) + 퍼스널컬러(피부 노출 톤) 합산. 참고용.
      </p>
    </div>
  );
}
