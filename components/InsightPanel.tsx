/**
 * InsightPanel.tsx — 분류 결과의 "정의 + 산출 근거 + 본인 위치" 통일 표시 패널.
 *
 * lib/insights.ts 의 Insight 객체를 받아 카드로 표시.
 * 다른 세션이 ResultBodyTab/ResultFaceTab 레이아웃을 작업 중이라
 * 이 컴포넌트는 *별도 카드*로 result/page.tsx에서 배치됨.
 *
 * 사용:
 *   <InsightPanel title="🦴 골격: 웨이브" insight={skelInsight} />
 */
"use client";

import type { Insight } from "@/lib/insights";

const C = {
  cardBg: "#ffffff",
  border: "#e5e5e5",
  indigo: "#2d2466",
  black: "#1a1a1a",
  gray: "#888",
  tint: "#f7f5ff",
  positive: "#2d8a2d",
  warm: "#d4a017",
  cool: "#1976d2",
  neutral: "#888",
};

interface Props {
  /** 카드 제목 — 예: "🦴 골격: 웨이브" */
  title: string;
  insight: Insight;
  /** 카드 하위 라벨 컬러 (선택) */
  accent?: string;
}

export function InsightPanel({ title, insight, accent }: Props) {
  const accentColor = accent ?? C.indigo;
  return (
    <div
      style={{
        background: C.cardBg,
        border: `1px solid ${C.border}`,
        borderRadius: 10,
        padding: "16px 18px",
        marginTop: 16,
      }}
    >
      <h3
        style={{
          fontSize: 14,
          fontWeight: 700,
          color: accentColor,
          marginBottom: 10,
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        {title}
      </h3>

      {/* 정의 */}
      <Section title="이게 무엇인가?">
        <div style={{ color: "#444" }}>{insight.what}</div>
      </Section>

      {/* 산출 근거 */}
      <Section title="왜 이 분류인가?">
        {insight.reasoning.map((r, i) => (
          <div
            key={i}
            style={{
              marginTop: 6,
              padding: "8px 10px",
              background: C.tint,
              borderRadius: 6,
              fontSize: 12,
              lineHeight: 1.5,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <span style={{ fontWeight: 600, color: C.black }}>
                {r.label}
                {r.unit ? <span style={{ color: C.gray, fontWeight: 400 }}> ({r.unit})</span> : null}
              </span>
              <span style={{ color: zColor(r.z), fontWeight: 500 }}>{r.direction}</span>
            </div>
            <div style={{ color: C.gray, marginTop: 2, fontSize: 11 }}>
              본인 값: <strong style={{ color: C.black }}>{formatNum(r.value, r.unit)}</strong>
              {r.note ? <> · {r.note}</> : null}
            </div>
          </div>
        ))}
      </Section>

      {/* 본인 위치 */}
      <Section title="본인 위치">
        <div
          style={{
            padding: "8px 10px",
            background: `linear-gradient(90deg, #fff3e0 0%, ${C.tint} 100%)`,
            borderRadius: 6,
            color: C.black,
            fontWeight: 500,
          }}
        >
          📍 {insight.position}
        </div>
        {insight.koreanFreq ? (
          <div style={{ fontSize: 11, color: C.gray, marginTop: 4 }}>{insight.koreanFreq}</div>
        ) : null}
      </Section>
    </div>
  );
}

/* ── 헬퍼 ── */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 10, fontSize: 12, color: "#333", lineHeight: 1.6 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: C.black, marginBottom: 4 }}>{title}</div>
      {children}
    </div>
  );
}

function zColor(z: number): string {
  if (z > 0.5) return "#c0392b"; // 평균보다 큼 — 빨강
  if (z < -0.5) return "#1976d2"; // 평균보다 작음 — 파랑
  return "#888"; // 평균 부근 — 회색
}

function formatNum(v: number, unit?: string): string {
  if (v === 0) return "—";
  const decimals = unit === "°" ? 1 : Math.abs(v) >= 10 ? 1 : 2;
  return v.toFixed(decimals) + (unit ?? "");
}
