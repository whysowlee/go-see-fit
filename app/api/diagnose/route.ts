export const runtime = "nodejs";
const MODEL = "gemini-2.0-flash";

type Num = number | string | undefined;
interface DiagnoseBody {
  kind: "face" | "body";
  measurements?: Record<string, Num>;
  classification?: Record<string, unknown>;
}

const FACE_KEYS: Record<string, [string, string]> = {
  AR: ["얼굴 종횡비(길이/너비)", "높을수록 갸름"],
  F: ["이마 너비비", "1보다 크면 이마가 넓다"],
  J: ["턱 너비비", "1보다 작으면 턱이 좁다"],
  T: ["관자/이마 비", "1보다 크면 상부가 넓다"],
  jawAngle: ["턱 각도", "작을수록 각진 턱"],
  thirdsRatio: ["상:중:하안 비율(1:1:1 기준)", "각 값이 1에 가까울수록 균형"],
  thirdsDominant: ["긴 부위", "상안/중안/하안 중 길게 나온 곳"],
  thirdsBalance: ["3분할 균형 점수", "1에 가까울수록 1:1:1"],
  cuteMature: ["나이 인상", "cute=동안·상안 우세, mature=성숙·하안 우세"],
  chinAngle: ["턱끝 각도", "작을수록 뾰족"],
  browTiltDeg: ["눈썹 좌우 기울기(도)", "작을수록 대칭"],
  browHigherSide: ["눈썹 높은 쪽", "L 또는 R"],
  cheekBalance: ["광대 좌우 균형", "0에 가까울수록 대칭"],
  cheekHigherSide: ["광대 높은 쪽", "L 또는 R"],
  centerOffsetX: ["얼 중심점 좌우 치우침", "0에 가까울수록 정렬 양호"],
};
const BODY_KEYS: Record<string, [string, string]> = {
  shoulderSlopeDeg: ["어깨 경사각(도)", "≤16° 각진 어깨=내추럴"],
  jointWidthIndex: ["관절 너비 지수", "높을수록 뼈 프레임=내추럴"],
  whtr: ["허리/키 비", "낮을수록 연조직 적음"],
  thoraxFlat: ["흉곽 편평도", "≥0.75 두꺼움=스트레이트, <0.65 얇음=웨이브"],
  thoraxDepthRatio: ["흉곽두께/키", "높을수록 상체 두께감"],
  bhr: ["가슴/엉덩이 비(BHR)", "높을수록 상체우세=스트레이트"],
  bustHeight: ["가슴 정점 높이(상대)", "높을수록 스트레이트"],
  waistPos: ["허리 위치(높이)", "높을수록 스트레이트·다리 길이 보정"],
  sittingHeightRatio: ["좌고비(앉은키/키)", "낮을수록 롱레그, 높을수록 롱토르소"],
  shoulderHipRatio: ["어깨/골반 비", "≥1.1 어깨형, <1.0 곡선형"],
  frameRatio: ["프레임(어깨너비/키)", "높을수록 와이드"],
  neckIndexLow: ["목둘레 지수", "낮을수록 목이 가늘다"],
  shoulderTiltDeg: ["어깨 좌우 높이차(도)", "작을수록 수평"],
  shoulderHigherSide: ["어깨 높은 쪽", "L 또는 R"],
  pelvisTiltDeg: ["골반 좌우 기울기(도)", "작을수록 수평"],
  pelvisHigherSide: ["골반 높은 쪽", "L 또는 R"],
  centerOffset: ["정수리→발 중심 정렬", "0에 가까울수록 일직선"],
};

function dictLines(src: Record<string, Num> | undefined, keys: Record<string, [string, string]>): string[] {
  if (!src) return [];
  const out: string[] = [];
  for (const k of Object.keys(keys)) {
    const v = src[k];
    if (v === undefined || v === null || v === "") continue;
    const [label, meaning] = keys[k];
    out.push(`- ${label}: ${typeof v === "number" ? Math.round(v * 1000) / 1000 : v}  (${meaning})`);
  }
  return out;
}

function classLines(kind: "face" | "body", cls: Record<string, unknown> | undefined): string[] {
  if (!cls) return [];
  const out: string[] = [];
  if (kind === "face") {
    const fs = cls.faceShape as unknown;
    if (typeof fs === "string") out.push(`- 얼굴형(1순위): ${fs}`);
    const scores = cls.faceShapeScores as Record<string, number> | unknown;
    if (scores && typeof scores === "object") {
      const arr = Object.entries(scores as Record<string, number>)
        .sort((a, b) => b[1] - a[1]).slice(0, 3)
        .map(([k, v]) => `${k} ${(v * 100).toFixed(0)}%`).join(", ");
      if (arr) out.push(`- 소프트 점수(상위): ${arr}`);
    }
    const imp = cls.impression as unknown;
    if (typeof imp === "string" || typeof imp === "number") out.push(`- 인상결: ${imp}`);
  } else {
    const sk = cls.skeleton as unknown;
    if (typeof sk === "string") out.push(`- 골격 타입(1순위): ${sk}`);
    const scores = cls.skeletonScores as Record<string, number> | unknown;
    if (scores && typeof scores === "object") {
      const arr = Object.entries(scores as Record<string, number>)
        .sort((a, b) => b[1] - a[1]).slice(0, 3)
        .map(([k, v]) => `${k} ${(v * 100).toFixed(0)}%`).join(", ");
      if (arr) out.push(`- 소프트 점수(상위): ${arr}`);
    }
    const axes = cls.axes as { silhouette?: string; proportion?: string; frame?: string } | undefined;
    if (axes) out.push(`- 세부 분류: 실루엣 ${axes.silhouette ?? "-"}, 비율 ${axes.proportion ?? "-"}, 프레임 ${axes.frame ?? "-"}`);
  }
  return out;
}

const FACE_SHOTS = [
  {
    in: "얼굴형 계란형 1순위 · 종횡비 1.45(갸름) · 광대 균형 0.02(대칭) · 눈썹 좌우 기울기 2°(왼쪽이 높음) · 인상결 커머셜",
    out: "종횡비 1.45로 갸름한 얼굴형이라, 머리카락을 귀 뒤로 넘겨 턱끝까지의 V선 윤곽이 뚜렷하게 보이도록 하세요. 광대 균형이 0.02로 거의 대칭이니 정면 앵글이 잘 받지만, 왼쪽 눈썹이 약 2° 높으므로 카메라를 살짝 오른쪽에 두면 좌우가 더 고르게 찍힙니다. 인상결이 커머셜 쪽이므로 입꼬리만 1~2mm 올리는 작은 미소가 어울립니다.",
  },
];
const BODY_SHOTS = [
  {
    in: "골격 내추럴 1순위(60%) · 어깨 경사각 14°(각진 어깨) · 어깨/골반 1.05(어깨형) · 좌고비 49(롱레그) · 프레임 와이드 · 좌우 거의 수평",
    out: "어깨 경사각이 14°로 각진 편이라, 양팔을 몸통에서 주먹 하나 정도 벌려 서면 어깨의 각진 선이 선명하게 드러납니다. 좌고비 49로 롱레그 타입이므로 한쪽 발을 반보 앞에 놓아 긴 다리를 더 강조하세요. 프레임이 와이드한 만큼 정면보다 몸을 카메라에서 약 45도 돌려 서면 넓은 어깨가 자연스럽게 보입니다.",
  },
];

function buildPrompt(b: DiagnoseBody): string {
  const isFace = b.kind === "face";
  // 핵심 측정값만 (토큰 절약)
  const KEY_SUBSET = isFace
    ? ["AR", "F", "J", "jawAngle", "thirdsRatio", "thirdsDominant", "cuteMature", "centerOffsetX"]
    : ["skeleton", "shoulderSlopeDeg", "shoulderHipRatio", "sittingHeightRatio", "shoulderTiltDeg", "pelvisTiltDeg"];
  const filtered: Record<string, Num> = {};
  if (b.measurements) for (const k of KEY_SUBSET) if (b.measurements[k] !== undefined) filtered[k] = b.measurements[k];
  const ml = isFace ? dictLines(filtered, FACE_KEYS) : dictLines(filtered, BODY_KEYS);
  const cl = classLines(b.kind, b.classification);
  const example = isFace ? FACE_SHOTS[0] : BODY_SHOTS[0];

  return [
    "패션 화보 포징 디렉터로서 모델에게 포즈 지시.",
    `${isFace ? "얼굴형" : "체형"} 분석 결과:`,
    ml.join("\n"),
    cl.join("\n"),
    "",
    "규칙: 각 문장에 위 수치나 분류명을 직접 인용(예: '내추럴이라', '좌고비 49이므로'). 인용 없는 일반론 금지. 한국어 2~3문장.",
    `예시 — 입력: ${example.in}\n출력: ${example.out}`,
    "",
    '위 사람의 포징 팁 JSON 출력: {"posingTip":"...", "basis":"인용한 값들"}',
    "",
    'JSON만 출력: {"posingTip":"Step 2의 문장들을 합친 최종 팁(2~3문장)", "basis":"Step 1에서 고른 특징 나열"}',
  ].join("\n");
}

function fallback(b: DiagnoseBody): string {
  return b.kind === "face"
    ? "정면을 바라본 채 턱을 1~2cm 앞으로 내밀면 턱 아래에 그림자가 생겨 얼굴 윤곽이 뚜렷해집니다. 머리카락을 한쪽 귀 뒤로 넘기면 얼굴선이 더 잘 보입니다."
    : "두 발을 어깨너비로 벌리고 한쪽 발을 반보 앞에 놓으면 다리가 길어 보이는 효과가 있습니다. 양팔을 몸통에서 주먹 하나 정도 벌려 서면 어깨 윤곽이 선명하게 드러납니다.";
}
function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

export async function POST(req: Request): Promise<Response> {
  let body: DiagnoseBody;
  try { body = (await req.json()) as DiagnoseBody; } catch { return json({ error: "bad json" }, 400); }
  if (body.kind !== "face" && body.kind !== "body") return json({ error: "bad kind" }, 400);

  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    console.log(`[diagnose/${body.kind}] NO API KEY — returning fallback`);
    return json({ posingTip: fallback(body), basis: "", source: "fallback" });
  }

  const prompt = buildPrompt(body);
  console.log(`[diagnose/${body.kind}] === PROMPT ===\n${prompt.slice(0, 500)}...\n=== END (${prompt.length} chars) ===`);

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildPrompt(body) }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "object",
            properties: {
              posingTip: { type: "string" },
              basis: { type: "string" },
            },
            required: ["posingTip", "basis"],
          },
          temperature: 0.4,
          maxOutputTokens: 360,
        },
      }),
    });
    if (!res.ok) throw new Error(`gemini ${res.status}`);
    const data = await res.json();
    const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const parsed = JSON.parse(text) as { posingTip?: unknown; basis?: unknown };
    const tip = typeof parsed.posingTip === "string" && parsed.posingTip.trim() ? parsed.posingTip.trim() : fallback(body);
    const basis = typeof parsed.basis === "string" ? parsed.basis.trim() : "";
    console.log(`[diagnose/${body.kind}] source=gemini basis="${basis}" tip="${tip.slice(0, 80)}..."`);
    return json({ posingTip: tip, basis, source: "gemini" });
  } catch (err) {
    console.error(`[diagnose/${body.kind}] ERROR:`, err);
    return json({ posingTip: fallback(body), basis: "", source: "fallback" });
  }
}
