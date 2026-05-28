import type { Skeleton } from "./bodyType";
import type { FaceShape } from "./faceShape";
import type { Sex } from "./config";

// ── 공통 타입 ──

export type VFCategory = "garment" | "hair" | "makeup";
export interface StyleChip {
  label: string;
  group?: string;
  category?: VFCategory;   // 가상 피팅 대상 분류 (없으면 VF 불가)
  prompt?: string;         // Gemini Nano Banana로 보낼 한국어 묘사
  imageUrl?: string;       // 옷 누끼 이미지 (있을 때만)
}
interface RA { rec: StyleChip[]; avoid: StyleChip[] }

// ── 얼굴형 스타일링 ──

export interface FaceStyleRec { recommend: StyleChip[]; avoid: StyleChip[] }

const FACE_REC: Record<FaceShape, FaceStyleRec> = {
  "둥근형": {
    recommend: [
      { label: "V넥", group: "neckline" }, { label: "스윗하트넥", group: "neckline" },
      { label: "직선 텍스처 단발", group: "hair", category: "hair", prompt: "직선적인 텍스처의 턱선 단발 헤어스타일" },
      { label: "비대칭 가르마", category: "hair", prompt: "비대칭으로 탄 가르마" },
      { label: "이마·턱끝 세로 하이라이트", category: "makeup", prompt: "이마 중앙과 턱끝에 세로로 하이라이터를 넣은 메이크업" },
    ],
    avoid: [
      { label: "라운드넥", group: "neckline" }, { label: "하이넥", group: "neckline" },
      { label: "풀뱅 앞머리", group: "hair", category: "hair", prompt: "이마를 가리는 풀뱅 앞머리" },
      { label: "가로형 귀걸이" },
    ],
  },
  "사각형": {
    recommend: [
      { label: "U넥", group: "neckline" }, { label: "라운드넥", group: "neckline" },
      { label: "보브 단발", group: "hair", category: "hair", prompt: "턱선까지 오는 부드러운 보브 단발" },
      { label: "아치 앞머리", category: "hair", prompt: "이마 위 아치 모양으로 자연스럽게 흘러내리는 앞머리" },
      { label: "작고 둥근 귀걸이" },
    ],
    avoid: [
      { label: "스퀘어넥", group: "neckline" },
      { label: "일자 단발", group: "hair", category: "hair", prompt: "수평으로 잘린 일자 단발" },
      { label: "큰 사각형 액세서리" },
    ],
  },
  "역삼각형": {
    recommend: [
      { label: "보트넥", group: "neckline" }, { label: "넓은 라운드넥", group: "neckline" },
      { label: "턱선 볼륨 단발", group: "hair", category: "hair", prompt: "턱선 부근에 볼륨을 넣은 단발 헤어" },
      { label: "목걸이로 시선 하단" },
    ],
    avoid: [
      { label: "깊은 V넥", group: "neckline" },
      { label: "픽시컷", group: "hair", category: "hair", prompt: "이마와 귀가 다 드러나는 짧은 픽시컷" },
      { label: "크고 무거운 귀걸이" },
    ],
  },
  "장방형": {
    recommend: [
      { label: "하이넥", group: "neckline" }, { label: "스탠드칼라", group: "neckline" },
      { label: "풍성한 웨이브", group: "hair", category: "hair", prompt: "옆으로 풍성하게 떨어지는 웨이브 헤어" },
      { label: "풀뱅 앞머리", category: "hair", prompt: "이마 전체를 일자로 덮는 풀뱅 앞머리" },
      { label: "가로 폭 넓은 귀걸이" },
    ],
    avoid: [
      { label: "깊은 V넥", group: "neckline" },
      { label: "긴 스트레이트 헤어", group: "hair", category: "hair", prompt: "어깨 아래로 길게 떨어지는 스트레이트 헤어" },
      { label: "길게 늘어진 귀걸이" },
    ],
  },
  "계란형": {
    recommend: [
      { label: "스퀘어넥", group: "neckline" }, { label: "오프숄더", group: "neckline" },
      { label: "대부분 헤어 수용", category: "hair", prompt: "현재 자연스러운 헤어 그대로 유지" },
      { label: "깔끔한 메이크업 라인", category: "makeup", prompt: "잡티 없이 깔끔하고 정돈된 메이크업" },
    ],
    avoid: [],
  },
  "마름모형": {
    recommend: [
      { label: "V넥", group: "neckline" }, { label: "스윗하트넥", group: "neckline" },
      { label: "옆머리 레이어드", group: "hair", category: "hair", prompt: "옆머리에 레이어드 컷을 넣어 광대를 가린 헤어" },
      { label: "광대 밖 옅은 블러셔", category: "makeup", prompt: "광대 바깥쪽에 옅게 펴 바른 블러셔 메이크업" },
    ],
    avoid: [
      { label: "보트넥", group: "neckline" }, { label: "오프숄더", group: "neckline" },
      { label: "광대 라인 단발", group: "hair", category: "hair", prompt: "광대 부근에서 끝나는 단발" },
      { label: "광대 위 진한 블러셔", category: "makeup", prompt: "광대 위에 진하게 올린 블러셔" },
    ],
  },
};

export function getFaceStyling(faceShape: FaceShape): FaceStyleRec {
  return FACE_REC[faceShape] ?? FACE_REC["계란형"];
}

// ══════════════════════════════════════════════════════
// 체형 스타일링 — 1층(S/W/N) + 2층(실루엣·비율·프레임)
// ══════════════════════════════════════════════════════

export interface BodyStyleInput {
  skeleton: Skeleton | "보류";
  silhouette: string;
  proportion: string;
  frame: string;
  sex: Sex;
}

// ── 1층: 소재 + 기본 핏 ──

const SKELETON_CHIPS: Record<Skeleton, RA> = {
  "스트레이트": {
    rec: [
      { label: "중두께 면", group: "material", category: "garment", prompt: "중두께 면 소재의 옷" },
      { label: "울 크레이프", group: "material", category: "garment", prompt: "울 크레이프 소재의 옷" },
      { label: "개버딘", group: "material", category: "garment", prompt: "개버딘 소재의 옷" },
      { label: "구조적 셰이프드 핏", category: "garment", prompt: "구조감 있는 셰이프드 핏 의상" },
    ],
    avoid: [
      { label: "얇은 쉬폰" }, { label: "극도 드레이프 소재" }, { label: "흐물거리는 드레이프" },
    ],
  },
  "웨이브": {
    rec: [
      { label: "시폰", group: "material", category: "garment", prompt: "시폰 소재의 옷" },
      { label: "실크", group: "material", category: "garment", prompt: "실크 소재의 옷" },
      { label: "드레이프 저지", group: "material", category: "garment", prompt: "드레이프가 살아있는 저지 소재의 옷" },
      { label: "얇은 니트", group: "material", category: "garment", prompt: "얇은 니트 상의" },
      { label: "부드러운 슬림~세미핏", category: "garment", prompt: "부드럽게 떨어지는 슬림~세미핏 의상" },
    ],
    avoid: [{ label: "두꺼운 트위드" }, { label: "빳빳한 하드 데님" }, { label: "딱딱한 구조·과한 볼륨" }],
  },
  "내추럴": {
    rec: [
      { label: "린넨", group: "material", category: "garment", prompt: "린넨 소재의 옷" },
      { label: "코듀로이", group: "material", category: "garment", prompt: "코듀로이 소재의 옷" },
      { label: "트위드", group: "material", category: "garment", prompt: "트위드 소재의 옷" },
      { label: "워싱 데님", group: "material", category: "garment", prompt: "워싱 데님 의상" },
      { label: "릴랙스드·자연 낙하감", category: "garment", prompt: "릴랙스드한 자연스러운 낙하감의 의상" },
    ],
    avoid: [{ label: "극도 피트한 소재" }, { label: "광택 새틴" }, { label: "타이트 셋인·빡빡한 핏" }],
  },
};

const SKELETON_MALE_EXTRA: Record<Skeleton, RA> = {
  "스트레이트": { rec: [
    { label: "중량 울", group: "material", category: "garment", prompt: "중량감 있는 울 소재 의상" },
    { label: "코튼 트윌", group: "material", category: "garment", prompt: "코튼 트윌 소재 의상" },
    { label: "옥스퍼드", group: "material", category: "garment", prompt: "옥스퍼드 셔츠" },
  ], avoid: [] },
  "웨이브": { rec: [
    { label: "트로피컬 울", group: "material", category: "garment", prompt: "가벼운 트로피컬 울 소재 의상" },
    { label: "소프트 코튼", group: "material", category: "garment", prompt: "부드러운 소프트 코튼 의상" },
  ], avoid: [] },
  "내추럴": { rec: [
    { label: "헤비 옥스퍼드", group: "material", category: "garment", prompt: "헤비 옥스퍼드 셔츠" },
    { label: "워크 캔버스", group: "material", category: "garment", prompt: "워크 캔버스 소재 의상" },
  ], avoid: [] },
};

// ── 2층 ① 실루엣 (여) ──

const SILHOUETTE_F: Record<string, RA> = {
  "어깨형": {
    rec: [
      { label: "V넥", group: "neckline-body", category: "garment", prompt: "V넥 상의" },
      { label: "스쿱넥", group: "neckline-body", category: "garment", prompt: "스쿱넥 상의" },
      { label: "래글런 상의", category: "garment", prompt: "래글런 슬리브 상의" },
      { label: "드롭숄더", category: "garment", prompt: "드롭숄더 상의" },
      { label: "릴랙스드 상의", category: "garment", prompt: "릴랙스드 핏 상의" },
      { label: "와이드 하의", group: "bottom-silhouette", category: "garment", prompt: "와이드 팬츠" },
      { label: "A라인", group: "bottom-silhouette", category: "garment", prompt: "A라인 스커트 또는 드레스" },
      { label: "플레어", group: "bottom-silhouette", category: "garment", prompt: "플레어 라인 하의" },
    ],
    avoid: [
      { label: "보트넥", group: "neckline-body" }, { label: "오프숄더", group: "neckline-body" },
      { label: "스키니 단독", group: "bottom-silhouette" },
    ],
  },
  "밸런스": {
    rec: [
      { label: "보트넥", group: "neckline-body", category: "garment", prompt: "보트넥 상의" },
      { label: "스퀘어넥", group: "neckline-body", category: "garment", prompt: "스퀘어넥 상의" },
      { label: "벨트·페플럼", category: "garment", prompt: "허리 벨트 또는 페플럼 디테일이 있는 의상" },
      { label: "부츠컷", group: "bottom-silhouette", category: "garment", prompt: "부츠컷 팬츠" },
      { label: "하이웨이스트", group: "bottom-silhouette", category: "garment", prompt: "하이웨이스트 하의" },
    ],
    avoid: [],
  },
  "곡선형": {
    rec: [
      { label: "V넥", group: "neckline-body", category: "garment", prompt: "V넥 상의" },
      { label: "랩", group: "neckline-body", category: "garment", prompt: "랩 스타일 상의" },
      { label: "스위트하트", group: "neckline-body", category: "garment", prompt: "스위트하트 넥라인 상의" },
      { label: "피트드", category: "garment", prompt: "피트드 실루엣 의상" },
      { label: "핏앤플레어", group: "bottom-silhouette", category: "garment", prompt: "핏앤플레어 스커트 또는 드레스" },
      { label: "펜슬", group: "bottom-silhouette", category: "garment", prompt: "펜슬 스커트" },
    ],
    avoid: [{ label: "하이넥", group: "neckline-body" }, { label: "배기팬츠", group: "bottom-silhouette" }],
  },
};

// ── 2층 ① V-Taper (남) ──

const VTAPER_M: Record<string, RA> = {
  "V형": {
    rec: [
      { label: "사이드 시밍 수트", group: "suit-fit", category: "garment", prompt: "사이드 시밍이 들어간 수트" },
      { label: "허리 다트 강화 수트", group: "suit-fit", category: "garment", prompt: "허리 다트가 강조된 수트" },
      { label: "스프레드 라펠", category: "garment", prompt: "스프레드 라펠 재킷" },
      { label: "슬림/머슬핏 셔츠", category: "garment", prompt: "슬림 또는 머슬핏 셔츠" },
      { label: "슬림 니트", category: "garment", prompt: "슬림핏 니트 상의" },
    ],
    avoid: [{ label: "박스핏 수트", group: "suit-fit" }, { label: "박스핏 셔츠" }],
  },
  "밸런스": {
    rec: [
      { label: "표준 테일러드", group: "suit-fit", category: "garment", prompt: "표준 테일러드 수트" },
      { label: "레귤러핏 셔츠", category: "garment", prompt: "레귤러핏 셔츠" },
      { label: "크루넥", category: "garment", prompt: "크루넥 상의" },
    ],
    avoid: [{ label: "극단 머슬핏", group: "suit-fit" }, { label: "극단 박시", group: "suit-fit" }],
  },
  "직선형": {
    rec: [
      { label: "구조적 패드", group: "suit-fit", category: "garment", prompt: "구조적 어깨 패드가 들어간 재킷" },
      { label: "스트레이트 컷", category: "garment", prompt: "스트레이트 컷 의상" },
      { label: "박스핏 셔츠", category: "garment", prompt: "박스핏 셔츠" },
      { label: "오버핏", category: "garment", prompt: "오버핏 의상" },
      { label: "드롭숄더 니트", category: "garment", prompt: "드롭숄더 니트" },
    ],
    avoid: [{ label: "강한 허리 셰이핑" }],
  },
};

// ── 2층 ② 비율 ──

const PROPORTION_CHIPS: Record<string, RA> = {
  "롱레그": {
    rec: [
      { label: "미드~로우라이즈", group: "rise", category: "garment", prompt: "미드~로우라이즈 하의" },
      { label: "크롭·앵클 하의", category: "garment", prompt: "크롭 또는 앵클 길이의 하의" },
      { label: "언턱", category: "garment", prompt: "상의를 바지 밖으로 빼서 입은 스타일" },
    ],
    avoid: [{ label: "극단 하이웨이스트", group: "rise" }, { label: "극단 크롭 상의" }],
  },
  "밸런스": {
    rec: [
      { label: "미드라이즈 기본", group: "rise", category: "garment", prompt: "미드라이즈 하의" },
    ],
    avoid: [],
  },
  "롱토르소": {
    rec: [
      { label: "하이라이즈", group: "rise", category: "garment", prompt: "하이라이즈 하의" },
      { label: "숏~허리선 상의", category: "garment", prompt: "짧은 길이의 허리선 상의" },
      { label: "턱인", category: "garment", prompt: "상의를 바지 안으로 넣어 입은 스타일" },
      { label: "풀렝스 하의", category: "garment", prompt: "풀렝스 팬츠" },
    ],
    avoid: [{ label: "로우라이즈", group: "rise" }, { label: "언턱 롱 상의" }],
  },
};

// ── 2층 ③ 프레임 ──

const FRAME_CHIPS: Record<string, RA> = {
  "슬림": {
    rec: [
      { label: "피트드~세미피트", category: "garment", prompt: "피트드~세미피트 실루엣 의상" },
      { label: "셋인·프렌치 슬리브", group: "sleeve", category: "garment", prompt: "셋인 또는 프렌치 슬리브 상의" },
    ],
    avoid: [{ label: "극단 오버사이즈", group: "sleeve" }],
  },
  "미디엄": {
    rec: [
      { label: "모든 핏·소매·소재 (범용)", category: "garment", prompt: "표준적인 핏의 자연스러운 의상" },
    ],
    avoid: [],
  },
  "와이드": {
    rec: [
      { label: "릴랙스드~오버사이즈", category: "garment", prompt: "릴랙스드~오버사이즈 의상" },
      { label: "래글런", group: "sleeve", category: "garment", prompt: "래글런 슬리브 상의" },
      { label: "드롭숄더", group: "sleeve", category: "garment", prompt: "드롭숄더 상의" },
      { label: "돌먼", group: "sleeve", category: "garment", prompt: "돌먼 슬리브 상의" },
    ],
    avoid: [{ label: "극단 피트", group: "sleeve" }, { label: "좁은 셋인", group: "sleeve" }],
  },
};

// ── 결합 + 충돌 해소 ──

function merge(layers: RA[]): { recommend: StyleChip[]; avoid: StyleChip[] } {
  const recMap = new Map<string, StyleChip>();
  const avoidMap = new Map<string, StyleChip>();

  // 우선순위: 앞 레이어가 높음 (실루엣 > 프레임 > 비율 > 1층)
  for (const layer of layers) {
    for (const c of layer.rec) if (!recMap.has(c.label)) recMap.set(c.label, c);
    for (const c of layer.avoid) if (!avoidMap.has(c.label)) avoidMap.set(c.label, c);
  }

  // 충돌 해소: 같은 라벨이 rec과 avoid 양쪽에 있으면, 먼저 등록된 쪽(높은 우선순위)이 승리
  for (const label of recMap.keys()) {
    if (avoidMap.has(label)) avoidMap.delete(label);
  }
  for (const label of avoidMap.keys()) {
    if (recMap.has(label)) recMap.delete(label);
  }

  return {
    recommend: [...recMap.values()],
    avoid: [...avoidMap.values()],
  };
}

export interface BodyStyleResult {
  recommend: StyleChip[];
  avoid: StyleChip[];
  selectedDefault: string[];
}

export function getStyleRecommendation(input: BodyStyleInput): BodyStyleResult {
  if (input.skeleton === "보류") {
    return { recommend: [{ label: "측면 사진 필요" }], avoid: [], selectedDefault: [] };
  }

  const skel = input.skeleton;

  // 레이어 수집 (우선순위 순: 실루엣 > 프레임 > 비율 > 1층)
  const layers: RA[] = [];

  // 실루엣/V-Taper (최고 우선)
  if (input.sex === "female") {
    const s = SILHOUETTE_F[input.silhouette];
    if (s) layers.push(s);
  } else {
    const v = VTAPER_M[input.silhouette];
    if (v) layers.push(v);
  }

  // 프레임
  const fr = FRAME_CHIPS[input.frame];
  if (fr) layers.push(fr);

  // 비율
  const pr = PROPORTION_CHIPS[input.proportion];
  if (pr) layers.push(pr);

  // 1층 (최저 우선)
  const sk = SKELETON_CHIPS[skel];
  if (sk) layers.push(sk);

  // 남성 추가 소재
  if (input.sex === "male") {
    const extra = SKELETON_MALE_EXTRA[skel];
    if (extra) layers.push(extra);
  }

  const { recommend, avoid } = merge(layers);

  // selectedDefault: neckline-body 또는 suit-fit 첫 칩 + bottom-silhouette 또는 rise 첫 칩
  const first = (g: string) => recommend.find((c) => c.group === g)?.label;
  const top = first("neckline-body") ?? first("suit-fit") ?? recommend[0]?.label;
  const bot = first("bottom-silhouette") ?? first("rise") ?? recommend[1]?.label;
  const selectedDefault = [top, bot].filter(Boolean) as string[];

  return { recommend, avoid, selectedDefault };
}
