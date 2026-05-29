"use client";

import { useState } from "react";

const C = {
  white: "#FFFFFF", black: "#000000", gray: "#8C8C8C",
  accent: "#8BA3C6", indigo: "#1C2331", ash: "#6B829A",
  track: "#ECEFF3", line05: "rgba(0,0,0,0.12)", tint: "rgba(139,163,198,0.12)", red: "#E5484D",
  recInk: "#2E7D50", recBg: "rgba(46,125,80,0.08)", recBorder: "rgba(46,125,80,0.35)",
  avoidInk: "#C0473F", avoidBg: "rgba(197,72,63,0.07)", avoidBorder: "rgba(197,72,63,0.30)",
} as const;

export interface BodyPoint { id: string; x: number; y: number }
export interface SoftScore { label: string; score: number }
export interface DiagItem { name: string; value: string; badge?: string }
export interface Chip { label: string; group?: string; category?: "garment" | "hair" | "makeup" }
export interface BodyResultData {
  photoUrl: string;
  fittingUrl?: string;
  points: BodyPoint[];
  soft: SoftScore[];
  detail: { silhouette: string; proportion: string; frame: string };
  diagnosis: DiagItem[];
  posingTip: string;
  recommend: Chip[];
  avoid: Chip[];
  selectedDefault?: string[];
}

export type VFStatusUI = "idle" | "ready" | "generating" | "generated" | "stale" | "error";
export interface VFControlProps {
  status: VFStatusUI;
  sessionRemaining: number;
  hasSelection: boolean;
  errorMessage?: string;
  onGenerate: () => void;
}

const GUIDE_LINES: [string, string][] = [["acromionL", "acromionR"], ["hipL", "hipR"], ["crown", "sole"]];

function Badge({ children, tone = "ash" }: { children: React.ReactNode; tone?: "ash" | "accent" }) {
  return (<span style={{ fontSize: 10, fontWeight: 600, lineHeight: 1, padding: "3px 6px", borderRadius: 999, color: tone === "accent" ? C.white : C.ash, background: tone === "accent" ? C.accent : "rgba(107,130,154,0.12)", whiteSpace: "nowrap" }}>{children}</span>);
}
const IconAlign = () => (<svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M2 4h12M2 8h8M2 12h12" stroke={C.ash} strokeWidth="1.3" strokeLinecap="round" /></svg>);
const IconCheck = () => (<svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M3 8.5l3.2 3.2L13 5" stroke={C.recInk} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>);
const IconX = () => (<svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke={C.avoidInk} strokeWidth="1.5" strokeLinecap="round" /></svg>);
const IconBookmark = () => (<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M4 2h8v12l-4-3-4 3V2z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /></svg>);

function FittingPanel({ data }: { data: BodyResultData }) {
  const [mode, setMode] = useState<"original" | "fitting">("fitting");
  const at = (id: string) => data.points.find((p) => p.id === id);
  const pct = (v: number) => `${v * 100}%`;
  const src = mode === "fitting" ? data.fittingUrl || data.photoUrl : data.photoUrl;
  const Seg = ({ id, label }: { id: "original" | "fitting"; label: string }) => (
    <button onClick={() => setMode(id)} style={{ flex: 1, padding: "6px 4px", border: "none", cursor: "pointer", fontSize: 11, fontWeight: mode === id ? 500 : 400, background: mode === id ? C.tint : C.white, color: mode === id ? C.black : C.gray }}>{label}</button>
  );
  return (
    <div style={{ flex: "0 0 178px", width: 178, display: "flex", flexDirection: "column", gap: 8, alignSelf: "flex-start" }}>
      <div className="no-print" style={{ display: "flex", border: `0.5px solid ${C.line05}`, borderRadius: 999, overflow: "hidden" }}><Seg id="original" label="원본" /><Seg id="fitting" label="가상 피팅" /></div>
      <div style={{ position: "relative", border: `0.5px solid ${C.line05}`, borderRadius: 8, padding: 8 }}>
        {mode === "fitting" && <div style={{ position: "absolute", top: 10, left: 10, zIndex: 2 }}><Badge tone="accent">가상 피팅 beta</Badge></div>}
        <div style={{ position: "relative", width: "100%" }}>
          <img src={src} alt="" style={{ display: "block", width: "100%", borderRadius: 4 }} draggable={false} />
          <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }}>
            {GUIDE_LINES.map(([a, b], i) => { const pa = at(a), pb = at(b); if (!pa || !pb) return null; return <line key={i} x1={pct(pa.x)} y1={pct(pa.y)} x2={pct(pb.x)} y2={pct(pb.y)} stroke={C.red} strokeWidth={1.2} opacity={0.9} />; })}
          </svg>
        </div>
      </div>
    </div>
  );
}

function SoftBars({ soft }: { soft: SoftScore[] }) {
  return (<div>
    <div style={{ fontSize: 13, fontWeight: 700, color: C.indigo, marginBottom: 10 }}>골격 타입 (소프트 분류)</div>
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      {soft.map((s) => (<div key={s.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ flex: "0 0 62px", fontSize: 12, color: C.black }}>{s.label}</span>
        <div style={{ flex: 1, height: 8, borderRadius: 999, background: C.track, overflow: "hidden" }}><div style={{ width: `${Math.round(s.score * 100)}%`, height: "100%", background: C.indigo, borderRadius: 999 }} /></div>
        <span style={{ flex: "0 0 34px", textAlign: "right", fontSize: 12, color: C.gray }}>{s.score.toFixed(2)}</span>
      </div>))}
    </div>
  </div>);
}

function DetailCards({ d }: { d: BodyResultData["detail"] }) {
  const cards = [["실루엣", d.silhouette], ["비율", d.proportion], ["프레임", d.frame]];
  return (<div>
    <div style={{ fontSize: 13, fontWeight: 700, color: C.indigo, marginBottom: 10 }}>세부 체형 분류</div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
      {cards.map(([label, val]) => (<div key={label} style={{ background: C.tint, borderRadius: 8, padding: "10px 12px" }}><div style={{ fontSize: 11, color: C.gray, marginBottom: 4 }}>{label}</div><div style={{ fontSize: 17, fontWeight: 500, color: C.indigo }}>{val}</div></div>))}
    </div>
  </div>);
}

function PostureDiag({ items }: { items: DiagItem[] }) {
  return (<div style={{ border: `0.5px solid ${C.line05}`, borderRadius: 8, padding: 12 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
      <IconAlign /><span style={{ fontSize: 13, fontWeight: 700, color: C.indigo }}>자세·균형 진단</span>
    </div>
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {items.map((it) => (<div key={it.name} style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
        <span style={{ flex: "0 0 78px", fontSize: 12, color: C.gray }}>{it.name}</span>
        <span style={{ flex: 1, fontSize: 12, color: C.black }}>{it.value}{it.badge && <span style={{ marginLeft: 6 }}><Badge>{it.badge}</Badge></span>}</span>
      </div>))}
    </div>
  </div>);
}

function PosingTip({ tip, onRefresh }: { tip: string; onRefresh?: () => void }) {
  const loading = !tip || tip === "포징 팁 생성 중…";
  return (<div style={{ border: `0.5px solid ${C.line05}`, background: C.tint, borderRadius: 8, padding: 12 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
      <span style={{ fontSize: 13, fontWeight: 700, color: C.indigo }}>포징 팁</span>
      <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
        {onRefresh && !loading && (
          <button onClick={onRefresh} className="no-print" style={{ background: "none", border: `1px solid ${C.ash}`, borderRadius: 6, padding: "3px 8px", fontSize: 11, color: C.ash, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M2 8a6 6 0 0 1 10.3-4.2M14 8a6 6 0 0 1-10.3 4.2" stroke={C.ash} strokeWidth="1.4" strokeLinecap="round" /><path d="M12 1v3.5h-3.5M4 15v-3.5h3.5" stroke={C.ash} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>
            다시 생성
          </button>
        )}
        <Badge tone="accent">AI</Badge>
      </span>
    </div>
    <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: loading ? C.gray : C.black }}>{tip || "포징 팁 생성 중…"}</p>
  </div>);
}

const GROUP_LABEL: Record<string, string> = {
  "body-top": "상의",
  "body-bottom": "하의",
  "material": "소재",
};

function groupChips(chips: Chip[]): { group: string; label: string; chips: Chip[] }[] {
  const order: string[] = [];
  const map = new Map<string, Chip[]>();
  for (const c of chips) {
    const g = c.group ?? "기타";
    if (!map.has(g)) { map.set(g, []); order.push(g); }
    map.get(g)!.push(c);
  }
  return order.map((g) => ({ group: g, label: GROUP_LABEL[g] ?? g, chips: map.get(g)! }));
}

function StyleChips({ data, selected, onChange }: {
  data: BodyResultData; selected: string[]; onChange: (labels: string[]) => void;
}) {
  const pool: Chip[] = [...data.recommend, ...data.avoid];
  const [note, setNote] = useState("");

  const click = (c: Chip) => {
    setNote("");
    const cur = selected;
    const has = cur.includes(c.label);
    if (has) { onChange(cur.filter((x) => x !== c.label)); return; }
    if (c.group) {
      const same = cur.filter((x) => {
        const o = pool.find((p) => p.label === x);
        return !!o && o.group === c.group && o.label !== c.label;
      });
      if (same.length > 0) {
        setNote(`해당 항목은 한 가지만 적용할 수 있어 "${c.label}"로 바꿨어요.`);
        onChange([...cur.filter((x) => !same.includes(x)), c.label]);
        return;
      }
    }
    onChange([...cur, c.label]);
  };

  const ChipBtn = ({ c, kind }: { c: Chip; kind: "rec" | "avoid" }) => {
    const on = selected.includes(c.label);
    const ink = kind === "rec" ? C.recInk : C.avoidInk;
    return (<button onClick={() => click(c)} style={{ padding: "5px 10px", borderRadius: 999, border: on ? `1.5px solid ${ink}` : `0.5px solid ${C.line05}`, background: C.white, color: ink, fontSize: 12, fontWeight: on ? 600 : 400, cursor: "pointer" }}>{c.label}</button>);
  };

  return (<div>
    <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
      <span style={{ fontSize: 13, fontWeight: 700, color: C.indigo }}>스타일링 추천 / 비추천</span>
      <span style={{ fontSize: 11, color: C.gray }}>— 의상을 선택한 뒤 아래 가상 피팅 버튼을 누르세요</span>
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
      <div style={{ border: `0.5px solid ${C.recBorder}`, background: C.recBg, borderRadius: 8, padding: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 8, fontSize: 12, fontWeight: 600, color: C.recInk }}><IconCheck /> 추천</div>
        {groupChips(data.recommend).map(({ group, label, chips }, i) => (
          <div key={group} style={{ marginTop: i === 0 ? 0 : 10 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: C.ash, marginBottom: 5, letterSpacing: "0.02em" }}>{label}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{chips.map((c) => <ChipBtn key={c.label} c={c} kind="rec" />)}</div>
          </div>
        ))}
      </div>
      <div style={{ border: `0.5px solid ${C.avoidBorder}`, background: C.avoidBg, borderRadius: 8, padding: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 8, fontSize: 12, fontWeight: 600, color: C.avoidInk }}><IconX /> 비추천</div>
        {data.avoid.length > 0
          ? groupChips(data.avoid).map(({ group, label, chips }, i) => (
              <div key={group} style={{ marginTop: i === 0 ? 0 : 10 }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: C.ash, marginBottom: 5, letterSpacing: "0.02em" }}>{label}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{chips.map((c) => <ChipBtn key={c.label} c={c} kind="avoid" />)}</div>
              </div>
            ))
          : <span style={{ fontSize: 12, color: C.gray }}>특별히 회피할 항목이 없습니다</span>}
      </div>
    </div>
    {note && <p style={{ margin: "8px 0 0", fontSize: 11, color: C.ash }}>{note}</p>}
  </div>);
}

function VFControl({ status, sessionRemaining, hasSelection, errorMessage, onGenerate }: VFControlProps) {
  const soldOut = sessionRemaining <= 0;
  const isGenerating = status === "generating";
  const isGenerated = status === "generated";
  const isStale = status === "stale";
  const disabled = isGenerating || !hasSelection || soldOut || isGenerated;

  let hint = "";
  if (soldOut) hint = "세션 생성 한도(5회)에 도달했어요";
  else if (!hasSelection) hint = "의상 항목을 선택해주세요";
  else if (isGenerating) hint = "이미지 생성 중…";
  else if (isStale) hint = "선택이 바뀌었습니다. 다시 생성을 누르면 새로 적용됩니다";
  else if (isGenerated) hint = "현재 선택으로 생성된 결과입니다";
  else if (status === "error") hint = errorMessage ?? "생성에 실패했어요. 잠시 후 다시 시도해주세요";

  return (<div className="no-print" style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", border: `0.5px solid ${C.line05}`, background: C.tint, borderRadius: 8 }}>
    <button onClick={onGenerate} disabled={disabled} style={{
      padding: "8px 14px", borderRadius: 8, border: "none", cursor: disabled ? "not-allowed" : "pointer",
      background: disabled ? C.track : C.indigo, color: disabled ? C.gray : C.white,
      fontSize: 13, fontWeight: 600, whiteSpace: "nowrap",
    }}>{isGenerating ? "생성 중…" : "가상 피팅 생성"}</button>
    <span style={{ fontSize: 12, color: status === "error" ? C.avoidInk : C.ash, flex: 1 }}>{hint}</span>
    <span style={{ fontSize: 11, color: C.gray, whiteSpace: "nowrap" }}>남은 생성 {sessionRemaining}/5</span>
  </div>);
}

export function BodyTypeTab({
  data, isLoggedIn = false, onSave, onProductLink, onRefreshTip,
  selected, onSelectChange, vf,
}: {
  data: BodyResultData;
  isLoggedIn?: boolean;
  onSave?: () => void;
  onProductLink?: () => void;
  onRefreshTip?: () => void;
  selected: string[];
  onSelectChange: (labels: string[]) => void;
  vf: VFControlProps;
}) {
  return (<div style={{ display: "flex", flexDirection: "column", gap: 22, color: C.black }}>
    <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
      <FittingPanel data={data} />
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 14 }}>
        <SoftBars soft={data.soft} />
        <DetailCards d={data.detail} />
        <PostureDiag items={data.diagnosis} />
        <StyleChips data={data} selected={selected} onChange={onSelectChange} />
        <VFControl {...vf} />
      </div>
    </div>
    <PosingTip tip={data.posingTip} onRefresh={onRefreshTip} />
    <div className="no-print" style={{ borderTop: `0.5px solid ${C.line05}`, paddingTop: 14, display: "flex", justifyContent: "flex-end", gap: 8 }}>
      <button onClick={onProductLink} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 14px", borderRadius: 8, border: `1px solid ${C.ash}`, background: C.white, color: C.ash, fontWeight: 600, fontSize: 13, cursor: "pointer" }}>상품 연결 <Badge>beta</Badge></button>
      <button onClick={onSave} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 14px", borderRadius: 8, border: `2px solid ${C.black}`, background: C.white, color: C.black, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
        <IconBookmark /> {isLoggedIn ? "저장" : "저장 (로그인)"} <Badge>DB 미구현·beta</Badge>
      </button>
    </div>
  </div>);
}
