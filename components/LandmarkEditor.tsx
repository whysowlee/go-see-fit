"use client";

import { useCallback, useRef, useState } from "react";

const C = {
  white: "#FFFFFF",
  black: "#000000",
  gray: "#8C8C8C",
  accent: "#8BA3C6",
  indigo: "#1C2331",
  ash: "#6B829A",
} as const;

export interface LMHandle {
  id: string;
  x: number;
  y: number;
}

export interface LMGroup {
  n: number;
  label: string;
  handles: LMHandle[];
  connect?: boolean;
  autoLR?: boolean;
}

export interface GroupScheme {
  n: number;
  label: string;
  ids: string[];
  connect?: boolean;
  autoLR?: boolean;
}

const clamp = (v: number) => Math.min(1, Math.max(0, v));

export function buildGroups(
  scheme: GroupScheme[],
  coords: Record<string, { x: number; y: number }>,
): LMGroup[] {
  return scheme
    .map((g) => ({
      n: g.n,
      label: g.label,
      connect: g.connect,
      autoLR: g.autoLR,
      handles: g.ids
        .filter((id) => coords[id])
        .map((id) => ({ id, x: coords[id].x, y: coords[id].y })),
    }))
    .filter((g) => g.handles.length > 0);
}

export function groupsToCoords(
  groups: LMGroup[],
): Record<string, { x: number; y: number }> {
  const out: Record<string, { x: number; y: number }> = {};
  for (const g of groups) {
    if (g.autoLR && g.handles.length === 2) {
      const byX = [...g.handles].sort((a, b) => a.x - b.x);
      const Lid = g.handles.find((h) => h.id.endsWith("L"))?.id;
      const Rid = g.handles.find((h) => h.id.endsWith("R"))?.id;
      if (Lid && Rid) {
        out[Lid] = { x: byX[0].x, y: byX[0].y };
        out[Rid] = { x: byX[1].x, y: byX[1].y };
        continue;
      }
    }
    for (const h of g.handles) out[h.id] = { x: h.x, y: h.y };
  }
  return out;
}

interface Props {
  imageUrl: string;
  groups: LMGroup[];
  onChange: (groups: LMGroup[]) => void;
  onReextract?: () => void;
  onConfirm?: () => void;
  confirmLabel?: string;
  title?: string;
  dotRadius?: number;
  dotOpacity?: number;
}

export default function LandmarkEditor({
  imageUrl,
  groups,
  onChange,
  onReextract,
  onConfirm,
  confirmLabel = "확정 → 다음",
  title,
  dotRadius = 9,
  dotOpacity = 0.7,
}: Props) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [hoverN, setHoverN] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const r = dotRadius;
  const hit = Math.max(16, dotRadius * 2.2);
  const fz = Math.max(8, Math.round(dotRadius * 1.2));

  const moveTo = useCallback(
    (id: string, clientX: number, clientY: number) => {
      const box = boxRef.current?.getBoundingClientRect();
      if (!box) return;
      const x = clamp((clientX - box.left) / box.width);
      const y = clamp((clientY - box.top) / box.height);
      onChange(
        groups.map((g) => ({
          ...g,
          handles: g.handles.map((h) => (h.id === id ? { ...h, x, y } : h)),
        })),
      );
    },
    [groups, onChange],
  );

  const startDrag = (id: string) => (e: React.PointerEvent) => {
    e.preventDefault();
    const onMove = (ev: PointerEvent) => moveTo(id, ev.clientX, ev.clientY);
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const pct = (v: number) => `${v * 100}%`;

  return (
    <div style={{ background: C.white, color: C.black }}>
      {title && (
        <h3 style={{ color: C.indigo, fontWeight: 700, fontSize: 18, margin: "0 0 12px" }}>
          {title}
        </h3>
      )}

      <div style={{ maxWidth: 560, margin: "0 auto 6px", display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8 }}>
        <button onClick={() => setZoom((z) => Math.max(1, Math.round((z - 0.5) * 10) / 10))} style={{ width: 28, height: 28, borderRadius: 6, border: `1px solid ${C.ash}`, background: C.white, color: C.ash, fontSize: 16, lineHeight: 1, cursor: "pointer" }}>−</button>
        <span style={{ fontSize: 12, color: C.gray, minWidth: 30, textAlign: "center" }}>{zoom.toFixed(1)}x</span>
        <button onClick={() => setZoom((z) => Math.min(4, Math.round((z + 0.5) * 10) / 10))} style={{ width: 28, height: 28, borderRadius: 6, border: `1px solid ${C.ash}`, background: C.white, color: C.ash, fontSize: 16, lineHeight: 1, cursor: "pointer" }}>+</button>
      </div>

      <div style={{ width: "100%", maxWidth: 560, maxHeight: "70vh", overflow: "auto", border: "0.5px solid rgba(0,0,0,0.12)", borderRadius: 8, margin: "0 auto" }}>
      <div
        ref={boxRef}
        style={{
          position: "relative",
          width: `${zoom * 100}%`,
          userSelect: "none",
          touchAction: "none",
        }}
      >
        <img
          src={imageUrl}
          alt=""
          style={{ display: "block", width: "100%" }}
          draggable={false}
        />

        <svg
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            overflow: "visible",
          }}
        >
          {groups
            .filter((g) => g.connect && g.handles.length === 2)
            .map((g) => (
              <line
                key={`line-${g.n}`}
                x1={pct(g.handles[0].x)}
                y1={pct(g.handles[0].y)}
                x2={pct(g.handles[1].x)}
                y2={pct(g.handles[1].y)}
                stroke={C.ash}
                strokeWidth={1.5}
                strokeDasharray="4 4"
                opacity={0.7}
              />
            ))}

          {groups.flatMap((g) =>
            g.handles.map((h) => {
              const active = hoverN === g.n;
              return (
                <g
                  key={h.id}
                  style={{ cursor: "grab" }}
                  onPointerDown={startDrag(h.id)}
                  onPointerEnter={() => setHoverN(g.n)}
                  onPointerLeave={() => setHoverN((v) => (v === g.n ? null : v))}
                >
                  <circle cx={pct(h.x)} cy={pct(h.y)} r={hit} fill="transparent" />
                  <circle
                    cx={pct(h.x)}
                    cy={pct(h.y)}
                    r={r}
                    fill={active ? C.accent : C.indigo}
                    fillOpacity={dotOpacity}
                    stroke={C.white}
                    strokeWidth={1.5}
                    strokeOpacity={dotOpacity}
                  />
                  <text
                    x={pct(h.x)}
                    y={pct(h.y)}
                    fill={C.white}
                    fontSize={fz}
                    fontWeight={700}
                    textAnchor="middle"
                    dominantBaseline="central"
                    pointerEvents="none"
                  >
                    {g.n}
                  </text>
                </g>
              );
            }),
          )}
        </svg>
      </div>
      </div>

      <div style={{ maxWidth: 560, margin: "10px auto 14px" }}>
        <p style={{ color: C.black, fontSize: 13, margin: "0 0 4px", fontWeight: 500 }}>
          AI가 1차로 찍은 점입니다. 직접 세밀하게 조정해야 정확한 분석 결과를 얻을 수 있어요.
        </p>
        <p style={{ color: C.gray, fontSize: 12, margin: 0 }}>
          같은 번호의 좌·우 두 점은 자동으로 왼쪽·오른쪽이 구분됩니다.
        </p>
      </div>

      <div
        style={{
          maxWidth: 760,
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
          gap: "10px 18px",
          borderTop: `1px solid ${C.ash}`,
          paddingTop: 14,
        }}
      >
        {groups.map((g) => (
          <div
            key={g.n}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 8,
              opacity: hoverN && hoverN !== g.n ? 0.45 : 1,
              transition: "opacity 0.15s",
            }}
            onMouseEnter={() => setHoverN(g.n)}
            onMouseLeave={() => setHoverN((v) => (v === g.n ? null : v))}
          >
            <span
              style={{
                flex: "0 0 auto",
                width: 22,
                height: 22,
                borderRadius: "50%",
                background: C.indigo,
                color: C.white,
                fontSize: 11,
                fontWeight: 700,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                marginTop: 1,
              }}
            >
              {g.n}
            </span>
            <span style={{ color: C.black, fontSize: 13, lineHeight: 1.4 }}>
              {g.label}
            </span>
          </div>
        ))}
      </div>

      <div
        style={{
          display: "flex",
          gap: 10,
          marginTop: 18,
          maxWidth: 760,
          marginLeft: "auto",
          marginRight: "auto",
        }}
      >
        {onReextract && (
          <button
            onClick={onReextract}
            style={{
              padding: "10px 16px",
              borderRadius: 8,
              border: `1px solid ${C.ash}`,
              background: C.white,
              color: C.ash,
              fontWeight: 600,
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            다시 추출
          </button>
        )}
        {onConfirm && (
          <button
            onClick={onConfirm}
            style={{
              padding: "10px 20px",
              borderRadius: 8,
              border: "none",
              background: C.black,
              color: C.white,
              fontWeight: 700,
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            {confirmLabel}
          </button>
        )}
      </div>
    </div>
  );
}

// ── 그룹 스킴 ──

export const FACE_GROUPS: GroupScheme[] = [
  { n: 1, label: "이마 맨 위 — 머리카락 시작점 가운데", ids: ["foreheadTop"] },
  { n: 2, label: "턱 끝 — 얼굴 맨 아래 가운데", ids: ["menton"] },
  { n: 3, label: "양쪽 이마 옆 — 눈썹 바깥 쪽 가장자리", ids: ["templeL", "templeR"], connect: true, autoLR: true },
  { n: 4, label: "양쪽 광대 — 옆으로 가장 튀어나온 곳", ids: ["zygoL", "zygoR"], connect: true, autoLR: true },
  { n: 5, label: "양쪽 턱 모서리 — 귀 아래 턱선이 꺾이는 곳", ids: ["gonionL", "gonionR"], connect: true, autoLR: true },
  { n: 6, label: "양쪽 눈썹 안쪽 끝 — 코 옆 시작점", ids: ["browInnerL", "browInnerR"], connect: true, autoLR: true },
  { n: 7, label: "양쪽 눈썹에서 가장 높은 곳", ids: ["browPeakL", "browPeakR"], connect: true, autoLR: true },
  { n: 8, label: "콧대 시작점 — 두 눈 사이 가장 들어간 곳", ids: ["sellion"] },
  { n: 9, label: "코 끝", ids: ["noseTip"] },
];

export const BODY_FRONT_GROUPS: GroupScheme[] = [
  { n: 1, label: "정수리 — 머리(머리카락 포함) 가장 높은 점", ids: ["crown"] },
  { n: 2, label: "양쪽 발뒤꿈치 — 바닥에 닿는 뒤꿈치 끝", ids: ["heelL", "heelR"], connect: true, autoLR: true },
  { n: 3, label: "양쪽 어깨 끝 — 팔이 시작되는 어깨 맨 바깥", ids: ["acromionL", "acromionR"], connect: true, autoLR: true },
  { n: 4, label: "양쪽 목 아래 — 목이 끝나고 어깨가 시작되는 곳", ids: ["neckBaseL", "neckBaseR"], connect: true, autoLR: true },
  { n: 5, label: "양쪽 목 옆선 — 목에서 가장 굵은 부분", ids: ["neckL", "neckR"], connect: true, autoLR: true },
  { n: 6, label: "양쪽 가슴 옆 — 겨드랑이 아래 가장 넓은 곳", ids: ["chestL", "chestR"], connect: true, autoLR: true },
  { n: 7, label: "양쪽 허리 — 몸통에서 가장 잘록한 곳", ids: ["waistL", "waistR"], connect: true, autoLR: true },
  { n: 8, label: "양쪽 골반 — 엉덩이에서 옆으로 가장 튀어나온 곳", ids: ["hipL", "hipR"], connect: true, autoLR: true },
  { n: 9, label: "양쪽 팔꿈치 — 가장 도드라진 뼈", ids: ["elbowL", "elbowR"], connect: true, autoLR: true },
  { n: 10, label: "양쪽 무릎 — 무릎 옆 튀어나온 곳", ids: ["kneeL", "kneeR"], connect: true, autoLR: true },
  { n: 11, label: "사타구니 — 두 다리가 갈라지는 곳", ids: ["crotch"] },
];

export const BODY_SIDE_GROUPS: GroupScheme[] = [
  { n: 12, label: "정수리 — 옆에서 본 머리(머리카락 포함) 가장 높은 점", ids: ["crownSide"] },
  { n: 13, label: "발뒤꿈치 — 옆에서 본 뒤꿈치가 바닥에 닿는 점", ids: ["heelSide"] },
  { n: 14, label: "가슴에서 가장 앞으로 나온 곳", ids: ["chestFront"] },
  { n: 15, label: "등에서 가장 뒤로 나온 곳", ids: ["chestBack"] },
  { n: 16, label: "옆에서 본 허리 — 배 쪽(앞)이 가장 들어간 곳", ids: ["waistLowSide"] },
  { n: 17, label: "엉덩이에서 가장 뒤로 나온 곳", ids: ["hipBack"] },
];
