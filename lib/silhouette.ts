/**
 * silhouette.ts — 정면 실루엣 분류 (Body Silhouette) 메인 모듈.
 *
 * 입력: bust, waist, hip 둘레 (cm) + 성별
 * 출력: 분류 라벨 + Drop 값 + 한국 분포 percentile + 가까운 군집 정보
 *
 * 골격(SWN)과 *직교* — 골격은 측면·각도·두께, 실루엣은 정면·외곽선·둘레.
 *
 * 분류: K-means k=4 centroid 1-NN (z-score 후 Euclidean).
 *
 * 사용 예:
 *   const result = classifySilhouette({ bust: 86, waist: 65, hip: 92 }, "female");
 *   → { label: "Hourglass", drops: {...}, percentiles: {...}, confidence: 0.78 }
 */
import type { Sex } from "./config";
import {
  centroidsFor,
  distFor,
  FEMALE_KOREAN_DIST,
  INVERTED_TRIANGLE_DIII_CM,
  SILHOUETTE_LABELS,
  type Centroid,
  type SilhouetteLabel,
} from "./silhouetteConfig";

export interface SilhouetteInput {
  bust: number; // 가슴 둘레 (cm)
  waist: number; // 허리 둘레 (cm)
  hip: number; // 엉덩이 둘레 (cm)
}

export interface DropValues {
  dI: number; // bust - waist
  dII: number; // hip - waist
  dIII: number; // hip - bust
}

export interface PercentileValues {
  bust: number; // 0-100
  waist: number;
  hip: number;
  dI: number;
  dII: number;
  dIII: number;
}

export interface SilhouetteResult {
  /** 분류 라벨 (Hourglass / Triangle / Inverted Triangle / Rectangle) */
  label: SilhouetteLabel;
  /** 한글 라벨 */
  labelKo: string;
  /** Drop 값 (cm) */
  drops: DropValues;
  /** 가장 가까운 centroid (분포 정보 포함) */
  nearestCentroid: Centroid & { distance: number };
  /** 한국 분포에서 본인 위치 (백분위 0-100). 여성만, 남성은 null */
  percentiles: PercentileValues | null;
  /** 분류 신뢰도 (0-1). 1순위 centroid와 2순위 centroid 거리 비율로 계산 */
  confidence: number;
  /** 한국 빈도 (이 라벨이 한국 인구에서 몇 %) */
  koreanFreq: number;
  /** 모든 centroid와의 거리 (디버깅·시각화용) */
  allDistances: Array<{ centroid: Centroid; distance: number }>;
}

/* ──────────────────────────────────────────────────────────
 * 통계 헬퍼
 * ────────────────────────────────────────────────────────── */

/** 정규분포 CDF 근사 (Abramowitz & Stegun 26.2.17). value 이하 비율 0-1 반환. */
function normalCdf(value: number, mean: number, sd: number): number {
  if (sd === 0) return value >= mean ? 1 : 0;
  const z = (value - mean) / sd;
  const t = 1.0 / (1.0 + 0.2316419 * Math.abs(z));
  const pdf = Math.exp(-(z * z) / 2) / Math.sqrt(2 * Math.PI);
  const p =
    pdf * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z >= 0 ? 1 - p : p;
}

/** 측정값을 한국 분포 percentile (0-100)로 환산. */
function toPercentile(value: number, mean: number, sd: number): number {
  return Math.round(normalCdf(value, mean, sd) * 100);
}

/** z-score */
function zscore(value: number, mean: number, sd: number): number {
  return sd === 0 ? 0 : (value - mean) / sd;
}

/* ──────────────────────────────────────────────────────────
 * 분류 메인
 * ────────────────────────────────────────────────────────── */

export function classifySilhouette(input: SilhouetteInput, sex: Sex): SilhouetteResult {
  const { bust, waist, hip } = input;
  const drops: DropValues = {
    dI: bust - waist,
    dII: hip - waist,
    dIII: hip - bust,
  };

  const centroids = centroidsFor(sex);
  const dist = distFor(sex);

  // 남성 또는 centroid 미정의 시: 임시 처리 (label만 추정, percentile null)
  if (centroids.length === 0 || !dist) {
    return makeFallbackResult(input, drops, sex);
  }

  // 한국 분포로 z-score (표준화 — centroid도 같은 분포에서 산출됨)
  const zdI = zscore(drops.dI, dist.dI.mean, dist.dI.sd);
  const zdII = zscore(drops.dII, dist.dII.mean, dist.dII.sd);
  const zdIII = zscore(drops.dIII, dist.dIII.mean, dist.dIII.sd);

  // 각 centroid와의 z-score 공간 Euclidean distance
  const distances = centroids.map((c) => {
    const czdI = zscore(c.dI, dist.dI.mean, dist.dI.sd);
    const czdII = zscore(c.dII, dist.dII.mean, dist.dII.sd);
    const czdIII = zscore(c.dIII, dist.dIII.mean, dist.dIII.sd);
    const d = Math.hypot(zdI - czdI, zdII - czdII, zdIII - czdIII);
    return { centroid: c, distance: d };
  });
  distances.sort((a, b) => a.distance - b.distance);

  const nearest = distances[0];
  const second = distances[1];

  // Inverted Triangle 특수 처리: dIII가 임계 이하면 우선 부여 (K-means엔 없음)
  let label: SilhouetteLabel = nearest.centroid.label;
  if (drops.dIII <= INVERTED_TRIANGLE_DIII_CM.value) {
    label = "InvertedTriangle";
  }

  // 신뢰도: 1순위와 2순위 거리 비율. 1순위 거리가 2순위보다 명확히 짧을수록 높음.
  const confidence = second ? 1 - nearest.distance / (nearest.distance + second.distance) : 1;

  // Percentile
  const percentiles: PercentileValues = {
    bust: toPercentile(bust, dist.bust.mean, dist.bust.sd),
    waist: toPercentile(waist, dist.waist.mean, dist.waist.sd),
    hip: toPercentile(hip, dist.hip.mean, dist.hip.sd),
    dI: toPercentile(drops.dI, dist.dI.mean, dist.dI.sd),
    dII: toPercentile(drops.dII, dist.dII.mean, dist.dII.sd),
    dIII: toPercentile(drops.dIII, dist.dIII.mean, dist.dIII.sd),
  };

  // 한국 빈도 (라벨별 합)
  const koreanFreq = centroids.filter((c) => c.label === label).reduce((sum, c) => sum + c.freq_pct, 0);

  return {
    label,
    labelKo: SILHOUETTE_LABELS[label],
    drops,
    nearestCentroid: { ...nearest.centroid, distance: nearest.distance },
    percentiles,
    confidence: Math.round(confidence * 100) / 100,
    koreanFreq,
    allDistances: distances,
  };
}

function makeFallbackResult(input: SilhouetteInput, drops: DropValues, sex: Sex): SilhouetteResult {
  // 남성 또는 centroid 미정의: dIII 부호로만 단순 분류 (PROVISIONAL)
  let label: SilhouetteLabel;
  if (drops.dIII <= INVERTED_TRIANGLE_DIII_CM.value) label = "InvertedTriangle";
  else if (drops.dIII >= 5) label = "Triangle";
  else label = "Rectangle";

  return {
    label,
    labelKo: SILHOUETTE_LABELS[label],
    drops,
    nearestCentroid: { label, dI: drops.dI, dII: drops.dII, dIII: drops.dIII, freq_pct: 0, distance: 0 },
    percentiles: null,
    confidence: 0, // 신뢰도 없음 (centroid 미정의)
    koreanFreq: 0,
    allDistances: [],
  };
}

/* ──────────────────────────────────────────────────────────
 * UI 텍스트 — describe
 * ────────────────────────────────────────────────────────── */

export function describeSilhouette(r: SilhouetteResult): string {
  const lines: string[] = [];
  lines.push(`${r.labelKo} (${r.label})`);
  if (r.koreanFreq > 0) {
    lines.push(`한국 20-39세 여성의 약 ${r.koreanFreq.toFixed(1)}%`);
  }
  if (r.percentiles) {
    const p = r.percentiles;
    lines.push(
      `위-아래 비율(P${p.dIII}) · 잘록 정도(상체 P${p.dI} / 하체 P${p.dII})`,
    );
  }
  if (r.nearestCentroid.subtype) {
    lines.push(`세부: ${r.nearestCentroid.subtype}`);
  }
  return lines.join("\n");
}

/* ──────────────────────────────────────────────────────────
 * 골격(SWN) vs 실루엣 인사이트 합성
 * ────────────────────────────────────────────────────────── */

export interface SkeletonHint {
  type: "스트레이트" | "웨이브" | "내추럴" | "보류";
}

/** 골격 결과 + 실루엣 결과를 합쳐 다른 인사이트 노출. */
export function silhouetteInsight(silhouette: SilhouetteResult, skeleton: SkeletonHint): string {
  const s = silhouette.label;
  const k = skeleton.type;

  // 20 조합 인사이트 (4 골격 × 5 실루엣). 상세는 추천 모듈에서.
  const matrix: Record<string, string> = {
    "스트레이트:Rectangle": "옆에서도 앞에서도 직선 — 깔끔한 핏의 옷이 잘 어울립니다.",
    "스트레이트:SoftHourglass": "단단한 뼈에 부드러운 곡선 — 자연스러운 라인의 옷이 어울립니다.",
    "스트레이트:Hourglass": "단단한 뼈에 살이 곡선으로 분포 — 핏을 강조하는 옷이 잘 어울립니다.",
    "스트레이트:Triangle": "단단한 골격에 골반이 큰 편 — 상체 라인을 살리는 옷이 좋습니다.",
    "스트레이트:InvertedTriangle": "단단한 골격에 상체가 발달 — 어깨를 부드럽게 정리하는 옷.",
    "웨이브:Rectangle": "부드러운 골격인데 외곽선은 직선 — 허리 라인을 만드는 옷이 효과적입니다.",
    "웨이브:SoftHourglass": "전형적인 웨이브 — 부드러운 골격에 은근한 곡선. 여성스러운 라인 추천.",
    "웨이브:Hourglass": "부드러운 골격에 살도 곡선 — 자연스러운 곡선을 살리는 부드러운 옷.",
    "웨이브:Triangle": "부드러운 골격 + 하체 발달 — 상체 강조 + 하체 정리 라인.",
    "웨이브:InvertedTriangle": "부드러운 골격인데 상체가 큼 — 매우 드문 케이스.",
    "내추럴:Rectangle": "굵은 골격 + 직선 외곽선 — 여유 있는 핏의 옷이 어울립니다.",
    "내추럴:SoftHourglass": "굵은 골격에 부드러운 곡선 — 자연스러운 핏과 곡선을 함께 살리는 옷.",
    "내추럴:Hourglass": "굵은 골격인데 외곽선 곡선 — 운동 등으로 만든 곡선, 핏 강조도 가능.",
    "내추럴:Triangle": "굵은 골격 + 하체 발달 — 상체 균형 잡는 디자인.",
    "내추럴:InvertedTriangle": "굵은 골격 + 상체 발달 — 어깨 정리 라인.",
    "보류:Rectangle": "골격 측정이 보류 상태입니다. 외곽선은 직사각형으로 분류됨.",
    "보류:SoftHourglass": "골격 측정이 보류 상태입니다. 외곽선은 부드러운 모래시계형으로 분류됨.",
    "보류:Hourglass": "골격 측정이 보류 상태입니다. 외곽선은 모래시계로 분류됨.",
    "보류:Triangle": "골격 측정이 보류 상태입니다. 외곽선은 삼각형으로 분류됨.",
    "보류:InvertedTriangle": "골격 측정이 보류 상태입니다. 외곽선은 역삼각형으로 분류됨.",
  };
  return matrix[`${k}:${s}`] ?? `${k} 골격 + ${SILHOUETTE_LABELS[s]} 외곽선`;
}
