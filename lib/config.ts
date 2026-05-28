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
  AR_low: T(1.25, "PROVISIONAL", "기술문서 ver3 §1.1 '시작값'"),
  AR_high: T(1.5, "PROVISIONAL", "기술문서 ver3 §1.1 '시작값'"),
  FR_short: T(1.6, "ESTABLISHED", "안면비율 단/중/장모 [1] 문헌 인용"),
  FR_long: T(1.699, "ESTABLISHED", "안면비율 [1] 문헌 인용"),
  parallelTol: T(0.08, "PROVISIONAL", "|F-1|, |J-1| 동률 판정 '시작값'"),
  foreheadDominant: T(1.08, "PROVISIONAL", "F 이마 우세 '시작값'"),
  diamondMax: T(0.92, "PROVISIONAL", "마름모 F<,J< '시작값' (= 1-parallelTol)"),
  jawNarrow: T(0.9, "PROVISIONAL", "J 턱 좁음 '시작값'"),
  // 하악각: 문서에 수치 컷 없음("작을수록 각짐"). 임시 경계.
  jawAngleAngular_deg: T(125, "UNDETERMINED", "각짐<->부드러움 임시 경계. 표본 보정 필수"),
  // ⚠️ INCONSISTENCY: AR과 FR이 문서상 둘 다 L/W_c로 정의됨(스케일 불일치).
  //    구현 전 FR의 분모/분자 정의를 원문에서 재확인할 것. 일단 AR=L/W_c로 사용.
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
  // z-score용 norm (지표별 평균/표준편차) — 표본으로 채울 것
  norm: T(
    { browAngle: { m: 0, s: 1 }, cheekProjection: { m: 0, s: 1 }, jawWidth: { m: 0, s: 1 }, sellionDepth: { m: 0, s: 1 } },
    "UNDETERMINED",
    "데모용 항등 norm. 파일럿 표본의 지표별 평균/SD로 교체"
  ),
};

/* ──────────────────────────────────────────────────────────
 * 3. 골격 1층 (S/W/N) — 성별 분기
 * ────────────────────────────────────────────────────────── */
export const SWN = {
  // 1단계: 내추럴 점수
  shoulderSlopeAngular_deg: T(16, "PROVISIONAL", "ASTM D5219 측정신뢰도는 확정, 16° 적용 컷은 잠정"),
  natWeights: T({ shoulderAngular: 1.5, jointWidth: 1.5, lowSoftTissue: 1, thinNeck: 1 }, "PROVISIONAL", "임의 가중"),
  natThreshold: T(2.5, "PROVISIONAL", "Nscore>=2.5 -> 내추럴. 임의값"),
  jointWidthIndex: { female: T(5.2, "PROVISIONAL", "ISAK·SizeKorea 평균"), male: T(5.5, "PROVISIONAL", "ISAK·차수정2019") },
  whtr: { female: T(0.43, "PROVISIONAL", "WHO 일반평균"), male: T(0.45, "PROVISIONAL", "WHO 일반평균") },

  // 2단계: Straight(+) vs Wave(-) z합
  swMargin: T(0.5, "PROVISIONAL", "±임계. 안이면 경계(질감 1회 확인)"),
  // 측정 방향(컷이 아닌 표준): 흉곽 AP/횡경 >0.75 두꺼움 / <0.65 얇음 (ISO ICC 0.85~0.95)
  thoraxFlatRef: { thick: T(0.75, "ESTABLISHED", "ISO 7250-1 흉곽 AP/횡경"), thin: T(0.65, "ESTABLISHED", "ISO 7250-1") },
  bhrRef: T(0.97, "ESTABLISHED", "ISO 8559-1 가슴/엉덩이"),
  // 2단계 4지표 z-score norm (성별별) — 표본으로 채울 것
  swNorm: T(
    {
      thoraxFlat: { m: 0.7, s: 0.08 },
      bhr: { m: 0.97, s: 0.05 },
      bustHeight: { m: 0.0, s: 1 },
      waistPos: { m: 0.0, s: 1 },
    },
    "UNDETERMINED",
    "데모용 임시 norm. 파일럿으로 성별별 교체"
  ),
};

/* ──────────────────────────────────────────────────────────
 * 4. 모델 보정 2층 — 3축 (성별 분기). 출처: 통합기준표 '수정본' 최종표.
 *   ⚠️ 버전 간 불일치 존재(남 좌고비 ≤51 vs ≤52.0). 수정본 값 채택.
 * ────────────────────────────────────────────────────────── */
export const AXES = {
  // ① 실루엣(여: 어깨/골반) / V-Taper(남: 가슴둘레-허리둘레 드롭, cm)
  silhouette: {
    female: { shoulderType: T(1.1, "PROVISIONAL", "어깨형>=1.10"), curveType: T(1.0, "PROVISIONAL", "곡선형<1.00") },
    male: { vType_cm: T(21, "PROVISIONAL", "V형>=21cm, KS K 0050:2024"), straight_cm: T(16, "PROVISIONAL", "직선형<16cm") },
  },
  // ② 비율: 좌고비 = 앉은키/신장×100
  ratio: {
    female: { longLeg: T(50, "PROVISIONAL", "롱레그<=50"), longTorso: T(52.1, "PROVISIONAL", "롱토르소>=52.1") },
    male: { longLeg: T(52.0, "PROVISIONAL", "롱레그<=52.0 (수정본)"), longTorso: T(53.6, "PROVISIONAL", "롱토르소>=53.6") },
  },
  // ③ 프레임: 어깨너비/신장
  frame: {
    female: { slim: T(0.225, "PROVISIONAL", "슬림<=0.225"), wide: T(0.235, "PROVISIONAL", "와이드>=0.235") },
    male: { slim: T(0.244, "PROVISIONAL", "슬림<=0.244 (수정본)"), wide: T(0.256, "PROVISIONAL", "와이드>=0.256") },
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
