/**
 * faceShape.ts — 얼굴형 6분류 + 신뢰성(커머셜/비커머셜).
 * 모든 컷·가중치는 config.ts에서 주입. 로직에 숫자 하드코딩 금지.
 *
 * 입력은 "의미 있는 이름이 붙은 좌표"(이미 MediaPipe 468점에서 매핑된 상태).
 * MediaPipe → 이 좌표 매핑은 별도 모듈(lib/mediapipe/faceMap.ts)에서 처리. (gap)
 */
import { Point, dist, angleDeg, tiltFromAxis, zscore, normalizeScores } from "./geometry";
import { FACE, TRUST } from "./config";

export type FaceShape = "둥근형" | "사각형" | "장방형" | "계란형" | "역삼각형" | "마름모형";

/** 분류·계측에 필요한 얼굴 의미 좌표 */
export interface FaceLandmarks {
  foreheadCenterTop: Point; // 이마 중앙 상단 (L의 위 끝)
  menton: Point; // 턱끝 최하점 (L의 아래 끝)
  zygomaticL: Point; // 좌 광대점
  zygomaticR: Point; // 우 광대점
  foreheadL: Point; // 좌 이마(헤어라인 옆)
  foreheadR: Point; // 우 이마
  gonionL: Point; // 좌 하악각(고니온)
  gonionR: Point; // 우 하악각
  jawMidL: Point; // 좌 턱선 중간 (턱끝각 계산용)
  jawMidR: Point; // 우 턱선 중간
  // 신뢰성용
  browInnerL: Point;
  browMidL: Point; // 좌 눈썹 중간점
  noseSellion: Point; // 콧대 시작점(셀리온)
  noseTip: Point; // 코끝
}

export interface FaceMetrics {
  L: number;
  Wf: number;
  Wc: number;
  Wj: number;
  AR: number;
  F: number;
  J: number;
  T: number;
  jawAngle: number; // 하악각(도)
  cheekIsMax: boolean; // 광대가 전역 최대 너비인가
}

export function computeFaceMetrics(lm: FaceLandmarks): FaceMetrics {
  const L = dist(lm.foreheadCenterTop, lm.menton);
  const Wf = dist(lm.foreheadL, lm.foreheadR);
  const Wc = dist(lm.zygomaticL, lm.zygomaticR);
  const Wj = dist(lm.gonionL, lm.gonionR);
  // 하악각: 한쪽 고니온에서 (턱선중간, 턱끝)이 이루는 각의 좌우 평균
  const jawAngle = (angleDeg(lm.jawMidL, lm.gonionL, lm.menton) + angleDeg(lm.jawMidR, lm.gonionR, lm.menton)) / 2;
  return {
    L, Wf, Wc, Wj,
    AR: L / Wc,
    F: Wf / Wc,
    J: Wj / Wc,
    T: Wf / Wj,
    jawAngle,
    cheekIsMax: Wc >= Wf && Wc >= Wj,
  };
}

export interface FaceResult {
  scores: Record<FaceShape, number>; // 소프트(합=1) — UI 표시용
  primary: FaceShape;
  confidence: number; // = primary 점수
  reviewFlag: boolean; // 경계 케이스
  metrics: FaceMetrics;
}

/**
 * §3.2 규칙 트리 — primary 결정의 권위.
 * 트리가 명시 분기에 안 걸리는 잔여는 "거의 평행" 외 경로(계란형/마름모)로 흡수.
 */
function hardPrimary(m: FaceMetrics): FaceShape {
  const c = {
    foreheadDom: FACE.foreheadDominant.value, // 1.08
    diamond: FACE.diamondMax.value, // 0.92
    par: FACE.parallelTol.value, // 0.08
    arHigh: FACE.AR_high.value, // 1.5
    arLow: FACE.AR_low.value, // 1.25
    jawAng: FACE.jawAngleAngular_deg.value, // 125
    jawNarrow: FACE.jawNarrow.value, // 0.90
  };
  // 1) 역삼각형: 이마 우세 + 위가 넓음
  if (m.F >= c.foreheadDom && m.T > 1) return "역삼각형";
  // 2) 마름모: 광대 최대 + 이마/턱 모두 좁음
  if (m.cheekIsMax && m.F < c.diamond && m.J < c.diamond) return "마름모형";
  // 3) 거의 평행
  if (Math.abs(m.F - 1) < c.par && Math.abs(m.J - 1) < c.par) {
    if (m.AR > c.arHigh) return "장방형";
    if (m.AR < c.arLow) return m.jawAngle < c.jawAng ? "사각형" : "둥근형";
    // 평행이지만 AR 중간대: 장방/사각 경계 → 비율로 처리
    return "장방형";
  }
  // 4) 광대 최대 + 테이퍼 + 부드러움 → 계란형
  if (m.cheekIsMax && m.J < c.jawNarrow && m.jawAngle >= c.jawAng) return "계란형";
  // 잔여: 광대 우세면 계란형, 이마 우세면 역삼각형 근접
  return m.F > m.J ? "역삼각형" : "계란형";
}

/** 소프트 점수: 각 타입 시그니처(§3.1) 적합도. 표시용. */
function softScores(m: FaceMetrics): Record<FaceShape, number> {
  const par = FACE.parallelTol.value;
  const near = (a: number, b: number, scale: number) => Math.max(0, 1 - Math.abs(a - b) / scale);
  const parallel = Math.max(0, 1 - (Math.abs(m.F - 1) + Math.abs(m.J - 1)) / (2 * par));
  const angular = near(m.jawAngle, 110, 40); // 작을수록 각짐
  const soft = 1 - angular;
  const cheek = m.cheekIsMax ? 1 : 0;
  return normalizeScores<FaceShape>({
    둥근형: parallel * soft * near(m.AR, 1.1, 0.3),
    사각형: parallel * angular * near(m.AR, 1.1, 0.3),
    장방형: parallel * near(m.AR, 1.6, 0.4),
    계란형: cheek * soft * near(m.AR, 1.4, 0.3) * Math.max(0, 1 - Math.max(0, m.J - 1)),
    역삼각형: Math.max(0, m.F - 1) * 8 * Math.max(0, m.T - 1) * 4,
    마름모형: cheek * Math.max(0, 1 - m.F) * 8 * Math.max(0, 1 - m.J) * 8,
  });
}

export function classifyFaceShape(lm: FaceLandmarks): FaceResult {
  const metrics = computeFaceMetrics(lm);
  const primary = hardPrimary(metrics);
  const scores = softScores(metrics);
  // 점수 기준 1·2위 차로 경계 판정 (문서: 경계 근처면 혼합 라벨 + 검토 플래그)
  const sorted = (Object.entries(scores) as [FaceShape, number][]).sort((a, b) => b[1] - a[1]);
  const reviewFlag = sorted[0][1] - sorted[1][1] < 0.15;
  return { scores, primary, confidence: scores[primary], reviewFlag, metrics };
}

/* ──────────────────────────────────────────────────────────
 * 신뢰성(커머셜/비커머셜) — Todorov 4지표 가중합
 * ────────────────────────────────────────────────────────── */
export interface TrustResult {
  score: number; // 가중 z합
  label: "커머셜" | "비커머셜" | "경계";
  contributions: Record<"browAngle" | "cheekProjection" | "jawWidth" | "sellionDepth", number>;
}

export function computeTrust(lm: FaceLandmarks, m?: FaceMetrics): TrustResult {
  const fm = m ?? computeFaceMetrics(lm);
  // 4지표 원시값 (모두 무차원/각도; 얼굴 크기 무관)
  const raw = {
    browAngle: tiltFromAxis(lm.browInnerL, lm.browMidL, lm.zygomaticL, lm.zygomaticR), // ① 클수록 신뢰↑ (얼굴 광대축 기준, 머리 자세 무관)
    cheekProjection: fm.Wc / fm.L, // ② 광대너비/얼굴길이
    jawWidth: fm.Wj / fm.Wc, // ③ 하악각거리/광대거리 (넓을수록 신뢰↑)
    sellionDepth: dist(lm.noseSellion, lm.noseTip) / fm.L, // ④ 깊을수록 신뢰↓
  };
  const norm = TRUST.norm.value;
  const w = TRUST.weights.value;
  const contributions = {
    browAngle: w.browAngle * zscore(raw.browAngle, norm.browAngle.m, norm.browAngle.s),
    cheekProjection: w.cheekProjection * zscore(raw.cheekProjection, norm.cheekProjection.m, norm.cheekProjection.s),
    jawWidth: w.jawWidth * zscore(raw.jawWidth, norm.jawWidth.m, norm.jawWidth.s),
    sellionDepth: w.sellionDepth * zscore(raw.sellionDepth, norm.sellionDepth.m, norm.sellionDepth.s),
  };
  const score = Object.values(contributions).reduce((s, v) => s + v, 0);
  const cut = TRUST.commercialCutZ.value;
  const band = 0.25; // 경계대 폭(잠정)
  const label = score > cut + band ? "커머셜" : score < cut - band ? "비커머셜" : "경계";
  return { score, label, contributions };
}
