/**
 * makeup.ts — 얼굴형 × 인상(Todorov 커머셜) × 퍼스널컬러 메이크업 추천.
 *
 * 출처: makeup_color_logic.docx
 *   - 표 2: 얼굴형 × 인상 12조합 (형태 보정 + 인상별 가이드)
 *   - 표 A: 퍼스널컬러 × 인상 핵심 색조 (4 × 2 = 8조합)
 *   - 표 B: 얼굴형별 색조 배치·강도
 *
 * 입력:
 *   - faceShape: FaceShape (6분류)
 *   - impression: "soft" (커머셜) | "sharp" (비커머셜) | "boundary"
 *   - personalColor: PersonalColor (선택, 없으면 색 추천 일반)
 *
 * 출력: 형태 보정 + 인상별 추천 + 색 추천 (퍼스널컬러 입력 시) + 배치 추천
 */
import type { FaceShape } from "./faceShape";
import type { PersonalColor } from "./personalColor";

export type Impression = "soft" | "sharp" | "boundary";

export interface MakeupGuide {
  /** 형태 보정 (얼굴형 공통, 인상 무관) */
  shapeCorrection: string;
  /** 인상별 추천 (soft 또는 sharp) */
  impressionGuide: string;
  /** 색조 배치·강도 (얼굴형 기반, 표 B) */
  placement: {
    recommended: string;
    avoid: string;
  };
  /** 퍼스널컬러 × 인상 색 추천 (입력 시) */
  colorPalette: {
    recommended: string;
    softTone?: string; // 인상 soft일 때 더 적합한 톤
    sharpTone?: string; // 인상 sharp일 때 더 적합한 톤
    avoid: string;
  } | null;
  /** 립 색 (원하는 인상 보조 — 기본 4가지) */
  lipByDesiredImage: Record<
    "능력·교양" | "품위" | "매력" | "자연스러움",
    string
  >;
}

/* ──────────────────────────────────────────────────────────
 * 표 2: 얼굴형 × 인상 12조합 (형태 보정 + 인상 가이드)
 * ────────────────────────────────────────────────────────── */

interface FaceMakeupRow {
  shapeCorrection: string;
  soft: string;
  sharp: string;
}

const FACE_MAKEUP: Record<FaceShape, FaceMakeupRow> = {
  둥근형: {
    shapeCorrection: "또렷·살짝 각진 눈썹 / 이마·턱끝 세로 하이라이트, 양옆 세로 셰이딩",
    soft: "가벼운 음영 + 자연 눈썹, 코랄·핑크, 포인트 분산",
    sharp: "강한 컨투어·각진 눈썹·스모키로 또렷하게 (대비 전환)",
  },
  사각형: {
    shapeCorrection: "두꺼운 일자(분위기 유지) 또는 둥근 완만 눈썹 / 턱선 곡선 셰이딩",
    soft: "곡선 눈썹 + 부드러운 블러셔, 누드·로즈, 글로시",
    sharp: "강한 일자 눈썹 + 매트 립으로 시크·모던 (유사 강조)",
  },
  장방형: {
    shapeCorrection: "가로로 길고 두꺼운 눈썹 / 가로 블러셔, 이마·턱 가로 셰이딩",
    soft: "가로 블러셔 자연스럽게, 내추럴 립",
    sharp: "또렷한 가로 라인 + 진한 립으로 길이 단축 강조",
  },
  역삼각형: {
    shapeCorrection: "눈썹산 높은 아치형 / 턱 하이라이트, 광대 아래 볼륨",
    soft: "자연 아치 + 하관 블러셔, 부드러운 색",
    sharp: "또렷한 아치 + 강한 립으로 시선 하단 유도",
  },
  계란형: {
    shapeCorrection: "균형형, 대부분 수용 / 절제된 포인트",
    soft: "본연 살린 내추럴",
    sharp: "어떤 컨셉도 소화 (실험 자유도 높음)",
  },
  마름모형: {
    shapeCorrection: "완만한 눈썹 / 광대 밖 옅은 블러셔, 광대 셰이딩",
    soft: "광대 부드럽게 정돈 + 중앙 집중",
    sharp: "광대 강조한 모던·시크 룩 (유사 강조)",
  },
};

/* ──────────────────────────────────────────────────────────
 * 표 B: 얼굴형 색조 배치·강도 (얼굴형 기반, 색상 무관)
 * ────────────────────────────────────────────────────────── */

const FACE_PLACEMENT: Record<FaceShape, { recommended: string; avoid: string }> = {
  둥근형: {
    recommended: "사선·세로 블러셔, 세로 하이라이트, C존 음영",
    avoid: "가로로 넓게 퍼진 볼터치 (더 넓어 보임)",
  },
  사각형: {
    recommended: "광대 안쪽 둥근 블러셔, 턱선 곡선 셰이딩",
    avoid: "각진 턱에 강한 직선 셰이딩 (각 강조)",
  },
  장방형: {
    recommended: "가로 블러셔, 이마·턱 가로 셰이딩",
    avoid: "세로 하이라이트 과다·세로로 긴 블러셔 (더 길어 보임)",
  },
  역삼각형: {
    recommended: "하관·턱 하이라이트, 광대 아래 블러셔",
    avoid: "이마 강조 하이라이트·관자 강한 음영 (상부 더 넓어 보임)",
  },
  계란형: {
    recommended: "자유, 본연 균형 유지",
    avoid: "과한 컨투어로 균형 깨기",
  },
  마름모형: {
    recommended: "광대 밖 옅은 블러셔, 광대 위 음영",
    avoid: "광대 정점에 진한 블러셔 (돌출 강조)",
  },
};

/* ──────────────────────────────────────────────────────────
 * 표 A: 퍼스널컬러 × 인상 핵심 색조 (4계절 × 2 인상)
 * ────────────────────────────────────────────────────────── */

interface ColorPaletteRow {
  recommended: string;
  softTone: string;
  sharpTone: string;
  avoid: string;
}

const COLOR_PALETTE: Partial<Record<PersonalColor, ColorPaletteRow>> = {
  spring: {
    recommended: "코랄·피치·살구, 골드·브론즈 섀도우",
    softTone: "lt·pl·b (라이트·페일·브라이트)",
    sharpTone: "b·v (선명 웜)",
    avoid: "블루베이스(푸시아·모브·블루레드), 탁한 뮤트, 한기 도는 실버",
  },
  summer: {
    recommended: "로즈·라즈베리·모브, 실버·라벤더 섀도우",
    softTone: "sf·lt·pl (소프트·라이트·페일)",
    sharpTone: "s·dp (선명 쿨)",
    avoid: "옐로베이스(오렌지·코랄·골드·카키), 강한 대비·진한 매트",
  },
  autumn: {
    recommended: "브릭·테라코타·웜브라운·딥오렌지, 카키·브론즈 섀도우",
    softTone: "sf·dl (소프트·덜)",
    sharpTone: "dp·dk (딥·다크)",
    avoid: "형광색·쿨핑크·블루레드, 옅은 파스텔, 실버",
  },
  winter: {
    recommended: "트루레드·푸시아·와인·버건디, 플럼·네이비 섀도우",
    softTone: "누드로즈·연베리 (톤 다운)",
    sharpTone: "v·dp·dk + 무채색·블랙 (선명 쿨)",
    avoid: "옐로베이스 웜, 탁한 뮤트, 흐린 파스텔",
  },
};

/* ──────────────────────────────────────────────────────────
 * 1.2 립 색별 인상 미세 조정 (퍼스널컬러 무관)
 * ────────────────────────────────────────────────────────── */

const LIP_BY_IMAGE = {
  "능력·교양": "레드·브라운",
  "품위": "누드베이지·핑크",
  "매력": "핑크·오렌지",
  "자연스러움": "누드베이지",
} as const;

/* ──────────────────────────────────────────────────────────
 * 메인 함수
 * ────────────────────────────────────────────────────────── */

export function getMakeupGuide(
  faceShape: FaceShape,
  impression: Impression,
  personalColor: PersonalColor,
): MakeupGuide {
  const faceRow = FACE_MAKEUP[faceShape];
  const placement = FACE_PLACEMENT[faceShape];
  const palette = COLOR_PALETTE[personalColor];

  // 인상 보조 (경계는 soft에 가까운 톤으로)
  const impressionKey: "soft" | "sharp" = impression === "sharp" ? "sharp" : "soft";

  return {
    shapeCorrection: faceRow.shapeCorrection,
    impressionGuide: faceRow[impressionKey],
    placement,
    colorPalette: palette
      ? {
          recommended: palette.recommended,
          softTone: impressionKey === "soft" ? palette.softTone : undefined,
          sharpTone: impressionKey === "sharp" ? palette.sharpTone : undefined,
          avoid: palette.avoid,
        }
      : null,
    lipByDesiredImage: { ...LIP_BY_IMAGE },
  };
}

/** Trust(Todorov) 결과를 Impression 축으로 매핑. */
export function trustToImpression(trustLabel: "커머셜" | "비커머셜" | "경계"): Impression {
  if (trustLabel === "커머셜") return "soft";
  if (trustLabel === "비커머셜") return "sharp";
  return "boundary";
}
