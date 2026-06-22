/**
 * necklineScore.ts — 넥라인 종합 추천 점수 (얼굴형 × 체형 × 퍼스널컬러).
 *
 * 1차 피드백 핵심:
 *   "점수순 순위를 나열해서 얼굴형으로 했을 때는 V넥 추천이지만
 *    + 체형/퍼스널컬러 등 종합적으로 자세한 설명"
 *   "스타일링 추천이 체형과 얼굴형이 복합적으로 영향을 준다는 내용"
 *
 * 기존 FACE_REC은 얼굴형 단일 추천(룰 베이스). 이 모듈은 같은 넥라인을
 * 3개 축에서 점수화해 *종합 순위*를 만들고, 각 축 기여를 분해해 보여줌.
 *
 * 점수 = 얼굴형 기여 + 체형(골격) 기여 + 퍼스널컬러 기여
 * 출력: 넥라인별 종합 점수 + 축별 분해 + 순위
 */
import type { FaceShape } from "./faceShape";
import type { Skeleton } from "./bodyType";
import type { PersonalColor } from "./personalColor";

/** 우리가 점수화하는 넥라인 후보 */
export type Neckline =
  | "V넥"
  | "U넥"
  | "스퀘어넥"
  | "라운드넥"
  | "보트넥"
  | "하이넥"
  | "스윗하트넥"
  | "오프숄더";

export const NECKLINES: Neckline[] = [
  "V넥", "U넥", "스퀘어넥", "라운드넥", "보트넥", "하이넥", "스윗하트넥", "오프숄더",
];

/** 한 축의 점수 기여 + 근거 */
export interface AxisContribution {
  axis: "얼굴형" | "골격" | "퍼스널컬러";
  score: number; // -3 ~ +3
  reason: string;
}

export interface NecklineScore {
  neckline: Neckline;
  total: number; // 종합 점수
  contributions: AxisContribution[];
  verdict: "강력 추천" | "추천" | "보통" | "주의" | "비추천";
}

/* ──────────────────────────────────────────────────────────
 * 1. 얼굴형 × 넥라인 점수 (시각 보정 원리)
 *    +2 강추 / +1 추천 / 0 중립 / -1 주의 / -2 비추천
 * ────────────────────────────────────────────────────────── */
const FACE_NECK: Record<FaceShape, Partial<Record<Neckline, { s: number; r: string }>>> = {
  둥근형: {
    V넥: { s: 2, r: "세로로 길게 파여 둥근 얼굴을 길어 보이게" },
    스윗하트넥: { s: 1, r: "곡선이 턱선과 어울려 세로 시선" },
    라운드넥: { s: -2, r: "둥근 라인이 둥근 얼굴을 반복" },
    하이넥: { s: -2, r: "목·얼굴이 짧아 보여 둥근 인상 강조" },
  },
  사각형: {
    U넥: { s: 2, r: "부드러운 곡선이 각진 턱선 완화" },
    라운드넥: { s: 2, r: "둥근 라인이 각진 윤곽 보완" },
    스윗하트넥: { s: 1, r: "곡선이 직선적 턱을 부드럽게" },
    스퀘어넥: { s: -2, r: "각진 네크라인이 각진 턱 반복" },
  },
  장방형: {
    하이넥: { s: 2, r: "목 길이를 줄여 긴 얼굴 단축" },
    보트넥: { s: 1, r: "가로 라인이 세로 길이 끊음" },
    라운드넥: { s: 1, r: "가로 너비로 길이감 완화" },
    V넥: { s: -2, r: "세로 라인이 긴 얼굴을 더 길게" },
  },
  역삼각형: {
    보트넥: { s: 2, r: "어깨로 퍼져 좁은 턱과 균형" },
    라운드넥: { s: 1, r: "하관에 너비 더해 균형" },
    스퀘어넥: { s: 1, r: "수평 라인이 하관 보강" },
    V넥: { s: -1, r: "좁은 턱을 더 뾰족하게" },
  },
  계란형: {
    스퀘어넥: { s: 2, r: "균형 얼굴이라 또렷한 라인 소화" },
    오프숄더: { s: 1, r: "어깨 라인 살려 균형미 강조" },
    V넥: { s: 1, r: "대부분 잘 어울리는 균형형" },
    하이넥: { s: 1, r: "목 라인도 무난하게 소화" },
  },
  마름모형: {
    V넥: { s: 2, r: "세로 라인이 넓은 광대 시선 분산" },
    스윗하트넥: { s: 1, r: "곡선이 광대 너비 완화" },
    보트넥: { s: -2, r: "가로 너비가 광대 강조" },
    오프숄더: { s: -1, r: "어깨·광대 너비 동시 강조" },
  },
};

/* ──────────────────────────────────────────────────────────
 * 2. 골격(체형) × 넥라인 점수
 *    스트레이트: 깔끔한 직선 / 웨이브: 쇄골·목선 / 내추럴: 여유
 * ────────────────────────────────────────────────────────── */
const SKEL_NECK: Record<Skeleton, Partial<Record<Neckline, { s: number; r: string }>>> = {
  스트레이트: {
    V넥: { s: 2, r: "쇄골 위 공간을 열어 두꺼운 상체를 시원하게" },
    U넥: { s: 1, r: "깔끔하게 파여 단정한 상체 라인" },
    스퀘어넥: { s: 1, r: "직선 라인이 구조적 상체와 어울림" },
    하이넥: { s: -2, r: "목이 막혀 상체가 답답·부해 보임" },
    오프숄더: { s: -1, r: "둥근 어깨 연출은 직선 상체와 안 맞음" },
  },
  웨이브: {
    스윗하트넥: { s: 2, r: "쇄골·가슴 라인 살려 여리한 곡선 강조" },
    오프숄더: { s: 2, r: "쇄골·어깨 라인을 드러내 강점 부각" },
    스퀘어넥: { s: 1, r: "쇄골·목선이 자연스럽게 드러남" },
    하이넥: { s: -1, r: "목선 강점을 가려 답답해 보임" },
    보트넥: { s: -1, r: "어깨가 넓어 보여 상체가 평평해짐" },
  },
  내추럴: {
    보트넥: { s: 1, r: "여유로운 가로 라인이 골격과 조화" },
    하이넥: { s: 1, r: "목 둘레 여유가 큰 골격과 어울림" },
    U넥: { s: 1, r: "편안한 곡선이 자연스러운 무드" },
    스윗하트넥: { s: -1, r: "여리한 곡선은 큰 골격과 덜 어울림" },
  },
};

/* ──────────────────────────────────────────────────────────
 * 3. 퍼스널컬러 — 넥라인 자체엔 영향 작음. V·오프숄더는 *피부 노출*이
 *    많아 퍼스널컬러 톤이 더 드러남 → 약한 가점만.
 * ────────────────────────────────────────────────────────── */
const PC_NOTE: Record<PersonalColor, string> = {
  spring: "밝은 코랄·피치 톤 상의와 함께면 화사함 ↑",
  summer: "로즈·라벤더 쿨 톤 상의와 함께면 정돈됨 ↑",
  autumn: "브릭·카키 딥 톤 상의와 함께면 고급스러움 ↑",
  winter: "트루레드·네이비 선명한 톤 상의와 함께면 또렷함 ↑",
  unknown: "",
};
// 피부 노출 많은 넥라인 (퍼컬 영향 큼)
const PC_SENSITIVE: Neckline[] = ["V넥", "오프숄더", "스윗하트넥", "U넥"];

/* ──────────────────────────────────────────────────────────
 * 종합 점수 계산
 * ────────────────────────────────────────────────────────── */

function verdictFromTotal(total: number): NecklineScore["verdict"] {
  if (total >= 3) return "강력 추천";
  if (total >= 1.5) return "추천";
  if (total > -1) return "보통";
  if (total > -2.5) return "주의";
  return "비추천";
}

export function scoreNecklines(
  faceShape: FaceShape,
  skeleton: Skeleton | "보류",
  personalColor: PersonalColor,
): NecklineScore[] {
  const faceMap = FACE_NECK[faceShape] ?? {};
  const skelMap = skeleton !== "보류" ? SKEL_NECK[skeleton] ?? {} : {};

  const scores: NecklineScore[] = NECKLINES.map((nl) => {
    const contributions: AxisContribution[] = [];

    // 얼굴형 기여
    const f = faceMap[nl];
    if (f) {
      contributions.push({ axis: "얼굴형", score: f.s, reason: f.r });
    }

    // 골격 기여
    const sk = skelMap[nl];
    if (sk) {
      contributions.push({ axis: "골격", score: sk.s, reason: sk.r });
    }

    // 퍼스널컬러 기여 (피부 노출 많은 넥라인 + 퍼컬 입력 시 약한 가점)
    if (personalColor !== "unknown" && PC_SENSITIVE.includes(nl)) {
      contributions.push({ axis: "퍼스널컬러", score: 0.5, reason: PC_NOTE[personalColor] });
    }

    const total = contributions.reduce((s, c) => s + c.score, 0);
    return { neckline: nl, total, contributions, verdict: verdictFromTotal(total) };
  });

  // 점수순 정렬 (기여가 하나도 없는 건 뒤로)
  return scores
    .filter((s) => s.contributions.length > 0)
    .sort((a, b) => b.total - a.total);
}
