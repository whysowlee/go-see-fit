/**
 * saveAsHtml.ts — 현재 페이지를 self-contained 단일 HTML로 저장.
 *
 * 흐름:
 *   1. document 복제
 *   2. <script> 모두 제거 (인터랙티브 X — 정적 결과 스냅샷)
 *   3. <link rel="stylesheet"> 외부 CSS 인라인
 *   4. <img>의 외부 URL/blob URL → base64 dataURL 변환
 *   5. <canvas> → 현재 픽셀을 dataURL <img>로 대체
 *   6. Blob 다운로드 (text/html;charset=utf-8)
 *
 * 보안 메모: data: / blob: / 동일 출처 자원만 fetch 가능.
 *   사진은 메모리·blob URL이라 fetch 후 base64 — 사진 자체는 원래 미서버송신.
 *
 * 사용 예:
 *   await saveCurrentPageAsHtml({ filename: "go-see-fit-결과.html" });
 */

interface SaveOptions {
  filename?: string;
  /** 결과 부분만 저장하려면 root element id. 미지정 시 document 전체 */
  rootId?: string;
}

/** fetch 가능한 URL을 base64 dataURL로 변환. 실패 시 원본 URL 유지. */
async function urlToDataUrl(url: string): Promise<string | null> {
  if (!url || url.startsWith("data:")) return url || null;
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const blob = await resp.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** <link rel="stylesheet">를 <style>로 인라인. CORS 실패 시 원본 link 유지. */
async function inlineStylesheets(clone: HTMLElement, sourceDoc: Document) {
  const links = Array.from(clone.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'));
  // 원본 doc의 styleSheets에서도 시도 (이미 로드된 CSS rule 가져오기)
  const sheetMap = new Map<string, string>();
  for (const sheet of Array.from(sourceDoc.styleSheets)) {
    try {
      if (!sheet.href) continue;
      const cssText = Array.from(sheet.cssRules).map((r) => r.cssText).join("\n");
      if (cssText) sheetMap.set(sheet.href, cssText);
    } catch {
      /* CORS 보호된 stylesheet — fetch로 시도 */
    }
  }

  for (const link of links) {
    const href = link.getAttribute("href");
    if (!href) continue;
    // 절대 URL로 변환
    const absUrl = new URL(href, sourceDoc.baseURI).href;
    let cssText = sheetMap.get(absUrl);
    if (!cssText) {
      try {
        const resp = await fetch(absUrl);
        if (resp.ok) cssText = await resp.text();
      } catch {
        /* keep original link */
      }
    }
    if (cssText) {
      const style = sourceDoc.createElement("style");
      style.setAttribute("data-inlined-from", href);
      style.textContent = cssText;
      link.replaceWith(style);
    }
  }
}

/** <img> 의 외부 URL을 base64로 변환. */
async function inlineImages(clone: HTMLElement) {
  const imgs = Array.from(clone.querySelectorAll<HTMLImageElement>("img"));
  await Promise.all(
    imgs.map(async (img) => {
      const src = img.getAttribute("src");
      if (!src || src.startsWith("data:")) return;
      const dataUrl = await urlToDataUrl(src);
      if (dataUrl) img.setAttribute("src", dataUrl);
    }),
  );
}

/** <canvas> 의 현재 픽셀을 <img src="data:...">로 대체 (랜드마크 오버레이 등). */
function replaceCanvases(clone: HTMLElement, sourceDoc: Document) {
  // 원본 doc의 canvas와 clone의 canvas 매칭 (DOM 순서 동일 가정)
  const srcCanvases = Array.from(sourceDoc.querySelectorAll("canvas"));
  const cloneCanvases = Array.from(clone.querySelectorAll("canvas"));
  cloneCanvases.forEach((cloneCanvas, i) => {
    const srcCanvas = srcCanvases[i] as HTMLCanvasElement | undefined;
    if (!srcCanvas) return;
    try {
      const dataUrl = srcCanvas.toDataURL("image/png");
      const img = sourceDoc.createElement("img");
      img.src = dataUrl;
      img.style.cssText = cloneCanvas.getAttribute("style") || "";
      const w = srcCanvas.width || cloneCanvas.clientWidth;
      const h = srcCanvas.height || cloneCanvas.clientHeight;
      if (w) img.style.width = `${cloneCanvas.clientWidth}px`;
      if (h) img.style.height = `${cloneCanvas.clientHeight}px`;
      cloneCanvas.replaceWith(img);
    } catch {
      /* tainted canvas (CORS) — leave as-is */
    }
  });
}

/** 인터랙티브 요소 제거 (스냅샷 — 서버 호출/JS 핸들러 제거) */
function stripInteractive(clone: HTMLElement) {
  clone.querySelectorAll("script").forEach((s) => s.remove());
  clone.querySelectorAll('[data-no-save="true"]').forEach((el) => el.remove());
  // file input, hidden upload는 제거
  clone.querySelectorAll('input[type="file"]').forEach((el) => el.remove());
  // .no-print 클래스도 출력에서 빼기 (PDF 저장과 일관성)
  clone.querySelectorAll(".no-print").forEach((el) => el.remove());
}

/** Blob 다운로드 트리거 */
function downloadHtml(html: string, filename: string) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function saveCurrentPageAsHtml(opts: SaveOptions = {}): Promise<void> {
  const sourceDoc = document;
  const root = opts.rootId ? sourceDoc.getElementById(opts.rootId) : sourceDoc.documentElement;
  if (!root) throw new Error(`Root element not found: ${opts.rootId}`);

  // 1) clone
  const clone = root.cloneNode(true) as HTMLElement;

  // 2) interactive 제거
  stripInteractive(clone);

  // 3) stylesheets 인라인 (clone이 documentElement 일 때만 link 처리 — partial은 외부 CSS 사용 그대로)
  if (!opts.rootId) {
    await inlineStylesheets(clone, sourceDoc);
  }

  // 4) canvas → image
  replaceCanvases(clone, sourceDoc);

  // 5) <img> base64 인라인
  await inlineImages(clone);

  // 6) HTML 조립
  let html: string;
  if (opts.rootId) {
    // partial root: <html><head> 보강 + clone을 body로
    const headStyles = Array.from(sourceDoc.querySelectorAll("style"))
      .map((s) => s.outerHTML)
      .join("\n");
    const headLinkStyles = await getInlinedHeadStyles(sourceDoc);
    html =
      `<!DOCTYPE html>\n<html lang="ko"><head>` +
      `<meta charset="utf-8">` +
      `<meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<title>${sourceDoc.title || "go-see-fit 결과"}</title>` +
      headStyles +
      headLinkStyles +
      `</head><body>${clone.outerHTML}</body></html>`;
  } else {
    html = `<!DOCTYPE html>\n${clone.outerHTML}`;
  }

  // 7) 다운로드
  const filename = opts.filename || `go-see-fit-결과-${new Date().toISOString().slice(0, 10)}.html`;
  downloadHtml(html, filename);
}

async function getInlinedHeadStyles(sourceDoc: Document): Promise<string> {
  const parts: string[] = [];
  for (const sheet of Array.from(sourceDoc.styleSheets)) {
    try {
      const cssText = Array.from(sheet.cssRules).map((r) => r.cssText).join("\n");
      if (cssText) parts.push(`<style>${cssText}</style>`);
    } catch {
      /* CORS skip */
    }
  }
  return parts.join("\n");
}
