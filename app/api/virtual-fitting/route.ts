export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = "gemini-2.5-flash-image-preview";

interface VFChip {
  label: string;
  category: "garment" | "hair" | "makeup";
  prompt: string;
  imageUrl?: string;
}
interface VFBody {
  kind: "face" | "body";
  imageDataUrl: string;       // 원본 사진 (dataURL)
  imageMimeType?: string;     // 옵션, dataURL에서 추출 가능
  chips: VFChip[];
  garmentImages?: string[];   // 추가 옷 누끼 dataURL 또는 URL
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

function splitDataUrl(dataUrl: string): { mimeType: string; data: string } | null {
  const m = dataUrl.match(/^data:([^;,]+)(?:;[^,]*)?,(.+)$/);
  if (!m) return null;
  const mimeType = m[1];
  const meta = dataUrl.slice(0, dataUrl.indexOf(","));
  const isBase64 = /;base64/i.test(meta);
  if (isBase64) return { mimeType, data: m[2] };
  // url-encoded → base64
  try {
    const decoded = decodeURIComponent(m[2]);
    return { mimeType, data: Buffer.from(decoded, "utf-8").toString("base64") };
  } catch {
    return null;
  }
}

function buildPrompt(kind: "face" | "body", chips: VFChip[]): string {
  const hair = chips.filter((c) => c.category === "hair").map((c) => c.prompt);
  const makeup = chips.filter((c) => c.category === "makeup").map((c) => c.prompt);
  const garment = chips.filter((c) => c.category === "garment").map((c) => c.prompt);

  const lines: string[] = [];
  lines.push("아래 사진의 인물에게 다음 스타일을 자연스럽게 적용한 결과 이미지를 생성해주세요.");
  lines.push("규칙: 인물의 얼굴 정체성·체형·자세·배경은 그대로 유지하고, 지정한 항목만 바꿉니다. 결과는 사진처럼 자연스럽게 합성해주세요.");
  if (kind === "face") {
    if (hair.length) lines.push(`헤어: ${hair.join(", ")}`);
    if (makeup.length) lines.push(`메이크업: ${makeup.join(", ")}`);
  } else {
    if (garment.length) lines.push(`의상: ${garment.join(", ")}`);
  }
  return lines.join("\n");
}

export async function POST(req: Request): Promise<Response> {
  let body: VFBody;
  try { body = (await req.json()) as VFBody; } catch { return json({ error: "bad json" }, 400); }
  if (body.kind !== "face" && body.kind !== "body") return json({ error: "bad kind" }, 400);
  if (!body.imageDataUrl) return json({ error: "no image" }, 400);

  const relevant = (body.chips ?? []).filter((c) =>
    body.kind === "face" ? (c.category === "hair" || c.category === "makeup") : c.category === "garment",
  );
  if (relevant.length === 0) return json({ error: "no chips" }, 400);

  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    console.log(`[vf/${body.kind}] NO API KEY — returning original (fallback)`);
    return json({ imageDataUrl: body.imageDataUrl, source: "fallback", errorMessage: "API 키 없음" });
  }

  const parsed = splitDataUrl(body.imageDataUrl);
  if (!parsed) return json({ error: "bad image dataUrl" }, 400);

  const prompt = buildPrompt(body.kind, relevant);
  console.log(`[vf/${body.kind}] === PROMPT ===\n${prompt}\n=== labels: ${relevant.map((c) => c.label).join(", ")} ===`);

  // parts: 사용자 사진 + (옷 누끼들) + 텍스트 프롬프트
  const parts: Array<Record<string, unknown>> = [
    { inlineData: { mimeType: parsed.mimeType, data: parsed.data } },
  ];
  if (body.kind === "body" && Array.isArray(body.garmentImages)) {
    for (const g of body.garmentImages) {
      const gp = splitDataUrl(g);
      if (gp) parts.push({ inlineData: { mimeType: gp.mimeType, data: gp.data } });
    }
  }
  parts.push({ text: prompt });

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { responseModalities: ["IMAGE"] },
      }),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      console.error(`[vf/${body.kind}] gemini ${res.status}: ${txt.slice(0, 300)}`);
      return json({ imageDataUrl: body.imageDataUrl, source: "fallback", errorMessage: `Gemini ${res.status}` });
    }
    const data = await res.json();
    const candParts: Array<Record<string, unknown>> | undefined = data?.candidates?.[0]?.content?.parts;
    let outMime = "image/png";
    let outData = "";
    if (Array.isArray(candParts)) {
      for (const p of candParts) {
        const inl = (p as { inlineData?: { mimeType?: string; data?: string } }).inlineData;
        if (inl?.data) {
          outMime = inl.mimeType ?? outMime;
          outData = inl.data;
          break;
        }
      }
    }
    if (!outData) {
      console.error(`[vf/${body.kind}] no image in response`);
      return json({ imageDataUrl: body.imageDataUrl, source: "fallback", errorMessage: "이미지 응답 없음" });
    }
    const outUrl = `data:${outMime};base64,${outData}`;
    console.log(`[vf/${body.kind}] source=gemini bytes=${outData.length}`);
    return json({ imageDataUrl: outUrl, source: "gemini" });
  } catch (err) {
    console.error(`[vf/${body.kind}] ERROR:`, err);
    return json({ imageDataUrl: body.imageDataUrl, source: "fallback", errorMessage: String(err).slice(0, 200) });
  }
}
