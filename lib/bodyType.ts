/**
 * bodyType.ts — 골격 1층(S/W/N) + 모델 보정 2층(3축).
 * 컷·가중치·norm은 config.ts 주입.
 *
 * 입력은 "이미 추출된 스칼라 측정값"(BodyMeasurements). MediaPipe Pose 좌표 →
 * 이 측정값(특히 둘레 타원근사·좌고비 프록시·측면 깊이)으로 바꾸는 추출 단계는
 * 별도 모듈(lib/mediapipe/bodyExtract.ts). 분류는 측정값만 받아 테스트 가능하게 유지.
 */
import { zscore } from "./geometry";
import { SWN, AXES, Sex } from "./config";

export type Skeleton = "스트레이트" | "웨이브" | "내추럴";

/** 사진/추출 파이프라인에서 채워주는 측정값(키로 정규화된 비율 중심) */
export interface BodyMeasurements {
  // 1단계(내추럴)
  shoulderSlopeDeg: number; // 좌우 평균 어깨 경사각
  jointWidthIndex: number; // 팔꿈치·무릎 양과너비/키×100
  whtr: number; // 허리둘레/키
  neckIndexLow: boolean; // 목둘레지수 낮음 + 어깨각짐 동반(부울 신호)
  // 2단계(S vs W)
  thoraxFlat: number; // 측면깊이/정면너비 (AP/횡경)
  bhr: number; // 가슴둘레/엉덩이둘레
  bustHeight: number; // 측면 가슴정점/키
  waistPos: number; // 측면 허리최저점 상대높이
  texture?: "탄력" | "건조" | null; // 접전 시 사용자 1회 확인
  // 2층 3축
  shoulderHipRatio: number; // 어깨너비/골반너비 (여 ①)
  chestMinusWaist_cm: number; // 가슴둘레-허리둘레 드롭 (남 ①)
  sittingHeightRatio: number; // 앉은키/신장×100 (좌고비)
  shoulderHeightRatio: number; // 어깨너비/신장 (③)
}

export interface SkeletonResult {
  type: Skeleton | "보류";
  confidence: number;
  natScore: number;
  swScore: number | null; // 2단계 z합 (내추럴 확정 시 null)
  scores: Record<Skeleton, number>;
  needTextureConfirm: boolean;
}

export function classifySkeleton(meas: BodyMeasurements, sex: Sex, sideAvailable = true): SkeletonResult {
  if (!sideAvailable) {
    return { type: "보류", confidence: 0, natScore: 0, swScore: null, scores: { 스트레이트: 0, 웨이브: 0, 내추럴: 0 }, needTextureConfirm: false };
  }
  // ── 1단계: 내추럴 점수 ──
  const w = SWN.natWeights.value;
  let nat = 0;
  if (meas.shoulderSlopeDeg <= SWN.shoulderSlopeAngular_deg.value) nat += w.shoulderAngular;
  if (meas.jointWidthIndex >= SWN.jointWidthIndex[sex].value) nat += w.jointWidth;
  if (meas.whtr < SWN.whtr[sex].value) nat += w.lowSoftTissue;
  if (meas.neckIndexLow) nat += w.thinNeck;

  if (nat >= SWN.natThreshold.value) {
    const conf = Math.min(1, nat / 5);
    return { type: "내추럴", confidence: conf, natScore: nat, swScore: null, scores: { 스트레이트: (1 - conf) / 2, 웨이브: (1 - conf) / 2, 내추럴: conf }, needTextureConfirm: false };
  }

  // ── 2단계: Straight(+) vs Wave(-) z합 ──
  // 골격-실루엣 직교 (2026-06-21): bhr(가슴/엉덩이 둘레)은 lib/silhouette.ts 가 정면 외곽선
  // 비율로 사용. 골격은 측면 두께·각도만 다룸. SK 8차 보정 PROVISIONAL.
  const n = SWN.swNorm.value;
  const sw =
    zscore(meas.thoraxFlat, n.thoraxFlat.m, n.thoraxFlat.s) +
    zscore(meas.bustHeight, n.bustHeight.m, n.bustHeight.s) +
    zscore(meas.waistPos, n.waistPos.m, n.waistPos.s);
  const margin = SWN.swMargin.value;

  // 접전 + 1단계도 경계(2.0~2.5)면 질감 1회 확인
  const borderline = Math.abs(sw) <= margin && nat >= 2.0;
  if (borderline) {
    if (meas.texture === "탄력") return finalize("스트레이트", sw, nat, 0.55);
    if (meas.texture === "건조") return finalize("내추럴", sw, nat, 0.55);
    return { type: "스트레이트", confidence: 0.4, natScore: nat, swScore: sw, scores: softSW(sw, nat), needTextureConfirm: true };
  }

  const type: Skeleton = sw > margin ? "스트레이트" : sw < -margin ? "웨이브" : "스트레이트";
  const conf = Math.min(1, 0.5 + Math.abs(sw) / 4);
  return finalize(type, sw, nat, conf);
}

function softSW(sw: number, nat: number): Record<Skeleton, number> {
  const s = 1 / (1 + Math.exp(-sw)); // straight 확률
  const natP = Math.min(0.9, nat / 5);
  return { 내추럴: natP, 스트레이트: (1 - natP) * s, 웨이브: (1 - natP) * (1 - s) };
}
function finalize(type: Skeleton, sw: number, nat: number, conf: number): SkeletonResult {
  return { type, confidence: conf, natScore: nat, swScore: sw, scores: softSW(sw, nat), needTextureConfirm: false };
}

/* ──────────────────────────────────────────────────────────
 * 2층: 모델 보정 3축
 * ────────────────────────────────────────────────────────── */
export interface AxisResult {
  /**
   * @deprecated 2026-06-21 — 정면 외곽선 분류는 lib/silhouette.ts (K-means k=4)
   * 로 이관됨. AXES.silhouette은 더 이상 산출하지 않음. 빈 문자열 반환.
   * 호환 유지 목적으로 필드는 남김 (외부 참조 깨짐 방지).
   */
  silhouette: string;
  ratio: "롱레그" | "밸런스" | "롱토르소"; // ②
  frame: "슬림" | "미디엄" | "와이드"; // ③
}

export function classifyAxes(meas: BodyMeasurements, sex: Sex): AxisResult {
  // ① 실루엣 — lib/silhouette.ts로 이관 (외곽선 비율). 빈 문자열 반환.
  // ② 비율 (좌고비)
  const r = AXES.ratio[sex];
  const ratio: AxisResult["ratio"] =
    meas.sittingHeightRatio <= r.longLeg.value ? "롱레그" : meas.sittingHeightRatio >= r.longTorso.value ? "롱토르소" : "밸런스";
  // ③ 프레임
  const fr = AXES.frame[sex];
  const frame: AxisResult["frame"] =
    meas.shoulderHeightRatio <= fr.slim.value ? "슬림" : meas.shoulderHeightRatio >= fr.wide.value ? "와이드" : "미디엄";
  return { silhouette: "", ratio, frame };
}

/** 자연어 한 줄 조합 (문서 §7 '읽는 법') */
export function describe(skel: SkeletonResult, axes: AxisResult): string {
  if (skel.type === "보류") return "측면 사진이 없어 골격 타입은 보류입니다.";
  // silhouette 항목 제거 — 정면 외곽선은 lib/silhouette.ts 결과 카드로 분리됨
  return `${skel.type} · ${axes.ratio} · ${axes.frame}`;
}
