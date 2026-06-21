import type { Skeleton } from "./bodyType";
import type { FaceShape } from "./faceShape";
import type { Sex } from "./config";
import {
  BODY_MATRIX, TOP_LABELS, BOTTOM_LABELS, GRADE_SCORE, lookupMatrix,
  type Silhouette as MSilhouette, type Proportion as MProportion, type Frame as MFrame,
} from "./bodyMatrix";

// ══════════════════════════════════════════════════════
// 공통 타입
// ══════════════════════════════════════════════════════

export type VFCategory = "garment" | "hair" | "makeup";

export interface StyleChip {
  label: string;
  group?: string;           // 같은 group은 단일 선택 (cross-box 포함)
  category?: VFCategory;    // 가상 피팅 대상 분류
  prompt?: string;          // Gemini Nano Banana 한국어 묘사
  imageUrl?: string;
  reason?: string;          // 왜 추천/비추천인지 (개인화 근거; 1차 피드백 'why')
}

// ══════════════════════════════════════════════════════
// 얼굴형 스타일링 (기존 유지, group만 정규화)
// ══════════════════════════════════════════════════════

export interface FaceStyleRec { recommend: StyleChip[]; avoid: StyleChip[] }

const FACE_REC: Record<FaceShape, FaceStyleRec> = {
  "둥근형": {
    recommend: [
      { label: "V넥", group: "neckline" },
      { label: "스윗하트넥", group: "neckline" },
      { label: "직선 텍스처 단발", group: "hair", category: "hair", prompt: "직선적인 텍스처의 턱선 단발 헤어스타일" },
      { label: "비대칭 가르마", group: "hair", category: "hair", prompt: "비대칭으로 탄 가르마" },
      { label: "이마·턱끝 세로 하이라이트", group: "makeup", category: "makeup", prompt: "이마 중앙과 턱끝에 세로로 하이라이터를 넣은 메이크업" },
    ],
    avoid: [
      { label: "라운드넥", group: "neckline" },
      { label: "하이넥", group: "neckline" },
      { label: "풀뱅 앞머리", group: "hair", category: "hair", prompt: "이마를 가리는 풀뱅 앞머리" },
    ],
  },
  "사각형": {
    recommend: [
      { label: "U넥", group: "neckline" },
      { label: "라운드넥", group: "neckline" },
      { label: "보브 단발", group: "hair", category: "hair", prompt: "턱선까지 오는 부드러운 보브 단발" },
      { label: "아치 앞머리", group: "hair", category: "hair", prompt: "이마 위 아치 모양으로 자연스럽게 흘러내리는 앞머리" },
    ],
    avoid: [
      { label: "스퀘어넥", group: "neckline" },
      { label: "일자 단발", group: "hair", category: "hair", prompt: "수평으로 잘린 일자 단발" },
    ],
  },
  "역삼각형": {
    recommend: [
      { label: "보트넥", group: "neckline" },
      { label: "넓은 라운드넥", group: "neckline" },
      { label: "턱선 볼륨 단발", group: "hair", category: "hair", prompt: "턱선 부근에 볼륨을 넣은 단발 헤어" },
    ],
    avoid: [
      { label: "깊은 V넥", group: "neckline" },
      { label: "픽시컷", group: "hair", category: "hair", prompt: "이마와 귀가 다 드러나는 짧은 픽시컷" },
    ],
  },
  "장방형": {
    recommend: [
      { label: "하이넥", group: "neckline" },
      { label: "스탠드칼라", group: "neckline" },
      { label: "풍성한 웨이브", group: "hair", category: "hair", prompt: "옆으로 풍성하게 떨어지는 웨이브 헤어" },
      { label: "풀뱅 앞머리", group: "hair", category: "hair", prompt: "이마 전체를 일자로 덮는 풀뱅 앞머리" },
    ],
    avoid: [
      { label: "깊은 V넥", group: "neckline" },
      { label: "긴 스트레이트 헤어", group: "hair", category: "hair", prompt: "어깨 아래로 길게 떨어지는 스트레이트 헤어" },
    ],
  },
  "계란형": {
    recommend: [
      { label: "스퀘어넥", group: "neckline" },
      { label: "오프숄더", group: "neckline" },
      { label: "대부분 헤어 수용", group: "hair", category: "hair", prompt: "현재 자연스러운 헤어 그대로 유지" },
      { label: "깔끔한 메이크업 라인", group: "makeup", category: "makeup", prompt: "잡티 없이 깔끔하고 정돈된 메이크업" },
    ],
    avoid: [],
  },
  "마름모형": {
    recommend: [
      { label: "V넥", group: "neckline" },
      { label: "스윗하트넥", group: "neckline" },
      { label: "옆머리 레이어드", group: "hair", category: "hair", prompt: "옆머리에 레이어드 컷을 넣어 광대를 가린 헤어" },
      { label: "광대 밖 옅은 블러셔", group: "makeup", category: "makeup", prompt: "광대 바깥쪽에 옅게 펴 바른 블러셔 메이크업" },
    ],
    avoid: [
      { label: "보트넥", group: "neckline" },
      { label: "오프숄더", group: "neckline" },
      { label: "광대 라인 단발", group: "hair", category: "hair", prompt: "광대 부근에서 끝나는 단발" },
      { label: "광대 위 진한 블러셔", group: "makeup", category: "makeup", prompt: "광대 위에 진하게 올린 블러셔" },
    ],
  },
};

// ── 세로 3분할(상/중/하안) · cute↔mature 기반 메이크업 개인화 ──
// trend_mapping·makeup_color_logic 의 "상/중/하안 무게중심" 처방을 개인 수치로 트리거.
// faceShape 는 넥라인·헤어를 정하고, 메이크업은 이 비율로 교체한다.

export interface MakeupProportionInput {
  dominant: "상안" | "중안" | "하안" | "균형";
  cuteMatureLabel: "cute" | "mid" | "mature";
}

const mk = (label: string, prompt: string, reason: string): StyleChip => ({
  label, group: "makeup", category: "makeup", prompt, reason,
});
const mkAvoid = (label: string, reason: string): StyleChip => ({ label, group: "makeup", category: "makeup", reason });

// 두드러진(긴) 부위별 형태 보정 — 시각적으로 그 부위를 '짧게' 정돈하는 방향
const THIRDS_MAKEUP: Record<MakeupProportionInput["dominant"], FaceStyleRec> = {
  "중안": {
    recommend: [
      mk("가로 블러셔", "눈 아래에서 광대 방향으로 가로로 길게 펴 바른 블러셔", "중안부가 길어, 가로 블러셔로 끊으면 길이가 짧아 보여요"),
      mk("눈 키우는 언더 채움", "언더라인과 애교살을 채워 눈을 크게 키운 메이크업", "눈~코 사이 여백을 채우면 중안부가 덜 길어 보여요"),
    ],
    avoid: [mkAvoid("긴 세로 노즈 셰이딩", "콧대 세로 음영은 중안부를 더 길어 보이게 해요")],
  },
  "하안": {
    recommend: [
      mk("턱선 세로 셰이딩", "턱끝과 턱선 아래에 세로로 넣은 셰이딩", "하안부가 길어, 턱 음영으로 길이를 단축해요"),
      mk("또렷한 다크 매트 립", "선명한 다크 톤의 매트한 립", "시선을 입술에 모아 하관 비율을 정돈해요"),
    ],
    avoid: [mkAvoid("턱 아래 강한 하이라이트", "턱에 광을 주면 하안부가 더 길어 보여요")],
  },
  "상안": {
    recommend: [
      mk("헤어라인 셰이딩", "이마 헤어라인을 따라 자연스럽게 넣은 셰이딩", "상안(이마)이 넓어, 헤어라인 음영으로 정돈해요"),
      mk("두껍고 살짝 내린 눈썹", "두께감 있고 위치를 살짝 내려 그린 눈썹", "눈썹을 또렷·약간 아래로 그려 이마 여백을 줄여요"),
    ],
    avoid: [mkAvoid("이마 전체 하이라이트", "상안에 광을 깔면 이마가 더 넓어 보여요")],
  },
  "균형": {
    recommend: [
      mk("절제된 1포인트", "전체를 정돈하고 한 곳만 강조한 절제된 메이크업", "3분할이 고른 편이라 형태 보정 부담이 적어요"),
    ],
    avoid: [],
  },
};

// cute↔mature 표현 방향 (makeup_color_logic 인상 축)
const CUTE_MATURE_MAKEUP: Record<MakeupProportionInput["cuteMatureLabel"], StyleChip[]> = {
  "cute": [mk("코랄·피치 + 둥근 눈썹", "코랄·피치 블러셔와 둥근 눈썹의 화사한 동안 메이크업", "하안이 짧은 동안 인상을 살리는 소프트 방향")],
  "mid": [],
  "mature": [mk("세로 음영 + 각진 눈썹", "세로 셰이딩과 각진 눈썹의 또렷한 시크 메이크업", "하안 우세 성숙 인상에 어울리는 샤프 방향")],
};

export function personalizeMakeup(p: MakeupProportionInput): FaceStyleRec {
  const thirds = THIRDS_MAKEUP[p.dominant];
  return {
    recommend: [...thirds.recommend, ...CUTE_MATURE_MAKEUP[p.cuteMatureLabel]],
    avoid: [...thirds.avoid],
  };
}

export function getFaceStyling(faceShape: FaceShape, p?: MakeupProportionInput): FaceStyleRec {
  const base = FACE_REC[faceShape] ?? FACE_REC["계란형"];
  if (!p) return base;
  // 넥라인·헤어는 얼굴형 기반 유지, 메이크업은 비율 개인화로 교체
  const personal = personalizeMakeup(p);
  return {
    recommend: [...base.recommend.filter((c) => c.category !== "makeup"), ...personal.recommend],
    avoid: [...base.avoid.filter((c) => c.category !== "makeup"), ...personal.avoid],
  };
}

// ══════════════════════════════════════════════════════
// 체형 스타일링 — 문서 매트릭스 기반
// 81 체형 × (40 상의 + 25 하의) lookup
// ══════════════════════════════════════════════════════

// 각 상의/하의가 81 체형 중 추천(A/B)된 횟수 — 동점 시 unique 우선용
const TOP_REC_COUNT: number[] = Array(40).fill(0);
const BOTTOM_REC_COUNT: number[] = Array(25).fill(0);
for (const m of BODY_MATRIX) {
  m.tops.forEach((g, i) => { if (GRADE_SCORE[g] >= 1) TOP_REC_COUNT[i] += 1; });
  m.bots.forEach((g, i) => { if (GRADE_SCORE[g] >= 1) BOTTOM_REC_COUNT[i] += 1; });
}

// "넥라인 · 핏 · 기장" → "핏 · 기장" (넥라인 제거)
function stripNeckline(label: string): string {
  const parts = label.split(" · ");
  return parts.length >= 2 ? parts.slice(1).join(" · ") : label;
}

interface ScoredItem {
  label: string;
  prompt: string;
  score: number;
  recCount: number;     // 81 체형 중 추천 횟수 (적을수록 unique)
  isBest: boolean;      // 매트릭스 ★ 표시
}

// 점수 정렬 + 동점 처리 + 라벨 dedupe → 상위 N
function pickTopN(items: ScoredItem[], n: number, direction: "rec" | "avoid", group: string, category: VFCategory): StyleChip[] {
  const filter = direction === "rec" ? (s: number) => s >= 1 : (s: number) => s <= -1;
  const sorted = [...items].filter((it) => filter(it.score)).sort((a, b) => {
    // 점수 차이가 우선
    const ds = direction === "rec" ? b.score - a.score : a.score - b.score;
    if (ds !== 0) return ds;
    // 동점: 다른 체형에서 추천 횟수 적은 것 우선 (이 체형 고유의 추천)
    if (a.recCount !== b.recCount) return a.recCount - b.recCount;
    // 그래도 같으면 ★ 우선
    if (a.isBest !== b.isBest) return a.isBest ? -1 : 1;
    return 0;
  });
  const seen = new Set<string>();
  const out: StyleChip[] = [];
  for (const it of sorted) {
    if (seen.has(it.label)) continue;
    seen.add(it.label);
    out.push({ label: it.label, group, category, prompt: it.prompt });
    if (out.length >= n) break;
  }
  return out;
}

// 1층 골격 → 상의 소재 (basis §1-4)
const TOP_MATERIAL_REC: Record<Skeleton, StyleChip> = {
  "스트레이트": { label: "구조적 셰이프드 핏", group: "material-top", category: "garment", prompt: "구조감 있는 셰이프드 핏 상의" },
  "웨이브":    { label: "부드러운 슬림~세미핏", group: "material-top", category: "garment", prompt: "부드럽게 떨어지는 슬림~세미핏 상의" },
  "내추럴":    { label: "릴랙스드·자연 낙하", group: "material-top", category: "garment", prompt: "릴랙스드한 자연 낙하감의 상의" },
};
const TOP_MATERIAL_AVOID: Record<Skeleton, StyleChip> = {
  "스트레이트": { label: "흐물거리는 드레이프", group: "material-top" },
  "웨이브":    { label: "딱딱한 구조·과한 볼륨", group: "material-top" },
  "내추럴":    { label: "타이트 셋인·빡빡한 핏", group: "material-top" },
};

// 1층 골격 → 하의 소재 (basis §2-4)
const BOTTOM_MATERIAL_REC: Record<Skeleton, StyleChip> = {
  "스트레이트": { label: "구조적 직물", group: "material-bottom", category: "garment", prompt: "구조적 직물 소재의 하의" },
  "웨이브":    { label: "부드러운 드레이프", group: "material-bottom", category: "garment", prompt: "부드러운 드레이프성 소재의 하의" },
  "내추럴":    { label: "워싱 데님·자연소재", group: "material-bottom", category: "garment", prompt: "워싱 데님 또는 자연소재의 하의" },
};
const BOTTOM_MATERIAL_AVOID: Record<Skeleton, StyleChip> = {
  "스트레이트": { label: "머메이드·흐물 드레이프", group: "material-bottom" },
  "웨이브":    { label: "빳빳한 와이드", group: "material-bottom" },
  "내추럴":    { label: "광택 새틴", group: "material-bottom" },
};

// 남성 V형/직선형 → 매트릭스(여성 기준) 매핑
// V형 (어깨 우세) → 어깨형, 직선형 (곡선 없음) → 밸런스
function mapSilhouette(input: string): MSilhouette {
  if (input === "어깨형" || input === "밸런스" || input === "곡선형") return input;
  if (input === "V형") return "어깨형";
  if (input === "직선형") return "밸런스";
  return "밸런스";
}

// ── 진입점 ──

export interface BodyStyleInput {
  skeleton: Skeleton | "보류";
  silhouette: string;
  proportion: string;
  frame: string;
  sex: Sex;
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

  const sil = mapSilhouette(input.silhouette);
  const entry = lookupMatrix(input.skeleton, sil, input.proportion as MProportion, input.frame as MFrame);
  if (!entry) {
    // 매트릭스에 없으면 소재만이라도 반환 (상의 소재 + 하의 소재)
    const topMatRec = TOP_MATERIAL_REC[input.skeleton];
    const botMatRec = BOTTOM_MATERIAL_REC[input.skeleton];
    const topMatAv = TOP_MATERIAL_AVOID[input.skeleton];
    const botMatAv = BOTTOM_MATERIAL_AVOID[input.skeleton];
    return {
      recommend: [topMatRec, botMatRec].filter(Boolean),
      avoid: [topMatAv, botMatAv].filter(Boolean),
      selectedDefault: [],
    };
  }

  // 상의 — 넥라인 빼고 라벨 만들고 점수화
  const topItems: ScoredItem[] = entry.tops.map((g, i) => {
    const full = TOP_LABELS[i + 1];
    const stripped = stripNeckline(full);
    return {
      label: stripped,
      prompt: `${stripped} 상의`,
      score: GRADE_SCORE[g],
      recCount: TOP_REC_COUNT[i],
      isBest: i === entry.topBest,
    };
  });
  const botItems: ScoredItem[] = entry.bots.map((g, i) => {
    const full = BOTTOM_LABELS[i + 1];
    return {
      label: full,
      prompt: `${full} 하의`,
      score: GRADE_SCORE[g],
      recCount: BOTTOM_REC_COUNT[i],
      isBest: i === entry.botBest,
    };
  });

  const topsRec = pickTopN(topItems, 2, "rec", "body-top", "garment");
  const topsAvoid = pickTopN(topItems, 2, "avoid", "body-top", "garment");
  const botsRec = pickTopN(botItems, 2, "rec", "body-bottom", "garment");
  const botsAvoid = pickTopN(botItems, 2, "avoid", "body-bottom", "garment");

  // 상의 묶음(피트·기장 + 상의 소재) → 하의 묶음(라이즈·기장·실루엣 + 하의 소재) 순서로
  const topMatRec = TOP_MATERIAL_REC[input.skeleton];
  const botMatRec = BOTTOM_MATERIAL_REC[input.skeleton];
  const topMatAv = TOP_MATERIAL_AVOID[input.skeleton];
  const botMatAv = BOTTOM_MATERIAL_AVOID[input.skeleton];

  return {
    recommend: [...topsRec, ...(topMatRec ? [topMatRec] : []), ...botsRec, ...(botMatRec ? [botMatRec] : [])],
    avoid: [...topsAvoid, ...(topMatAv ? [topMatAv] : []), ...botsAvoid, ...(botMatAv ? [botMatAv] : [])],
    selectedDefault: [],
  };
}
