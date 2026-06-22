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

  // 진단 인사이트 — 골격(뼈·두께, 옆모습)과 외곽선(살·옷 비율, 앞모습)이
  // 어떻게 일치/불일치하는지, 그래서 몸이 어떤 상태인지 설명. (옷 추천은 스타일링 탭)
  // 3 골격 × 5 외곽선 = 15조합. 보류는 fallbackMsg로 처리.
  const matrix: Record<string, string> = {
    // ── 스트레이트 (뼈 단단·흉곽 두꺼움·상체 볼륨이 골격에서 옴) ──
    "스트레이트:Rectangle":
      "뼈대도 곧고 앞에서 본 라인도 직선이에요. 골격과 외곽선이 일치하며, 타고난 단단한 상체가 그대로 드러나는 스트레이트입니다.",
    "스트레이트:SoftHourglass":
      "단단한 골격 위에 허리가 한국 평균보다 살짝 들어가 있어요. 뼈는 직선적인데 외곽선엔 은근한 곡선이 있는, 균형 잡힌 스트레이트예요.",
    "스트레이트:Hourglass":
      "단단한 골격인데 허리가 뚜렷이 잘록해요. 가슴·엉덩이 볼륨이 골격에서 오고 거기에 허리 곡선까지 더해진, 굴곡이 강한 케이스입니다.",
    "스트레이트:Triangle":
      "상체 골격은 단단한데 외곽선은 엉덩이가 더 큰 쪽이에요. 즉 하체 볼륨이 뼈대보다 살·골반에서 오는, 상하 무게중심이 갈리는 몸이에요.",
    "스트레이트:InvertedTriangle":
      "단단한 골격에 상체 너비까지 더해져 어깨·가슴이 엉덩이보다 확실히 넓어요. 골격과 외곽선이 모두 상체 우세를 가리키는 드문 조합입니다.",

    // ── 웨이브 (뼈 부드러움·흉곽 얇음·살이 아래쪽에 잘 붙음) ──
    "웨이브:Rectangle":
      "뼈는 부드러운데 앞에서 본 허리 라인은 평평해요. 곡선을 만들 골격은 가졌지만 현재 허리에 굴곡이 적게 드러나는 상태예요.",
    "웨이브:SoftHourglass":
      "부드러운 골격에 허리도 자연스럽게 들어가, 골격과 외곽선이 일치하는 웨이브예요. 뼈와 외곽선이 모두 부드러운 곡선을 가리킵니다.",
    "웨이브:Hourglass":
      "부드러운 골격에 허리가 강하게 잘록해요. 얇은 흉곽과 또렷한 허리 곡선이 만나 굴곡이 가장 살아나는 웨이브 케이스입니다.",
    "웨이브:Triangle":
      "부드러운 골격에 엉덩이가 가슴보다 큰 하체 발달형이에요. 웨이브 특유의 '살이 아래로 모이는' 경향이 외곽선에도 그대로 나타나요.",
    "웨이브:InvertedTriangle":
      "부드러운 골격인데 외곽선은 상체가 더 넓게 나왔어요. 웨이브에선 드문 조합이라, 자세나 촬영 각도의 영향일 수 있어 한 번 더 확인해보세요.",

    // ── 내추럴 (뼈 크고 관절 도드라짐·프레임 자체가 큼) ──
    "내추럴:Rectangle":
      "골격이 크고 앞에서 본 라인도 직선이에요. 뼈대가 굵고 허리 굴곡이 적은, 골격과 외곽선이 일치하는 내추럴입니다.",
    "내추럴:SoftHourglass":
      "큰 골격에 허리가 한국 평균보다 살짝 들어가 있어요. 뼈대감은 있지만 외곽선엔 은근한 곡선이 더해진 내추럴이에요.",
    "내추럴:Hourglass":
      "큰 골격인데 허리가 뚜렷이 잘록해요. 굵은 뼈대에 또렷한 허리 곡선이 공존하는, 골격감과 굴곡을 함께 가진 케이스입니다.",
    "내추럴:Triangle":
      "큰 골격에 엉덩이·골반이 가슴보다 넓어요. 뼈대도 크고 외곽선도 하체 우세라, 하체 프레임이 특히 도드라지는 내추럴이에요.",
    "내추럴:InvertedTriangle":
      "큰 골격에 어깨·가슴 너비가 엉덩이보다 넓어요. 굵은 뼈대와 상체 우세 외곽선이 만나 상체 프레임이 강조되는 조합입니다.",
  };
  const key = `${k}:${s}`;
  if (matrix[key]) return matrix[key];
  // 보류(측면 사진 부족) 또는 미정의 — 외곽선만 안내
  return `측면 사진이 부족해 골격 타입은 보류이고, 앞에서 본 외곽선은 ${SILHOUETTE_LABELS[s]}으로 분류됐어요. 측면 사진을 추가하면 골격까지 함께 볼 수 있어요.`;
}
