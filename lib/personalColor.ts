/**
 * personalColor.ts — 퍼스널컬러 4계절 타입 + 메타.
 *
 * 사용자가 드롭다운으로 선택 (자가진단 폼은 추후).
 * makeup.ts, trend.ts에서 색조 추천 시 입력으로 사용.
 *
 * 출처: makeup_color_logic.docx §1.3 (자가 판단 + 4계절 특징)
 */

export type PersonalColor =
  | "spring" // 봄 웜 (Spring Warm)
  | "summer" // 여름 쿨 (Summer Cool) — 한국 최다
  | "autumn" // 가을 웜 (Autumn Warm)
  | "winter" // 겨울 쿨 (Winter Cool)
  | "unknown"; // 미입력 또는 모름

export interface PersonalColorMeta {
  label: PersonalColor;
  labelKo: string;
  /** 웜/쿨 */
  undertone: "warm" | "cool" | "unknown";
  /** 짧은 묘사 */
  description: string;
  /** 추천 색 (대표) */
  bestColors: string[];
  /** 피하면 좋은 색 */
  avoidColors: string[];
  /** 어울리는 금속 */
  metal: "gold" | "silver" | "either";
  /** 자가 확인 한 줄 */
  selfCheck: string;
}

export const PERSONAL_COLORS: Record<PersonalColor, PersonalColorMeta> = {
  spring: {
    label: "spring",
    labelKo: "봄 웜",
    undertone: "warm",
    description: "밝고 화사하며 생기 있는 인상. 노란빛 따뜻한 언더톤, 얼굴이 환하게 빛나는 타입.",
    bestColors: ["코랄", "피치", "살구", "밝은 오렌지"],
    avoidColors: ["검정", "진회색", "차갑고 탁한 색"],
    metal: "gold",
    selfCheck: "밝은 코랄 립에 혈색 살아남, 골드가 실버보다 잘 받음",
  },
  summer: {
    label: "summer",
    labelKo: "여름 쿨",
    undertone: "cool",
    description: "부드럽고 우아하며 차분한 인상. 핑크빛 차가운 언더톤, 희고 투명한 피부 (한국인 최다).",
    bestColors: ["로즈핑크", "라벤더", "모브", "라즈베리"],
    avoidColors: ["쨍한 원색", "진한 오렌지", "골드"],
    metal: "silver",
    selfCheck: "손목 혈관 푸른빛, 라벤더·로즈가 얼굴 정돈",
  },
  autumn: {
    label: "autumn",
    labelKo: "가을 웜",
    undertone: "warm",
    description: "깊고 차분하며 고급스러운 인상. 황갈빛 따뜻한 언더톤, 노르스름한 피부.",
    bestColors: ["브릭", "테라코타", "웜브라운", "카키", "딥오렌지"],
    avoidColors: ["형광색", "쿨핑크", "블루레드", "옅은 파스텔"],
    metal: "gold",
    selfCheck: "카키·브라운 잘 받음, 파스텔보다 깊은 색에서 또렷",
  },
  winter: {
    label: "winter",
    labelKo: "겨울 쿨",
    undertone: "cool",
    description: "또렷하고 도시적이며 강한 인상. 블루빛 차가운 언더톤, 명암 대비 뚜렷.",
    bestColors: ["트루레드", "푸시아", "와인", "네이비", "플럼"],
    avoidColors: ["옐로베이스 따뜻한 색", "탁한 뮤트", "흐린 파스텔"],
    metal: "silver",
    selfCheck: "순백 셔츠·검정 잘 어울림, 푸시아·트루레드 소화",
  },
  unknown: {
    label: "unknown",
    labelKo: "모름 (선택 안 함)",
    undertone: "unknown",
    description: "퍼스널컬러를 입력하지 않았습니다. 색 추천은 일반 가이드로 제공됩니다.",
    bestColors: [],
    avoidColors: [],
    metal: "either",
    selfCheck: "퍼스널컬러 입력 시 색 추천이 정확해집니다.",
  },
};

/** 드롭다운 옵션 순서 (한국인 빈도순: 여름 → 겨울 → 가을 → 봄 → 모름) */
export const PERSONAL_COLOR_OPTIONS: PersonalColor[] = [
  "summer",
  "winter",
  "autumn",
  "spring",
  "unknown",
];
