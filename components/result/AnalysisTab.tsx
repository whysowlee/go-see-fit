/**
 * AnalysisTab.tsx — 결과 '분석' 탭. 01 FACE + 02 BODY 진단 + '왜'(InsightPanel).
 */
"use client";

import { T } from "@/components/ui/theme";
import { InsightPanel } from "@/components/InsightPanel";
import {
  SecNum, PhotoPanel, SoftBars, AxisRow, ThirdsBar, DiagGrid, Badge,
  type Pt, type SoftScore, type DiagItem, type ThirdsUI,
} from "./parts";
import type { Insight } from "@/lib/insights";

const FACE_GUIDES: [string, string][] = [["browInnerL", "browInnerR"], ["zygoL", "zygoR"], ["gonionL", "gonionR"], ["foreheadTop", "menton"]];
const BODY_GUIDES: [string, string][] = [["acromionL", "acromionR"], ["hipL", "hipR"], ["crown", "sole"]];

export interface SilhouetteUI {
  labelKo: string;
  label: string;
  koreanFreq: number;
  percentiles: { bust: number; waist: number; hip: number; dI: number; dII: number; dIII: number } | null;
  insight: string | null;
}

export interface FaceSection {
  photoUrl: string;
  points: Pt[];
  shape: string;
  soft: SoftScore[];
  shapeInsight: Insight;
  impressionLabel: string;
  impression: number;
  impressionInsight: Insight;
  cuteMature?: number;
  proportion?: ThirdsUI;
  diagnosis: DiagItem[];
  posingTip?: string;
}

export interface BodySection {
  photoUrl: string;
  points: Pt[];
  skelType: string;
  soft: SoftScore[];
  skeletonInsight: Insight;
  silhouette: SilhouetteUI | null;
  ratio: string;
  ratioInsight: Insight;
  frame: string;
  frameInsight: Insight;
  diagnosis: DiagItem[];
  posingTip?: string;
}

export function AnalysisTab({ face, body }: { face: FaceSection; body: BodySection | null }) {
  return (
    <div>
      {/* ── 01 FACE ── */}
      <SecNum n="01" title="Face" ko="얼굴 분석" />
      <div className="gsf-anrow">
        <div style={{ alignSelf: "start", position: "sticky", top: 16 }}>
          <PhotoPanel photoUrl={face.photoUrl} points={face.points} guideLines={FACE_GUIDES} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="gsf-card" style={{ marginTop: 0 }}>
            <SoftBars title={`얼굴형 · 소프트 분류`} soft={face.soft} />
            {face.proportion ? <div style={{ marginTop: 18 }}><ThirdsBar p={face.proportion} /></div> : null}
            <div style={{ marginTop: 18 }}>
              <AxisRow name="인상결 · 소프트 ↔ 샤프" left="소프트·커머셜" right="샤프·비커머셜" value={face.impression} />
            </div>
            {face.cuteMature !== undefined ? (
              <div style={{ marginTop: 6 }}>
                <AxisRow name="나이 인상 · 하안 무게중심" left="cute" right="mature" value={face.cuteMature} />
              </div>
            ) : null}
          </div>

          <InsightPanel eyebrow="얼굴형" value={face.shape} en="Face Shape" insight={face.shapeInsight} />
          <InsightPanel eyebrow="인상" value={face.impressionLabel} en="Impression" insight={face.impressionInsight} />

          <div className="gsf-card">
            <div className="gsf-card-head"><span className="gsf-card-eyebrow">얼굴 대칭·정렬</span><span className="gsf-card-en">Symmetry</span></div>
            <DiagGrid items={face.diagnosis} />
            <p className="gsf-axis-cap">촬영 각도에 따라 좌우 대칭은 달라 보일 수 있어요 · 참고용</p>
          </div>

          {face.posingTip ? <PoseTip tip={face.posingTip} /> : null}
        </div>
      </div>

      {/* ── 02 BODY ── */}
      {body ? (
        <>
          <SecNum n="02" title="Body" ko="체형 분석" />
          <div className="gsf-anrow">
            <div style={{ alignSelf: "start", position: "sticky", top: 16 }}>
              <PhotoPanel photoUrl={body.photoUrl} points={body.points} guideLines={BODY_GUIDES} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div className="gsf-card" style={{ marginTop: 0 }}>
                <SoftBars title="골격 · 소프트 분류" soft={body.soft} />
                <p className="gsf-axis-cap">골격은 뼈·관절 기준이라 사진 각도에 영향받을 수 있어요. 측면 사진과 함께 추정한 참고값입니다.</p>
              </div>

              <InsightPanel eyebrow="골격" value={body.skelType} en="Skeleton" insight={body.skeletonInsight} />

              {body.silhouette ? <SilhouettePanel s={body.silhouette} /> : null}

              {/* 골격 + 외곽선 둘 다 있을 때만 종합 진단 (둘을 잇는 블록) */}
              {body.silhouette && body.silhouette.insight ? (
                <CombinedDiagnosis skelType={body.skelType} silLabelKo={body.silhouette.labelKo} insight={body.silhouette.insight} />
              ) : null}

              <InsightPanel eyebrow="비율" value={body.ratio} en="Proportion" insight={body.ratioInsight} />
              <InsightPanel eyebrow="프레임" value={body.frame} en="Frame" insight={body.frameInsight} />

              <div className="gsf-card">
                <div className="gsf-card-head"><span className="gsf-card-eyebrow">자세·균형</span><span className="gsf-card-en">Posture</span></div>
                <DiagGrid items={body.diagnosis} />
              </div>

              {body.posingTip ? <PoseTip tip={body.posingTip} /> : null}
            </div>
          </div>
        </>
      ) : (
        <div className="gsf-card" style={{ marginTop: 24 }}>
          <p style={{ color: T.muted, fontSize: 13, margin: 0 }}>체형 분석은 측면 사진과 신체 정보가 필요해요.</p>
        </div>
      )}

      <style>{`.gsf-anrow{display:grid;grid-template-columns:220px 1fr;gap:18px;align-items:start}
@media(max-width:860px){.gsf-anrow{grid-template-columns:1fr}.gsf-anrow>div:first-child{position:static!important;max-width:280px;margin:0 auto}}`}</style>
    </div>
  );
}

/* ── 외곽선(실루엣) — 백분위 휴먼화, 개발 부스러기 제거 ── */
function SilhouettePanel({ s }: { s: SilhouetteUI }) {
  return (
    <div className="gsf-card">
      <div className="gsf-card-head">
        <span className="gsf-card-eyebrow">외곽선 비율</span>
        <span style={{ fontSize: 21, fontWeight: 700, color: T.text }}>{s.labelKo}</span>
        <span className="gsf-card-en" style={{ marginLeft: "auto" }}>Silhouette</span>
      </div>
      <p className="gsf-card-sub">앞에서 본 가슴·허리·엉덩이 둘레 비율 (골격과 별개 — 외곽선은 둘레, 골격은 뼈)</p>

      {s.koreanFreq > 0 ? (
        <div style={{ fontSize: 14, color: T.text, marginBottom: 12, lineHeight: 1.6 }}>
          또래(한국 20–39세 여성)의 약 <strong style={{ color: T.accent }}>{s.koreanFreq.toFixed(1)}%</strong>가 이 외곽선이에요.
        </div>
      ) : null}

      {s.percentiles ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {[
            { v: s.percentiles.dI, label: "상체 잘록도 (가슴–허리)" },
            { v: s.percentiles.dII, label: "하체 잘록도 (엉덩이–허리)" },
            { v: s.percentiles.dIII, label: "위–아래 비율 (엉덩이–가슴)" },
          ].map((row, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, color: T.muted, padding: "5px 0" }}>
              <span>{row.label}</span>
              <span style={{ color: T.text }}>{pctText(row.v)}</span>
            </div>
          ))}
        </div>
      ) : null}

      <div style={{ marginTop: 10 }}><Badge>참고용</Badge></div>
    </div>
  );
}

/* ── 종합 진단 — 골격(뼈·옆모습)과 외곽선(둘레·앞모습)을 잇는 블록 ──
   두 측정이 일치하는지 / 차이가 있는지 + 그 의미를 설명. (15조합) */
function CombinedDiagnosis({ skelType, silLabelKo, insight }: { skelType: string; silLabelKo: string; insight: string }) {
  // 일치 여부 — insight 문구에 "일치하는"이 들어가면 일치, 아니면 차이
  const aligned = insight.includes("일치하는");
  return (
    <div className="gsf-card" style={{ borderColor: T.accent, borderWidth: 1.5 }}>
      <div className="gsf-card-head">
        <span className="gsf-card-eyebrow">종합 진단</span>
        <span className="gsf-card-en" style={{ marginLeft: "auto" }}>Skeleton × Silhouette</span>
      </div>

      {/* 골격 ↔ 외곽선 연결 시각화 */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "4px 0 12px", flexWrap: "wrap" }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: T.text }}>🦴 {skelType}</span>
        <span style={{ fontSize: 12, color: T.muted }}>
          {aligned ? "──일치──" : "──차이──"}
        </span>
        <span style={{ fontSize: 14, fontWeight: 700, color: T.text }}>👗 {silLabelKo}</span>
        <span style={{
          marginLeft: "auto", fontSize: 11, fontWeight: 600, padding: "2px 9px", borderRadius: 999,
          color: aligned ? "#2d8a2d" : T.accent,
          background: aligned ? "rgba(45,138,45,.1)" : "rgba(234,198,188,.14)",
        }}>
          {aligned ? "✓ 일치" : "↔ 차이 있음"}
        </span>
      </div>

      <p style={{ fontSize: 14, color: T.text, lineHeight: 1.7, margin: 0 }}>{insight}</p>

      <p style={{ fontSize: 12, color: T.muted, marginTop: 10, marginBottom: 0 }}>
        {aligned
          ? "뼈와 외곽선이 같은 방향이라 분류가 안정적이에요."
          : "옆에서 본 뼈대와 앞에서 본 외곽선이 달라요 — 이 차이가 옷 선택의 핵심 단서예요. 스타일링 탭에서 맞춤 추천을 확인해보세요."}
      </p>
    </div>
  );
}

/** 백분위 → "또래 상위/하위 X%" */
function pctText(p: number): string {
  if (p >= 50) return `또래 상위 ${100 - p}%`;
  return `또래 하위 ${p}%`;
}

/* ── 포징 팁 (AI) ── */
function PoseTip({ tip }: { tip: string }) {
  const loading = !tip || tip === "포징 팁 생성 중…";
  return (
    <div className="gsf-card" style={{ background: "rgba(234,198,188,.05)" }}>
      <div className="gsf-card-head">
        <span className="gsf-card-eyebrow">포징 팁</span>
        <span className="gsf-card-en">Posing</span>
        <span style={{ marginLeft: "auto", fontSize: 10, letterSpacing: ".18em", color: T.dim, border: `1px solid ${T.line}`, borderRadius: 6, padding: "3px 8px" }}>AI</span>
      </div>
      <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.7, color: loading ? T.dim : T.text }}>{tip || "포징 팁 생성 중…"}</p>
    </div>
  );
}
