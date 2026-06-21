/**
 * trend.ts — 2025-26 메이크업 트렌드 룩 추천 (얼굴형 × 퍼스널컬러).
 *
 * 출처: trend_mapping (1).pdf — 11개 트렌드 룩 × 얼굴형 × 퍼스널컬러 매핑.
 *   기사 속성: Elle / Bazaar / W Korea 2025-26 시즌
 *
 * 입력: faceShape, personalColor (선택)
 * 출력: 추천 룩 / 비추천 룩 + 근거
 */
import type { FaceShape } from "./faceShape";
import type { PersonalColor } from "./personalColor";

export type TrendMood =
  | "warm-soft"
  | "cool-sharp"
  | "natural"
  | "neutral"
  | "intellectual"
  | "futuristic"
  | "hip-edge"
  | "modern-sharp"
  | "presence";

export interface TrendLook {
  id: string;
  name: string; // 룩 이름
  mood: string; // 무드 묘사 (한 줄)
  /** 얼굴형별 적합도: "good" | "ok" | "caution" (caution = 비추천이지만 변형 가능) */
  faceShapeFit: Partial<Record<FaceShape | "all", "good" | "ok" | "caution">>;
  /** 얼굴형별 비추천·주의 사유 */
  faceShapeNotes?: Partial<Record<FaceShape | "all", string>>;
  /** 퍼스널컬러 적합도 */
  personalColorFit: Partial<Record<PersonalColor | "all", "good" | "ok" | "caution">>;
  personalColorNotes?: Partial<Record<PersonalColor | "all", string>>;
  /** 룩 적용 핵심 팁 */
  tip: string;
  /** 출처 (Elle/Bazaar/W) */
  source?: string;
}

export const TRENDS: TrendLook[] = [
  {
    id: "burnt-tone",
    name: "굽굽",
    mood: "구운 듯한 웜 톤 (Burnt). 톤다운 베이지·코랄·브라운 매트로 온기 부여",
    faceShapeFit: { 둥근형: "good", 계란형: "good", 장방형: "caution", 사각형: "caution" },
    faceShapeNotes: {
      장방형: "가로로 배치하면 보완 가능",
      사각형: "곡선 셰이딩 병행",
    },
    personalColorFit: { autumn: "good", spring: "good", summer: "caution", winter: "caution" },
    personalColorNotes: {
      summer: "쿨톤엔 노랗고 칙칙 — 로지 브라운으로 완화 가능",
      winter: "동일 — 로지 브라운 권장",
    },
    tip: "하이라이터·글리터·촉촉한 광 피하기. 매트한 보송 베이스에 톤다운 색조.",
    source: "Elle 2025-26",
  },
  {
    id: "icy-tone",
    name: "읏추",
    mood: "얼음 같은 쿨 톤 (Icy). 블루 코렉터 + 화이트·블루·실버 펄",
    faceShapeFit: {
      사각형: "good",
      마름모형: "good",
      계란형: "good",
      둥근형: "caution",
      역삼각형: "caution",
    },
    faceShapeNotes: {
      둥근형: "펄 포인트만 — 전면 적용 피하기",
      역삼각형: "광대 위주, 이마 강조 피하기",
    },
    personalColorFit: { winter: "good", summer: "good", spring: "caution", autumn: "caution" },
    personalColorNotes: {
      spring: "실버 대신 샴페인·골드 펄로 대체",
      autumn: "동일",
    },
    tip: "노란기 잡아 창백한 베이스. 화이트·블루·실버 펄을 눈앞머리·광대에.",
    source: "Elle 2025-26",
  },
  {
    id: "glow-base",
    name: "속광 글로우 베이스",
    mood: "자연·소프트. 세럼·수분 베이스로 속에서 차오르는 광",
    faceShapeFit: { 계란형: "good", 둥근형: "caution", 사각형: "caution", 장방형: "ok", 역삼각형: "ok", 마름모형: "ok" },
    faceShapeNotes: {
      둥근형: "외곽 전체 광 과다 시 더 커 보임 — C존·중앙에 집중",
      사각형: "동일",
    },
    personalColorFit: { all: "good" },
    personalColorNotes: {
      all: "톤 무관 — 지성·번들 피부는 T존만 매트, 광은 C존 한정",
    },
    tip: "광을 외곽 전체가 아닌 C존(이마·콧등·턱)·중앙에 집중.",
    source: "Bazaar 2025-26",
  },
  {
    id: "cloud-skin",
    name: "클라우드 스킨",
    mood: "보송·세련. 파우더리 새틴으로 정돈, 색조 최소",
    faceShapeFit: { 사각형: "good", 계란형: "ok", 둥근형: "ok", 장방형: "ok", 역삼각형: "ok", 마름모형: "ok" },
    faceShapeNotes: { 사각형: "정돈된 매트가 시크함과 특히 잘 맞음" },
    personalColorFit: { all: "good" },
    personalColorNotes: { all: "톤 무관 — 건조·각질 피부는 보습 선행" },
    tip: "과한 펄·글리터 피하기. 보습 충분히 후 파우더리 마무리.",
    source: "Bazaar·W 2025-26",
  },
  {
    id: "fresh-cheek",
    name: "생기 치크",
    mood: "건강·소프트. 크림 블러셔로 혈색 은은 (피지컬 글로우)",
    faceShapeFit: { 계란형: "good", 둥근형: "caution", 장방형: "caution", 사각형: "ok", 역삼각형: "ok", 마름모형: "ok" },
    faceShapeNotes: {
      둥근형: "사선·중앙만 — 가로 퍼지면 더 넓어 보임",
      장방형: "가로로 — 세로 길어짐 방지",
    },
    personalColorFit: { all: "good" },
    personalColorNotes: { all: "웜=피치·코랄 / 쿨=로즈·핑크" },
    tip: "코·볼 중앙에 크림 블러셔로 자연 혈색. 운동 후 같은 생기.",
    source: "Bazaar 2025-26",
  },
  {
    id: "smudged-smoky",
    name: "희미한 스모키",
    mood: "지적·신비 (비커머셜). 그레이·브라운·라벤더 경계 없이 번짐",
    faceShapeFit: { 계란형: "good", 역삼각형: "good", 마름모형: "good", 둥근형: "caution" },
    faceShapeNotes: { 둥근형: "부은 눈두덩은 아이홀 위주 컴팩트하게" },
    personalColorFit: {
      summer: "good",
      winter: "good",
      spring: "ok",
      autumn: "ok",
    },
    personalColorNotes: {
      all: "쿨=그레이·라벤더 / 웜=브라운·카키 / 겨울은 라벤더보다 차콜·플럼",
    },
    tip: "또렷한 라인 피하기. 면봉으로 경계 없이 번지게.",
    source: "W 2025-26",
  },
  {
    id: "silver-point",
    name: "실버 포인트",
    mood: "미래적·샤프. 눈앞머리·광대에 한 끗 실버·화이트 쉬머",
    faceShapeFit: { 계란형: "good", 사각형: "good", 마름모형: "good", 둥근형: "ok", 역삼각형: "caution", 장방형: "ok" },
    faceShapeNotes: { 역삼각형: "눈앞머리만, 눈두덩 전체 펄은 부어 보임" },
    personalColorFit: {
      winter: "good",
      summer: "good",
      spring: "caution",
      autumn: "caution",
    },
    personalColorNotes: {
      spring: "차갑게 떠 보임 — 샴페인·골드로 대체",
      autumn: "동일",
    },
    tip: "전체 X, 눈앞머리·광대 한 끗 포인트.",
    source: "Bazaar 2025-26",
  },
  {
    id: "dirty-liner",
    name: "더티·번진 라이너",
    mood: "힙·에지 (비커머셜). 블랙 라인 면봉으로 불규칙 번짐",
    faceShapeFit: { 계란형: "good", 마름모형: "good", 사각형: "ok", 역삼각형: "ok" },
    faceShapeNotes: {
      둥근형: "처진 눈은 언더 번짐이 더 처져 보임 — 상안 위주",
      장방형: "동일",
    },
    personalColorFit: {
      winter: "good",
      summer: "ok",
      autumn: "ok",
      spring: "caution",
    },
    personalColorNotes: {
      spring: "블랙이 무거움 — 다크 브라운으로",
    },
    tip: "면봉으로 라인 불규칙 번지게. 단정한 청순 컨셉과 충돌.",
    source: "W 2025-26",
  },
  {
    id: "no-mascara",
    name: "노 마스카라",
    mood: "절제·모던 (Ghost Lash). 뷰러+밤+언더페인팅으로 결만 정돈",
    faceShapeFit: { all: "good" },
    faceShapeNotes: { all: "또렷함이 필요한 무대·고대비 조명엔 부적합" },
    personalColorFit: { all: "good" },
    personalColorNotes: { all: "곁들이는 립은 타입에 맞춤" },
    tip: "뷰러+투명 프라이머+밤. 강한 립으로 무게중심 이동.",
    source: "Bazaar 2025-26",
  },
  {
    id: "bold-lip",
    name: "또렷한 립",
    mood: "존재감·중립. 레드·베리·브라운으로 입술에 무게중심",
    faceShapeFit: { 장방형: "good", 역삼각형: "good", 계란형: "ok", 사각형: "ok", 마름모형: "ok", 둥근형: "caution" },
    faceShapeNotes: {
      둥근형: "또렷한 입술산으로 / 베이스·눈 동시 강조는 피함",
    },
    personalColorFit: { all: "good" },
    personalColorNotes: {
      spring: "코랄레드",
      summer: "로즈·라즈베리",
      autumn: "브릭·브라운",
      winter: "트루레드·와인",
    },
    tip: "얇은 베이스 + 선명 립. 노 마스카라와 짝지으면 효과적.",
    source: "Bazaar 2025-26",
  },
  {
    id: "dark-lip",
    name: "다크 립",
    mood: "모던·관능 (샤프). 플럼·버건디·블랙",
    faceShapeFit: { 장방형: "good", 사각형: "good", 마름모형: "good", 역삼각형: "good", 둥근형: "caution" },
    faceShapeNotes: {
      둥근형: "그러데이션·블러로 가볍게, 오버립 자제 (작은 입술도 동일)",
    },
    personalColorFit: {
      winter: "good",
      autumn: "good",
      summer: "ok",
      spring: "caution",
    },
    personalColorNotes: {
      winter: "와인·버건디",
      autumn: "딥브라운·플럼",
      summer: "모브·플럼",
      spring: "무겁게 가라앉음 — 시도 시 셰리·브릭 정도",
    },
    tip: "안쪽→바깥쪽 그러데이션. 새틴·매트부터 시작.",
    source: "W 2025-26",
  },
];

/* ──────────────────────────────────────────────────────────
 * 추천 함수
 * ────────────────────────────────────────────────────────── */

export interface TrendRecommendation {
  recommended: TrendLook[];
  caution: TrendLook[];
}

/**
 * 얼굴형 + 퍼스널컬러 기반으로 트렌드 룩을 추천/비추천 분류.
 * - 얼굴형과 퍼스널컬러 모두 "good" → recommended
 * - 어느 한쪽이라도 "caution" → caution
 * - 그 외 → recommended (ok 포함)
 */
export function getTrendRecommendations(
  faceShape: FaceShape,
  personalColor: PersonalColor,
): TrendRecommendation {
  const recommended: TrendLook[] = [];
  const caution: TrendLook[] = [];

  for (const look of TRENDS) {
    const faceFit = look.faceShapeFit[faceShape] ?? look.faceShapeFit.all ?? "ok";
    const pcFit =
      personalColor === "unknown"
        ? "ok"
        : look.personalColorFit[personalColor] ?? look.personalColorFit.all ?? "ok";

    if (faceFit === "caution" || pcFit === "caution") {
      caution.push(look);
    } else {
      recommended.push(look);
    }
  }

  return { recommended, caution };
}
