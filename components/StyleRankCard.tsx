/**
 * StyleRankCard.tsx — 의류 요소별 다차원 추천 순위 카드.
 *
 * lib/styleScore.ts 의 카테고리별(상의 핏·기장·소재·하의 핏) 점수를
 * 각각 순위로 표시. NecklineRankCard와 동일 디자인 언어.
 */
"use client";

import type { StyleCategory, StyleScore } from "@/lib/styleScore";

const C = {
  cardBg: "#ffffff",
  border: "#e5e5e5",
  indigo: "#2d2466",
  black: "#1a1a1a",
  gray: "#888",
};

const VERDICT_COLOR: Record<StyleScore["verdict"], string> = {
  "강력 추천": "#2d8a2d",
  추천: "#5cae5c",
  보통: "#888",
  주의: "#d4a017",
  비추천: "#c0392b",
};

const AXIS_ICON: Record<string, string> = {
  골격: "🦴",
  외곽선: "👗",
  비율: "📏",
  프레임: "🔲",
};

export function StyleRankCard({ categories }: { categories: StyleCategory[] }) {
  if (categories.length === 0) return null;

  return (
    <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 10, padding: "16px 18px", marginTop: 16 }}>
      <h3 style={{ fontSize: 14, fontWeight: 700, color: C.indigo, marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
        🧥 옷 요소별 종합 추천 순위
      </h3>
      <div style={{ fontSize: 11, color: C.gray, marginBottom: 14 }}>
        골격 + 외곽선 + 비율을 종합한 점수순. 요소마다 영향 받는 축이 달라요.
      </div>

      {categories.map((cat) => (
        <div key={cat.key} style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.black, marginBottom: 8, paddingBottom: 4, borderBottom: `2px solid ${C.indigo}22` }}>
            {cat.title}
          </div>
          {cat.scores.map((s, i) => {
            const vc = VERDICT_COLOR[s.verdict];
            return (
              <div key={s.item} style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: C.gray, minWidth: 14 }}>{i + 1}</span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: C.black }}>{s.item}</span>
                    <span style={{ fontSize: 10, fontWeight: 600, color: vc, background: `${vc}15`, padding: "1px 7px", borderRadius: 999 }}>
                      {s.verdict}
                    </span>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: vc }}>
                    {s.total > 0 ? "+" : ""}{s.total.toFixed(1)}
                  </span>
                </div>
                <div style={{ marginTop: 3 }}>
                  {s.contributions.map((c, j) => (
                    <div key={j} style={{ fontSize: 11, color: "#555", marginTop: 2, display: "flex", gap: 6 }}>
                      <span style={{ minWidth: 64, color: C.gray }}>
                        {AXIS_ICON[c.axis]} {c.axis} <strong style={{ color: c.score > 0 ? "#2d8a2d" : c.score < 0 ? "#c0392b" : C.gray }}>{c.score > 0 ? "+" : ""}{c.score}</strong>
                      </span>
                      <span style={{ flex: 1 }}>{c.reason}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ))}

      <p style={{ fontSize: 10, color: C.gray }}>
        점수 = 골격(상체 라인) + 외곽선(둘레 비율) + 비율(다리 길이) 합산. 참고용.
      </p>
    </div>
  );
}
