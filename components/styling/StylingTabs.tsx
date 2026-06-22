/**
 * StylingTabs.tsx — 스타일링 페이지 탭 셸 (거울 / 트윈).
 */
"use client";

import { useState } from "react";
import { MirrorView } from "./MirrorView";
import { TwinPlaceholder } from "./TwinPlaceholder";
import type { FaceShape } from "@/lib/faceShape";

type Tab = "mirror" | "twin";

export function StylingTabs({ faceShape }: { faceShape?: FaceShape }) {
  const [tab, setTab] = useState<Tab>("mirror");

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <TabButton active={tab === "mirror"} onClick={() => setTab("mirror")}>🪞 거울</TabButton>
        <TabButton active={tab === "twin"} onClick={() => setTab("twin")}>🧍 트윈</TabButton>
      </div>
      {tab === "mirror" ? <MirrorView faceShape={faceShape} /> : <TwinPlaceholder />}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "8px 16px",
        borderRadius: 10,
        border: active ? "1.5px solid #3b82f6" : "1px solid #ddd",
        background: active ? "#3b82f622" : "#fff",
        color: active ? "#2d2466" : "#888",
        fontSize: 14,
        fontWeight: active ? 700 : 400,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}
