/**
 * config.ts — 모든 임계값 · 가중치 · 정규화(norm)의 단일 진입점
 *
 * 설계 원칙: 분류 "로직"(faceShape.ts / bodyType.ts)에는 숫자를 하드코딩하지 않는다.
 *            모든 컷·가중치·norm은 여기 한 곳에만 둔다. 보정(calibration)은
 *            코드 수정 없이 이 파일의 값만 바꾸는 것으로 끝나야 한다.
 *
 * status 의미:
 *   "ESTABLISHED" = 측정 표준·문헌 근거가 있는 값 (그대로 사용 가능)
 *   "PROVISIONAL" = 일반인 평균에서 끌어온 시작값. 패션모델 표본으로 재보정 대상.
 *   "UNDETERMINED" = 원 연구에 직접 대응값이 없음. 임시 기본값 + 보정 필수.
 *
 * 모든 PROVISIONAL/UNDETERMINED 값은 데모에서 "참고용"으로 표시할 것.
 */

export type Sex = "female" | "male";
export type CalStatus = "ESTABLISHED" | "PROVISIONAL" | "UNDETERMINED";

interface Threshold<T = number> {
  value: T;
  status: CalStatus;
  source: string; // 근거 또는 임시 사유
}
const T = <T,>(value: T, status: CalStatus, source: string): Threshold<T> => ({ value, status, source });

/* ──────────────────────────────────────────────────────────
 * 1. 얼굴형 — 형태 계측 컷
 * ────────────────────────────────────────────────────────── */
export const FACE = {
  AR_low: T(1.398, "ESTABLISHED", "SizeKorea 8차(2021) 20-39세 P25, L = 눈살-이마(No.326) + 얼굴수직길이(No.108), n≈2333"),
  AR_high: T(1.579, "ESTABLISHED", "SizeKorea 8차 20-39 P75 (정규분포 가정 μ±0.674σ)"),
  FR_short: T(1.6, "ESTABLISHED", "안면비율 단/중/장모 [1] 문헌 인용"),
  FR_long: T(1.699, "ESTABLISHED", "안면비율 [1] 문헌 인용"),
  parallelTol: T(0.08, "PROVISIONAL", "|F-1|, |J-1| 동률 판정 '시작값' — Wf 한국 인체측정 표준 미수록(아래 참조)"),
  foreheadDominant: T(1.08, "PROVISIONAL", "F 이마 우세 '시작값' — Wf(이마너비)는 SizeKorea 5·6·7·8차 + KRISS 머리측정(#035) + CT 표준얼굴(#051) + 6차/청소년 3D + 얼굴유형분류(#045) + 3D 모델링(#046/052) + 국제비교(#029) 13건 전수 검색 미수록(한국 인체측정 표준 항목 아님)"),
  diamondMax: T(0.92, "PROVISIONAL", "마름모 F<,J< '시작값' (= 1-parallelTol). Wf 미보정으로 PROVISIONAL 유지"),
  jawNarrow: T(0.801, "ESTABLISHED", "SizeKorea 8차 20-39 J=Wj/Wc P25 — 인구 하위 25%가 V/하트형 후보"),
  // 하악각: 8차 미측정 → UNDETERMINED 유지.
  jawAngleAngular_deg: T(125, "UNDETERMINED", "각짐<->부드러움 임시 경계. 표본 보정 필수"),
};

/* ──────────────────────────────────────────────────────────
 * 2. 신뢰성(커머셜/비커머셜) — Todorov 4지표
 *   원 연구에 4지표용 회귀계수가 없음 → 균등가중(부호만 적용)을 기본값으로.
 * ────────────────────────────────────────────────────────── */
export const TRUST = {
  // Todorov, Baron & Oosterhof (2008) SCAN 3(2), Table 1 — "Regression coefficient" 열.
  // 부호는 우리 지표 정의(값↑ = 해당 특징↑) 기준으로 정렬:
  //  ① browAngle (눈썹 위로↑)         : 원 +0.13 (down→up)          -> +0.13
  //  ② cheekProjection (광대 돌출↑)   : 원 +0.13 (shallow→pronounced)-> +0.13
  //  ③ jawWidth (턱 넓을수록↑)        : 원 -0.21 (wide→thin 축)      -> 축 반전 +0.21
  //  ④ sellionDepth (셀리온 깊을수록↑): 원 -0.09 (shallow→deep)      -> -0.09  (※ 비유의, P>=.05)
  weights: T(
    { browAngle: 0.13, cheekProjection: 0.13, jawWidth: 0.21, sellionDepth: -0.09 },
    "ESTABLISHED",
    "Todorov·Baron·Oosterhof(2008) Table 1. 단 원계수는 FaceGen morph 단위 기준 -> 기하 z-score 적용은 근사."
  ),
  commercialCutZ: T(0, "UNDETERMINED", "가중합 임계. 라벨(커머셜/비커머셜) 데이터로 보정"),
  // z-score용 norm (지표별 평균/표준편차) — SizeKorea 8차 20-39 비율 (delta method, n≈2333)
  norm: T(
    {
      browAngle: { m: 0, s: 1 },                  // 8차 미수록 — 항등 유지
      cheekProjection: { m: 0.6729, s: 0.0603 },  // Wc/L (L=눈살-이마+얼굴수직길이) 남녀 평균
      jawWidth: { m: 0.8573, s: 0.0828 },         // Wj/Wc 남녀 평균
      sellionDepth: { m: 0, s: 1 },                // 8차 미수록 — 항등 유지
    },
    "PROVISIONAL",
    "SizeKorea 8차 20-39 Wc/L·Wj/Wc 남녀 평균 (delta method). browAngle·sellionDepth는 미수록 → 항등 norm (z=0)"
  ),
};

/* ──────────────────────────────────────────────────────────
 * 3. 골격 1층 (S/W/N) — 성별 분기
 * ────────────────────────────────────────────────────────── */
export const SWN = {
  // 1단계: 내추럴 점수
  shoulderSlopeAngular_deg: T(23.5, "ESTABLISHED", "SizeKorea 8차 20-39 P25 — 인구 하위 25% (각진 어깨) 컷, n≈2333"),
  natWeights: T({ shoulderAngular: 1.5, jointWidth: 1.5, lowSoftTissue: 1, thinNeck: 1 }, "PROVISIONAL", "임의 가중"),
  natThreshold: T(2.5, "PROVISIONAL", "Nscore>=2.5 -> 내추럴. 임의값"),
  jointWidthIndex: {
    female: T(6.05, "ESTABLISHED", "SizeKorea 8차 20-39 (팔꿈치+무릎)/2/키×100 여자 P75 (인구 상위 25% = 관절 넓음)"),
    male: T(6.03, "ESTABLISHED", "SizeKorea 8차 20-39 남자 P75"),
  },
  whtr: {
    female: T(0.422, "ESTABLISHED", "SizeKorea 8차 20-39 허리둘레/키 여자 P25 — 인구 하위 25% (내추럴 = 연조직 적음)"),
    male: T(0.449, "ESTABLISHED", "SizeKorea 8차 20-39 남자 P25"),
  },

  // 2단계: Straight(+) vs Wave(-) z합
  swMargin: T(0.5, "PROVISIONAL", "±임계. 안이면 경계(질감 1회 확인)"),
  // 측정 방향(컷이 아닌 표준): 흉곽 AP/횡경 >0.75 두꺼움 / <0.65 얇음 (ISO ICC 0.85~0.95)
  thoraxFlatRef: { thick: T(0.75, "ESTABLISHED", "ISO 7250-1 흉곽 AP/횡경"), thin: T(0.65, "ESTABLISHED", "ISO 7250-1") },
  bhrRef: T(0.97, "ESTABLISHED", "ISO 8559-1 가슴/엉덩이"),
  // 2단계 3지표 z-score norm — 골격(SWN)은 측면 두께·각도 전용 (2026-06-21)
  // bhr(가슴/엉덩이 둘레)은 lib/silhouette.ts 가 정면 외곽선 분류용으로 사용 — 직교 분리.
  swNorm: T(
    {
      thoraxFlat: { m: 0.7048, s: 0.0852 },   // 가슴두께(No.025)/가슴너비(No.018) 남녀 평균
      bustHeight: { m: 0.0, s: 1 },            // 8차 미수록 (측면 가슴정점/키) — 항등 유지
      waistPos: { m: 0.0, s: 1 },              // 8차 미수록 (측면 허리위치) — 항등 유지
    },
    "PROVISIONAL",
    "SizeKorea 8차 20-39 thoraxFlat 남녀 평균 (delta method, n≈2333). bustHeight·waistPos 8차 미수록 → 항등. " +
      "bhr 항목은 골격-실루엣 직교화로 제거 (silhouette.ts로 이관, 2026-06-21)."
  ),
};

/* ──────────────────────────────────────────────────────────
 * 4. 모델 보정 2층 — 3축 (성별 분기). 출처: 통합기준표 '수정본' 최종표.
 *   ⚠️ 버전 간 불일치 존재(남 좌고비 ≤51 vs ≤52.0). 수정본 값 채택.
 * ────────────────────────────────────────────────────────── */
export const AXES = {
  // ① 실루엣(여: 어깨/골반) / V-Taper(남: 가슴둘레-허리둘레 드롭, cm)
  // ⚠ 8차 "엉덩이너비"는 앉은 자세(앉은엉덩이너비)뿐, 우리 정면 측정과 정의 불일치 → 보정 보류
  silhouette: {
    female: { shoulderType: T(1.1, "PROVISIONAL", "어깨형>=1.10 (8차 hip 정의 불일치로 보류)"), curveType: T(1.0, "PROVISIONAL", "곡선형<1.00") },
    male: { vType_cm: T(21, "PROVISIONAL", "V형>=21cm, KS K 0050:2024"), straight_cm: T(16, "PROVISIONAL", "직선형<16cm") },
  },
  // ② 비율: 좌고비 = 앉은키/신장×100 — SizeKorea 8차 20-39 P25/P75
  ratio: {
    female: { longLeg: T(52.7, "ESTABLISHED", "SizeKorea 8차 20-39 sitting/height×100 여자 P25 (n=1230)"), longTorso: T(55.9, "ESTABLISHED", "여자 P75") },
    male: { longLeg: T(52.0, "ESTABLISHED", "SizeKorea 8차 20-39 남자 P25 (n=1103)"), longTorso: T(55.3, "ESTABLISHED", "남자 P75") },
  },
  // ③ 프레임: 어깨너비/신장 — SizeKorea 8차 20-39 P25/P75
  frame: {
    female: { slim: T(0.210, "ESTABLISHED", "SizeKorea 8차 20-39 shoulder/height 여자 P25 (n=1230)"), wide: T(0.227, "ESTABLISHED", "여자 P75") },
    male: { slim: T(0.221, "ESTABLISHED", "SizeKorea 8차 20-39 남자 P25 (n=1103)"), wide: T(0.239, "ESTABLISHED", "남자 P75") },
  },
};

/** 보정 대상 한눈에 보기 — UI 배지/감사용 */
export function calibrationAudit() {
  const flat: { path: string; status: CalStatus; source: string }[] = [];
  const walk = (obj: any, prefix: string) => {
    for (const k of Object.keys(obj)) {
      const v = obj[k];
      if (v && typeof v === "object" && "status" in v && "source" in v) {
        flat.push({ path: `${prefix}.${k}`, status: v.status, source: v.source });
      } else if (v && typeof v === "object") {
        walk(v, `${prefix}.${k}`);
      }
    }
  };
  walk({ FACE, TRUST, SWN, AXES }, "");
  return flat;
}
