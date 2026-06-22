/**
 * TwinPlaceholder.tsx — 디지털 트윈 탭 (준비 중).
 * mr_BUILD_PLAN.md Track B: 상업용 파라메트릭 바디 모델 + 옷 glTF 확보 시 재개.
 */
"use client";

export function TwinPlaceholder() {
  return (
    <div
      style={{
        minHeight: 400,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        color: "#888",
        textAlign: "center",
        padding: 40,
      }}
    >
      <div style={{ fontSize: 48 }}>🧍</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: "#555" }}>디지털 트윈 — 준비 중</div>
      <div style={{ fontSize: 13, lineHeight: 1.6, maxWidth: 320 }}>
        체형 수치를 3D 마네킹에 반영하고 옷을 입혀보는 기능을 준비하고 있어요.
        <br />
        (파라메트릭 바디 모델 + 의상 에셋 작업 중)
      </div>
    </div>
  );
}
