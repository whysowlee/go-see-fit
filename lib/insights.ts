/**
 * insights.ts — 분류 결과 → "정의 + 산출 근거 + 본인 위치" 인사이트 생성.
 *
 * 1차 피드백 직격:
 *   • S/W/N이 무엇으로 정의되는지, 본인 위치 어디인지 설명
 *   • 어떤 요소 때문에 스트레이트 ~% 가 나오는지 (점수 근거)
 *   • 비율 나눌 때 상위 X% 등 백분위 노출
 *   • 롱레그 내 세분화 (극단/평균)
 *
 * 입력: 분류 결과 + 측정값 (BodyMeasurements) + 한국 분포 norm
 * 출력: 카드에 표시할 5가지 정보 (정의·근거 4개·위치·빈도·세분화)
 *
 * 사용 위치: result/page.tsx 에서 호출 → InsightPanel.tsx 에 전달.
 */
import type { FaceShape, FaceMetrics } from "./faceShape";
import type { Skeleton, BodyMeasurements } from "./bodyType";
import type { Sex } from "./config";
import { SWN, AXES, TRUST } from "./config";

/** 단일 metric의 산출 근거 — "왜 이 분류인지" 노출용 */
export interface ReasonItem {
  /** metric 라벨 (사용자 친화 표현) */
  label: string;
  /** 본인 측정값 */
  value: number;
  /** 단위 (cm, °, ratio 등) */
  unit?: string;
  /** 한국 평균 대비 z-score (양수 = 평균 위) */
  z: number;
  /** 분류 방향 기여 ("스트레이트 쪽" / "웨이브 쪽" 등) */
  direction: string;
  /** 한 줄 설명 */
  note?: string;
}

/** 분류 결과 통합 인사이트 */
export interface Insight {
  /** 분류명 (예: "웨이브", "장방형", "롱레그") */
  label: string;
  /** 이게 무엇인가 — 1-2문장 정의 */
  what: string;
  /** 산출 근거 4개 — z-score 기반 */
  reasoning: ReasonItem[];
  /** 본인 위치 — "한국 여성 X% 잘록 (상위 25%)" */
  position: string;
  /** 한국 인구 빈도 (선택) */
  koreanFreq?: string;
}

/* ──────────────────────────────────────────────────────────
 * 분류별 정의 — 단순 lookup
 * ────────────────────────────────────────────────────────── */

const SWN_DEFINITION: Record<Skeleton | "보류", string> = {
  스트레이트:
    "단단한 골격 + 두꺼운 흉곽. 옆에서 보면 가슴이 앞으로 도드라지고 평면적. 어깨가 곧고 직선적.",
  웨이브:
    "부드러운 골격 + 얇은 흉곽. 옆에서 보면 가슴이 평평하고 곡선적. 관절이 작고 어깨가 부드럽게 떨어짐.",
  내추럴:
    "단단한 뼈와 큰 관절. 어깨가 각지고 팔꿈치·무릎이 도드라짐. 살보다는 골격 형태가 두드러짐.",
  보류: "측면 사진이 부족해 골격 판정 보류.",
};

const FACESHAPE_DEFINITION: Record<FaceShape, string> = {
  둥근형: "광대가 가장 넓음 + 턱·이마 너비 비슷 + 부드러운 곡선. 길이는 짧은 편.",
  사각형: "광대 기준으로 위·아래 비슷 + 각진 턱. 길이는 짧은 편.",
  장방형: "광대 기준 위·아래 비슷 + 긴 얼굴. 길이가 너비보다 1.6배 이상.",
  계란형: "광대가 가장 넓음 + 턱이 약간 좁음 + 부드러운 곡선. 균형 잡힌 곡선형.",
  역삼각형: "이마가 광대·턱보다 넓음. 윗부분이 가장 넓고 턱이 좁아짐.",
  마름모형: "광대가 가장 넓음 + 이마와 턱 모두 좁음. 중간이 가장 넓은 다이아 모양.",
};

const RATIO_DEFINITION = {
  롱레그: "다리 길이가 상체보다 김. 앉은키 비율이 한국 여성 평균보다 작음.",
  밸런스: "다리와 상체 비율이 한국 여성 평균에 가까움.",
  롱토르소: "상체가 다리보다 김. 앉은키 비율이 평균보다 큼.",
} as const;

const FRAME_DEFINITION = {
  슬림: "어깨너비가 키 대비 좁은 편. 한국 여성 평균보다 작은 프레임.",
  미디엄: "어깨너비가 키 대비 평균에 가까움. 표준 프레임.",
  와이드: "어깨너비가 키 대비 넓은 편. 한국 여성 평균보다 큰 프레임.",
} as const;

/* ──────────────────────────────────────────────────────────
 * 통계 헬퍼
 * ────────────────────────────────────────────────────────── */

function normalCdf(value: number, mean: number, sd: number): number {
  if (sd === 0) return value >= mean ? 1 : 0;
  const z = (value - mean) / sd;
  const t = 1.0 / (1.0 + 0.2316419 * Math.abs(z));
  const pdf = Math.exp(-(z * z) / 2) / Math.sqrt(2 * Math.PI);
  const p = pdf * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z >= 0 ? 1 - p : p;
}

function toPercentile(value: number, mean: number, sd: number): number {
  return Math.round(normalCdf(value, mean, sd) * 100);
}

function zscore(value: number, mean: number, sd: number): number {
  return sd === 0 ? 0 : (value - mean) / sd;
}

/** 백분위 → "상위 X%" / "하위 X%" 자연어 */
function percentileText(p: number, metricLabel: string): string {
  if (p >= 90) return `${metricLabel}이 한국 여성 상위 10% (매우 두드러짐)`;
  if (p >= 75) return `${metricLabel}이 한국 여성 상위 25% (도드라지는 편)`;
  if (p >= 60) return `${metricLabel}이 한국 여성 평균 위`;
  if (p >= 40) return `${metricLabel}이 한국 여성 평균 부근`;
  if (p >= 25) return `${metricLabel}이 한국 여성 평균 아래`;
  if (p >= 10) return `${metricLabel}이 한국 여성 하위 25% (반대 경향)`;
  return `${metricLabel}이 한국 여성 하위 10% (강한 반대 경향)`;
}

/** z-score → 분류 방향 자연어 */
function directionFromZ(z: number, positive: string, negative: string): string {
  if (z > 0.5) return `${positive} (+${z.toFixed(1)}σ)`;
  if (z < -0.5) return `${negative} (${z.toFixed(1)}σ)`;
  return `평균 (${z >= 0 ? "+" : ""}${z.toFixed(1)}σ)`;
}

/* ──────────────────────────────────────────────────────────
 * SWN (골격) Insight
 * ────────────────────────────────────────────────────────── */

export function getSkeletonInsight(skel: Skeleton | "보류", meas: BodyMeasurements, sex: Sex): Insight {
  const swNorm = SWN.swNorm.value;
  const wRef = sex === "female" ? SWN.whtr.female.value : SWN.whtr.male.value;
  const jwRef = sex === "female" ? SWN.jointWidthIndex.female.value : SWN.jointWidthIndex.male.value;

  // 4가지 근거 metric의 z-score
  const reasoning: ReasonItem[] = [
    {
      label: "흉곽 두께/너비 비율 (thoraxFlat)",
      value: meas.thoraxFlat,
      z: zscore(meas.thoraxFlat, swNorm.thoraxFlat.m, swNorm.thoraxFlat.s),
      direction: directionFromZ(
        zscore(meas.thoraxFlat, swNorm.thoraxFlat.m, swNorm.thoraxFlat.s),
        "두꺼움 (스트레이트 쪽)",
        "얇음 (웨이브 쪽)",
      ),
      note: "옆에서 본 가슴 두께 / 정면 너비 비율. 두꺼우면 스트레이트.",
    },
    {
      label: "어깨 경사각",
      value: meas.shoulderSlopeDeg,
      unit: "°",
      z: (meas.shoulderSlopeDeg - SWN.shoulderSlopeAngular_deg.value) / 5,
      direction: meas.shoulderSlopeDeg >= SWN.shoulderSlopeAngular_deg.value ? "각짐 (내추럴 쪽)" : "부드러움",
      note: `${SWN.shoulderSlopeAngular_deg.value}° 이상이면 각진 어깨 (한국 P25)`,
    },
    {
      label: "관절 폭 지수",
      value: meas.jointWidthIndex,
      z: (meas.jointWidthIndex - jwRef) / 0.5,
      direction: meas.jointWidthIndex >= jwRef ? "관절 큼 (내추럴 쪽)" : "관절 작음 (웨이브 쪽)",
      note: `(팔꿈치+무릎)/2 / 키. ${jwRef.toFixed(2)} 이상이면 내추럴 신호 (한국 P75)`,
    },
    {
      label: "허리 둘레 / 키",
      value: meas.whtr,
      z: (wRef - meas.whtr) / 0.03,
      direction: meas.whtr <= wRef ? "연조직 적음 (내추럴 쪽)" : "연조직 많음",
      note: `${wRef.toFixed(2)} 이하면 가는 허리 (한국 P25 내추럴 신호)`,
    },
  ];

  // 한국 빈도 (대략)
  const freqMap: Record<Skeleton | "보류", string> = {
    스트레이트: "한국 여성 약 25% (정확치 미공식, 패션업계 통념)",
    웨이브: "한국 여성 약 50% (다수)",
    내추럴: "한국 여성 약 25%",
    보류: "",
  };

  // 본인 위치 — 가장 강한 신호 metric으로
  const sortedZ = [...reasoning].sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
  const topReason = sortedZ[0];
  const position = `${skel} 결과의 주된 근거: ${topReason.label}이 ${topReason.direction}`;

  return {
    label: skel,
    what: SWN_DEFINITION[skel],
    reasoning,
    position,
    koreanFreq: freqMap[skel],
  };
}

/* ──────────────────────────────────────────────────────────
 * 얼굴형 Insight
 * ────────────────────────────────────────────────────────── */

export function getFaceShapeInsight(faceShape: FaceShape, m: FaceMetrics): Insight {
  // F=Wf/Wc, J=Wj/Wc, T=Wf/Wj, AR=L/Wc
  // 한국 8차 평균 비교
  const F_avg = 1.0; // 일반 통념
  const J_avg = 0.86; // SK 8차 여성 평균
  const T_avg = 1.0;
  const AR_avg = 1.49; // SK 8차 여성 L_est / Wc

  const reasoning: ReasonItem[] = [
    {
      label: "이마/광대 비율 (F)",
      value: m.F,
      z: (m.F - F_avg) / 0.08,
      direction: m.F >= 1.08 ? "이마 우세 (역삼각 신호)" : m.F < 0.92 ? "이마 좁음 (마름모 신호)" : "광대와 비슷",
      note: "Wf/Wc. 1보다 크면 이마가 광대보다 넓음.",
    },
    {
      label: "턱/광대 비율 (J)",
      value: m.J,
      z: (m.J - J_avg) / 0.08,
      direction: m.J >= 1.08 ? "턱 큼 (사각 신호)" : m.J < 0.801 ? "턱 좁음 (V/하트 신호)" : "광대와 비슷",
      note: `Wj/Wc. ${J_avg.toFixed(2)} 부근이 한국 평균.`,
    },
    {
      label: "얼굴 종횡비 (AR)",
      value: m.AR,
      z: (m.AR - AR_avg) / 0.27,
      direction: m.AR >= 1.579 ? "긴 얼굴 (장방 쪽)" : m.AR < 1.398 ? "짧은 얼굴 (둥근/사각 쪽)" : "표준 길이",
      note: `L/Wc. ${AR_avg.toFixed(2)} 부근이 한국 평균.`,
    },
    {
      label: "이마/턱 비율 (T)",
      value: m.T,
      z: (m.T - T_avg) / 0.1,
      direction: m.T > 1 ? "이마 > 턱 (역삼각)" : m.T < 1 ? "턱 > 이마 (사각)" : "비슷",
      note: "Wf/Wj. 위쪽이 더 넓은지.",
    },
  ];

  // 한국 빈도 (대략 — 얼굴형은 한국 공식 분포 X)
  const freqMap: Record<FaceShape, string> = {
    둥근형: "한국 여성에서 흔한 편",
    사각형: "한국 여성에서 흔한 편",
    장방형: "한국 여성에서 보통",
    계란형: "균형 잡힌 형태로 비교적 흔함",
    역삼각형: "한국 여성에서 드문 편",
    마름모형: "한국 여성에서 드문 편",
  };

  const sortedZ = [...reasoning].sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
  const topReason = sortedZ[0];
  const position = `${faceShape} 판정의 핵심: ${topReason.direction}`;

  return {
    label: faceShape,
    what: FACESHAPE_DEFINITION[faceShape],
    reasoning,
    position,
    koreanFreq: freqMap[faceShape],
  };
}

/* ──────────────────────────────────────────────────────────
 * 비율 (롱레그/밸런스/롱토르소) Insight — 백분위 + 세분화
 * ────────────────────────────────────────────────────────── */

export function getRatioInsight(ratio: keyof typeof RATIO_DEFINITION, meas: BodyMeasurements, sex: Sex): Insight {
  // SK 8차 좌고비 분포 (대략, 여성 P25=52.7, P75=55.9, 평균 ~54.3)
  const distMean = sex === "female" ? 54.3 : 53.7;
  const distSd = sex === "female" ? 1.5 : 1.4;
  const longLegCut = AXES.ratio[sex].longLeg.value;
  const longTorsoCut = AXES.ratio[sex].longTorso.value;

  const sittingRatio = meas.sittingHeightRatio;
  const percentile = toPercentile(sittingRatio, distMean, distSd);

  // 세분화 — 본인이 그 분류 안에서 극단/평균
  let subdivision = "";
  if (ratio === "롱레그") {
    // 좌고비 작음 = 다리 김. P25 이하인데 더 작으면 극단
    if (percentile <= 10) subdivision = "롱레그 *최상단* (한국 여성 하위 10% 좌고비 = 다리 매우 김)";
    else if (percentile <= 20) subdivision = "롱레그 안에서 두드러진 편";
    else subdivision = "롱레그 경계 부근";
  } else if (ratio === "롱토르소") {
    if (percentile >= 90) subdivision = "롱토르소 *최상단* (한국 여성 상위 10% 좌고비 = 상체 매우 김)";
    else if (percentile >= 80) subdivision = "롱토르소 안에서 두드러진 편";
    else subdivision = "롱토르소 경계 부근";
  } else {
    subdivision = "평균 부근 (밸런스)";
  }

  const reasoning: ReasonItem[] = [
    {
      label: "좌고비 (앉은키/키 × 100)",
      value: sittingRatio,
      z: zscore(sittingRatio, distMean, distSd),
      direction: ratio === "롱레그" ? "다리 김" : ratio === "롱토르소" ? "상체 김" : "균형",
      note: `한국 ${sex === "female" ? "여성" : "남성"} 평균 ${distMean.toFixed(1)} ± ${distSd.toFixed(1)}. 본인 = P${percentile}`,
    },
    {
      label: "분류 경계",
      value: 0,
      z: 0,
      direction: "한국 분포 기준",
      note: `${longLegCut.toFixed(1)} 이하 = 롱레그 / ${longTorsoCut.toFixed(1)} 이상 = 롱토르소 (그 사이 = 밸런스)`,
    },
  ];

  return {
    label: ratio,
    what: RATIO_DEFINITION[ratio],
    reasoning,
    position: subdivision,
    koreanFreq: `한국 ${sex === "female" ? "여성" : "남성"} 분포에서 본인 = P${percentile}`,
  };
}

/* ──────────────────────────────────────────────────────────
 * 프레임 (슬림/미디엄/와이드) Insight
 * ────────────────────────────────────────────────────────── */

export function getFrameInsight(frame: keyof typeof FRAME_DEFINITION, meas: BodyMeasurements, sex: Sex): Insight {
  // SK 8차 어깨/키 분포 (대략, 여성 P25=0.210, P75=0.227, 평균 ~0.218)
  const distMean = sex === "female" ? 0.218 : 0.230;
  const distSd = sex === "female" ? 0.013 : 0.013;
  const slimCut = AXES.frame[sex].slim.value;
  const wideCut = AXES.frame[sex].wide.value;
  const shoulderRatio = meas.shoulderHeightRatio;
  const percentile = toPercentile(shoulderRatio, distMean, distSd);

  let subdivision = "";
  if (frame === "슬림") {
    if (percentile <= 10) subdivision = "슬림 *최상단* (한국 여성 하위 10% 어깨)";
    else subdivision = "슬림 안에서 평균";
  } else if (frame === "와이드") {
    if (percentile >= 90) subdivision = "와이드 *최상단* (한국 여성 상위 10% 어깨)";
    else subdivision = "와이드 안에서 평균";
  } else {
    subdivision = "미디엄 (평균 부근)";
  }

  const reasoning: ReasonItem[] = [
    {
      label: "어깨너비 / 키",
      value: shoulderRatio,
      z: zscore(shoulderRatio, distMean, distSd),
      direction: frame === "슬림" ? "좁음" : frame === "와이드" ? "넓음" : "표준",
      note: `한국 ${sex === "female" ? "여성" : "남성"} 평균 ${distMean.toFixed(3)} ± ${distSd.toFixed(3)}. 본인 = P${percentile}`,
    },
    {
      label: "분류 경계",
      value: 0,
      z: 0,
      direction: "한국 분포 기준",
      note: `${slimCut.toFixed(3)} 이하 = 슬림 / ${wideCut.toFixed(3)} 이상 = 와이드`,
    },
  ];

  return {
    label: frame,
    what: FRAME_DEFINITION[frame],
    reasoning,
    position: subdivision,
    koreanFreq: `한국 ${sex === "female" ? "여성" : "남성"} 분포에서 본인 = P${percentile}`,
  };
}

/* ──────────────────────────────────────────────────────────
 * Todorov 인상 Insight
 * ────────────────────────────────────────────────────────── */

export function getImpressionInsight(label: "커머셜" | "비커머셜" | "경계", m: FaceMetrics): Insight {
  const norm = TRUST.norm.value;
  const w = TRUST.weights.value;

  // 4지표 z-score (cheekProjection, jawWidth는 산출, browAngle·sellionDepth는 항등)
  const cheekZ = zscore(m.Wc / m.L, norm.cheekProjection.m, norm.cheekProjection.s);
  const jawZ = zscore(m.J, norm.jawWidth.m, norm.jawWidth.s);

  const reasoning: ReasonItem[] = [
    {
      label: "광대 돌출 정도 (Wc/L)",
      value: m.Wc / m.L,
      z: cheekZ,
      direction: cheekZ > 0 ? "광대 도드라짐 (+신뢰성)" : "광대 평탄 (-신뢰성)",
      note: `한국 평균 ${norm.cheekProjection.m.toFixed(2)} ± ${norm.cheekProjection.s.toFixed(2)}`,
    },
    {
      label: "턱 너비 (J)",
      value: m.J,
      z: jawZ,
      direction: jawZ > 0 ? "턱 넓음 (+신뢰성)" : "턱 좁음 (-신뢰성)",
      note: `Todorov 회귀계수 ${w.jawWidth} (가장 큰 가중)`,
    },
  ];

  const WHAT: Record<typeof label, string> = {
    커머셜: "친근·자연스러운 인상. 일상 상업 광고에 적합한 얼굴.",
    비커머셜: "독특·강렬한 인상. 컨셉추얼·아방가르드 표현에 적합.",
    경계: "두 방향 모두 가능. 메이크업·스타일링으로 어느 쪽이든 강조 가능.",
  };

  return {
    label,
    what: WHAT[label],
    reasoning,
    position: `Todorov 4지표 가중합 z-score 기준 ${label}`,
  };
}
