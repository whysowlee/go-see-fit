/**
 * silhouetteConfig.ts — 정면 실루엣 분류 (Body Silhouette) 단일 진입점.
 *
 * "실루엣" = 정면 사진에서 사람 외곽선 비율 (bust/waist/hip 둘레 기반).
 * 골격(SWN, 측면 각도·두께 기반)과 *다른 차원* — 직교 설계.
 *
 * 분류 알고리즘: K-means k=4 centroid 1-NN (Euclidean distance, z-score 후).
 *
 * 데이터 출처:
 *   - SK 8차 여성 20-39세 통계 (n=1,230)
 *   - 다변량 정규분포 시뮬레이션 (raw 미입수) + K-means
 *   - 학술 근거: Lee, Istook, Nam, Park (2007) FFIT + 윤진경 외 (2005) 한국 20대 군집
 *
 * status:
 *   ESTABLISHED = 측정 표준/문헌 근거
 *   PROVISIONAL = 시뮬레이션 또는 시작값. raw 입수 시 재보정 대상.
 *   UNDETERMINED = 임시 기본값. 표본 보정 필수.
 *
 * config.ts 가 frozen 이므로 실루엣 전용 보정값은 여기 둠. 동일한 Threshold 패턴.
 */
import type { CalStatus, Sex } from "./config";

interface Threshold<T = number> {
  value: T;
  status: CalStatus;
  source: string;
}
const T = <T,>(value: T, status: CalStatus, source: string): Threshold<T> => ({ value, status, source });

/* ──────────────────────────────────────────────────────────
 * 1. 분류 라벨 — 한국 SK 8차 K-means k=4 + Inverted 특수
 *
 * 4 라벨 의미 (잘록도 순서):
 *   - Hourglass        : 한국 평균보다 훨씬 잘록 (군집 4)
 *   - SoftHourglass    : 한국 평균보다 약간 잘록 + bust ≈ hip (군집 2)
 *   - Rectangle        : 진짜 직선적, 잘록 거의 없음 (군집 3)
 *   - Triangle (Pear)  : hip 우세 (군집 1)
 *   - InvertedTriangle : bust > hip 5cm+ (한국 매우 드묾, 특수 처리)
 * ────────────────────────────────────────────────────────── */
export type SilhouetteLabel =
  | "Hourglass"
  | "SoftHourglass"
  | "Rectangle"
  | "Triangle"
  | "InvertedTriangle";

export const SILHOUETTE_LABELS: Record<SilhouetteLabel, string> = {
  Hourglass: "모래시계형",
  SoftHourglass: "부드러운 모래시계형",
  Rectangle: "직사각형",
  Triangle: "삼각형",
  InvertedTriangle: "역삼각형",
};

/* ──────────────────────────────────────────────────────────
 * 2. K=4 Centroid (여성)
 *    Drop I = bust - waist
 *    Drop II = hip - waist
 *    Drop III = hip - bust
 *    K-means 결과 (SK 8차 시뮬레이션, n=1,230, random_state=42)
 * ────────────────────────────────────────────────────────── */
export interface Centroid {
  label: SilhouetteLabel;
  dI: number; // bust - waist (cm)
  dII: number; // hip - waist (cm)
  dIII: number; // hip - bust (cm)
  freq_pct: number; // 한국 빈도 (%)
  subtype?: string; // Rectangle 두 군집 구분용 (선택)
}

export const FEMALE_CENTROIDS = T<readonly Centroid[]>(
  [
    // 군집 1: hip 우세 + 잘록 보통 → Triangle (Pear)
    { label: "Triangle", dI: 10.8, dII: 21.7, dIII: 10.9, freq_pct: 31.7 },
    // 군집 2: bust ≈ hip + 한국 평균보다 약간 잘록 → Soft Hourglass
    //   (이전엔 Rectangle로 라벨했으나, Drop I=16.7 한국 평균 13.3보다 큼 → 잘록 경향)
    { label: "SoftHourglass", dI: 16.7, dII: 18.7, dIII: 2.0, freq_pct: 26.1 },
    // 군집 3: 위-아래 비슷 + 잘록 거의 없음 (Drop I 7.0 한국 평균 13.3보다 훨씬 작음) → 진짜 Rectangle
    { label: "Rectangle", dI: 7.0, dII: 12.5, dIII: 5.5, freq_pct: 22.6 },
    // 군집 4: 강한 잘록 + 약간 hip 큼 → Hourglass (Lee 정확 매핑은 Bottom Hourglass, high-hip 미측정으로 통합)
    { label: "Hourglass", dI: 20.5, dII: 28.0, dIII: 7.5, freq_pct: 19.6 },
  ],
  "PROVISIONAL",
  "K-means k=4 on SK 8차 여성 20-39 시뮬레이션 (n=1230, 다변량 정규분포 가정, 공분산 0.70-0.75). " +
    "Silhouette score 0.3352, Calinski-Harabasz 774.9 (k=4 최고). " +
    "라벨 매핑: 한국 평균 Drop I=13.3 기준 잘록도 순서로 Hourglass(20.5) > SoftHourglass(16.7) > Rectangle(7.0). " +
    "SK raw 입수 시 재산출 권장.",
);

/** Inverted Triangle 특수 처리: K-means 군집엔 없음 (한국 ~0%). bust > hip 케이스 위해 별도 임계.
 *  Drop III ≤ -이 값 → InvertedTriangle 라벨 우선 부여. */
export const INVERTED_TRIANGLE_DIII_CM = T(
  -5.0,
  "PROVISIONAL",
  "Lee 2007 inverted triangle 조건 (bust-hip ≥ 3.6 inch ≈ 9.14cm)의 한국 보정 보수치. " +
    "한국 여성 20-39 Drop III 분포에서 -5cm 미만 = P0.1 미만 (매우 드묾). " +
    "본인+친구 사진 검증 후 조정.",
);

/* ──────────────────────────────────────────────────────────
 * 3. 한국 분포 norm (percentile 산출용)
 *    SK 8차 여성 20-39세, 4구간 가중 mean + 풀드 SD
 * ────────────────────────────────────────────────────────── */
export interface NormDist {
  mean: number;
  sd: number;
}

export const FEMALE_KOREAN_DIST = T<{
  bust: NormDist;
  waist: NormDist;
  hip: NormDist;
  dI: NormDist;
  dII: NormDist;
  dIII: NormDist;
}>(
  {
    bust: { mean: 87.36, sd: 6.52 },
    waist: { mean: 74.02, sd: 8.23 },
    hip: { mean: 94.20, sd: 6.50 },
    dI: { mean: 13.34, sd: 10.50 },
    dII: { mean: 20.18, sd: 10.49 },
    dIII: { mean: 6.84, sd: 9.21 },
  },
  "ESTABLISHED",
  "SK 8차 여성 20-39세 4구간 (n=1,230) 가중평균 + 풀드 SD. " +
    "단위 cm. Drop 분포는 독립 차 (Cov=0 보수치, 실제 공분산 0.7+로 SD 과대 추정 가능).",
);

/* ──────────────────────────────────────────────────────────
 * 4. 남성 — TBD (외부 리서치 대기 중)
 *    임시: 기존 AXES.silhouette.male 사용 (config.ts), 본 모듈은 여성만 처리.
 * ────────────────────────────────────────────────────────── */
export const MALE_CENTROIDS = T<readonly Centroid[]>(
  [],
  "UNDETERMINED",
  "남성 실루엣 분류 학술 자료 외부 리서치 진행 중. 결과 도착 후 채움. " +
    "임시: 남성 사용자는 lib/bodyType.ts 의 AXES.silhouette.male (V/직선/밸런스) 사용.",
);

/* ──────────────────────────────────────────────────────────
 * 5. 헬퍼 — centroid 선택 (성별별)
 * ────────────────────────────────────────────────────────── */
export function centroidsFor(sex: Sex): readonly Centroid[] {
  return sex === "female" ? FEMALE_CENTROIDS.value : MALE_CENTROIDS.value;
}

export function distFor(sex: Sex) {
  // 현재는 여성만 산출. 남성은 추후.
  return sex === "female" ? FEMALE_KOREAN_DIST.value : null;
}
