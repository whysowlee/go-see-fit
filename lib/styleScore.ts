/**
 * styleScore.ts — 의류 요소별 다차원 종합 추천 점수.
 *
 * necklineScore.ts의 구조를 일반화. 요소(상의 핏·기장·소재·하의 핏)마다
 * *영향 받는 축이 다름* — 요소별로 적절한 축만 사용 (사용자 결정 2026-06-22).
 *
 * 축 구성:
 *   - 상의 핏  : 골격 + 외곽선 비율
 *   - 상의 기장: 골격 + 비율(다리길이) + 외곽선
 *   - 소재     : 골격 (주) + 외곽선
 *   - 하의 핏  : 골격 + 비율 + 외곽선
 *
 * (넥라인은 necklineScore.ts에 별도 — 얼굴형이 핵심이라 분리 유지)
 *
 * 점수 = Σ(축별 기여). 각 축 -2~+2. verdict는 necklineScore와 동일 컷.
 */
import type { Skeleton } from "./bodyType";
import type { SilhouetteLabel } from "./silhouetteConfig";

export type Ratio = "롱레그" | "밸런스" | "롱토르소";
export type Frame = "슬림" | "미디엄" | "와이드";

/** necklineScore.ts와 동일 인터페이스 — UI 컴포넌트 공유 */
export interface AxisContribution {
  axis: "골격" | "외곽선" | "비율" | "프레임";
  score: number;
  reason: string;
}

export interface StyleScore {
  item: string; // 예: "슬림핏", "크롭 기장"
  total: number;
  contributions: AxisContribution[];
  verdict: "강력 추천" | "추천" | "보통" | "주의" | "비추천";
}

export interface StyleCategory {
  key: string; // "topFit" | "topLength" | "material" | "bottomFit"
  title: string; // "상의 핏"
  scores: StyleScore[];
}

function verdict(total: number): StyleScore["verdict"] {
  if (total >= 3) return "강력 추천";
  if (total >= 1.5) return "추천";
  if (total > -1) return "보통";
  if (total > -2.5) return "주의";
  return "비추천";
}

/* ──────────────────────────────────────────────────────────
 * 1. 상의 핏 — 골격 + 외곽선
 * ────────────────────────────────────────────────────────── */
type Cell = { s: number; r: string };

const TOP_FIT_ITEMS = ["슬림핏", "세미핏", "레귤러핏", "오버핏"] as const;

const TOP_FIT_SKEL: Record<Skeleton, Partial<Record<(typeof TOP_FIT_ITEMS)[number], Cell>>> = {
  스트레이트: {
    슬림핏: { s: 1, r: "두꺼운 흉곽을 깔끔하게 잡아줌" },
    세미핏: { s: 2, r: "구조감 있게 떨어져 상체 라인이 단정" },
    레귤러핏: { s: 1, r: "무난하게 소화" },
    오버핏: { s: -2, r: "단단한 상체가 부피로 더 커 보임" },
  },
  웨이브: {
    슬림핏: { s: 2, r: "얇은 상체에 밀착해 곡선을 살림" },
    세미핏: { s: 1, r: "적당히 붙어 여리한 라인 유지" },
    레귤러핏: { s: 0, r: "무난하나 곡선이 약간 묻힘" },
    오버핏: { s: -2, r: "얇은 상체가 옷에 묻혀 빈약해 보임" },
  },
  내추럴: {
    슬림핏: { s: -1, r: "큰 골격이 타이트하게 드러나 답답" },
    세미핏: { s: 1, r: "여유 있게 떨어져 자연스러움" },
    레귤러핏: { s: 2, r: "편안한 핏이 골격과 조화" },
    오버핏: { s: 2, r: "릴랙스한 부피감이 골격을 자연스레 감쌈" },
  },
};

const TOP_FIT_SIL: Partial<Record<SilhouetteLabel, Partial<Record<(typeof TOP_FIT_ITEMS)[number], Cell>>>> = {
  Hourglass: { 슬림핏: { s: 1, r: "잘록한 허리 라인을 드러냄" }, 오버핏: { s: -1, r: "곡선이 가려짐" } },
  SoftHourglass: { 세미핏: { s: 1, r: "은근한 곡선을 자연스럽게 살림" } },
  Rectangle: { 세미핏: { s: 1, r: "직선 실루엣에 구조감 더함" }, 슬림핏: { s: -1, r: "허리 라인 없어 밋밋해 보임" } },
  Triangle: { 슬림핏: { s: 1, r: "상체를 슬림하게 잡아 하체와 균형" } },
};

/* ──────────────────────────────────────────────────────────
 * 2. 상의 기장 — 골격 + 비율 + 외곽선
 * ────────────────────────────────────────────────────────── */
const TOP_LEN_ITEMS = ["크롭", "골반 기장", "롱 기장"] as const;

const TOP_LEN_SKEL: Record<Skeleton, Partial<Record<(typeof TOP_LEN_ITEMS)[number], Cell>>> = {
  스트레이트: { "골반 기장": { s: 1, r: "허리선 위에서 깔끔하게 마무리" } },
  웨이브: { 크롭: { s: 1, r: "짧은 상의가 상체를 짧게 잡아 비율 ↑" } },
  내추럴: { "롱 기장": { s: 1, r: "긴 기장이 여유로운 무드와 어울림" } },
};

const TOP_LEN_RATIO: Record<Ratio, Partial<Record<(typeof TOP_LEN_ITEMS)[number], Cell>>> = {
  롱레그: { "롱 기장": { s: 1, r: "긴 다리라 롱 기장도 비율 안 무너짐" }, 크롭: { s: -1, r: "이미 긴 다리가 더 강조돼 불균형" } },
  밸런스: { "골반 기장": { s: 1, r: "균형 비율엔 골반 기장이 안정적" } },
  롱토르소: { 크롭: { s: 2, r: "짧은 상의가 긴 상체를 끊어 다리 ↑" }, "롱 기장": { s: -2, r: "긴 상체가 더 길어 보임" } },
};

/* ──────────────────────────────────────────────────────────
 * 3. 소재 — 골격(주) + 외곽선
 * ────────────────────────────────────────────────────────── */
const MATERIAL_ITEMS = ["탄탄한 직물", "부드러운 드레이프", "니트", "워싱 데님"] as const;

const MATERIAL_SKEL: Record<Skeleton, Partial<Record<(typeof MATERIAL_ITEMS)[number], Cell>>> = {
  스트레이트: {
    "탄탄한 직물": { s: 2, r: "힘 있는 소재가 직선 라인을 정돈" },
    니트: { s: -1, r: "몸에 붙는 니트는 상체를 부해 보이게" },
    "부드러운 드레이프": { s: -1, r: "흐물거려 단단한 몸을 못 잡아줌" },
  },
  웨이브: {
    "부드러운 드레이프": { s: 2, r: "찰랑이는 소재가 곡선에 흐름을 더함" },
    니트: { s: 1, r: "얇은 니트가 여리한 라인을 살림" },
    "탄탄한 직물": { s: -1, r: "빳빳해 얇은 상체가 비어 보임" },
  },
  내추럴: {
    "워싱 데님": { s: 2, r: "자연스러운 질감이 큰 골격과 조화" },
    니트: { s: 1, r: "거친 니트가 자연스러운 무드" },
    "부드러운 드레이프": { s: -1, r: "큰 골격엔 흐물거림이 안 어울림" },
  },
};

/* ──────────────────────────────────────────────────────────
 * 4. 하의 핏 — 골격 + 비율 + 외곽선
 * ────────────────────────────────────────────────────────── */
const BOTTOM_FIT_ITEMS = ["스키니", "스트레이트", "와이드", "부츠컷"] as const;

const BOTTOM_FIT_SKEL: Record<Skeleton, Partial<Record<(typeof BOTTOM_FIT_ITEMS)[number], Cell>>> = {
  스트레이트: { 스트레이트: { s: 2, r: "직선 하의가 곧은 다리 라인과 맞음" }, 와이드: { s: -1, r: "부피가 하체를 키워 보임" } },
  웨이브: { 부츠컷: { s: 2, r: "무릎 아래 퍼짐이 하체 밸런스 ↑" }, 스키니: { s: 1, r: "곡선적 하체를 슬림하게" } },
  내추럴: { 와이드: { s: 2, r: "여유로운 핏이 골격과 자연스럽게 조화" }, 스키니: { s: -2, r: "큰 골격이 그대로 드러나 답답" } },
};

const BOTTOM_FIT_RATIO: Record<Ratio, Partial<Record<(typeof BOTTOM_FIT_ITEMS)[number], Cell>>> = {
  롱레그: { 와이드: { s: 1, r: "긴 다리라 와이드도 무게중심 안정" } },
  밸런스: {},
  롱토르소: { 스키니: { s: 1, r: "슬림한 하의가 다리를 길어 보이게" }, 부츠컷: { s: 1, r: "세로 라인으로 다리 연장" } },
};

/* ──────────────────────────────────────────────────────────
 * 종합 계산
 * ────────────────────────────────────────────────────────── */

function buildScores<T extends string>(
  items: readonly T[],
  skelMap: Partial<Record<T, Cell>>,
  extraMaps: Array<{ axis: AxisContribution["axis"]; map: Partial<Record<T, Cell>> }>,
): StyleScore[] {
  const out: StyleScore[] = items.map((item) => {
    const contributions: AxisContribution[] = [];
    const sk = skelMap[item];
    if (sk && sk.r) contributions.push({ axis: "골격", score: sk.s, reason: sk.r });
    for (const { axis, map } of extraMaps) {
      const c = map[item];
      if (c && c.r) contributions.push({ axis, score: c.s, reason: c.r });
    }
    const total = contributions.reduce((s, c) => s + c.score, 0);
    return { item, total, contributions, verdict: verdict(total) };
  });
  return out.filter((s) => s.contributions.length > 0).sort((a, b) => b.total - a.total);
}

export interface StyleScoreInput {
  skeleton: Skeleton | "보류";
  silhouette: SilhouetteLabel | null;
  ratio: Ratio;
  frame: Frame;
}

export function scoreStyleCategories(input: StyleScoreInput): StyleCategory[] {
  const skel = input.skeleton;
  if (skel === "보류") return []; // 골격 없으면 핏·소재 점수 의미 없음

  const sil = input.silhouette;
  const cats: StyleCategory[] = [];

  // 1. 상의 핏 (골격 + 외곽선)
  cats.push({
    key: "topFit",
    title: "상의 핏",
    scores: buildScores(TOP_FIT_ITEMS, TOP_FIT_SKEL[skel], sil ? [{ axis: "외곽선", map: TOP_FIT_SIL[sil] ?? {} }] : []),
  });

  // 2. 상의 기장 (골격 + 비율)
  cats.push({
    key: "topLength",
    title: "상의 기장",
    scores: buildScores(TOP_LEN_ITEMS, TOP_LEN_SKEL[skel], [{ axis: "비율", map: TOP_LEN_RATIO[input.ratio] }]),
  });

  // 3. 소재 (골격)
  cats.push({
    key: "material",
    title: "소재",
    scores: buildScores(MATERIAL_ITEMS, MATERIAL_SKEL[skel], []),
  });

  // 4. 하의 핏 (골격 + 비율)
  cats.push({
    key: "bottomFit",
    title: "하의 핏",
    scores: buildScores(BOTTOM_FIT_ITEMS, BOTTOM_FIT_SKEL[skel], [{ axis: "비율", map: BOTTOM_FIT_RATIO[input.ratio] }]),
  });

  return cats.filter((c) => c.scores.length > 0);
}
