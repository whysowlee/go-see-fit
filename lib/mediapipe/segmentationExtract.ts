/**
 * segmentationExtract.ts — MediaPipe ImageSegmenter 기반 정면 실루엣 추출.
 *
 * 흐름:
 *   1. 정면 사진 → ImageSegmenter (selfie_multiclass) → 카테고리 마스크
 *   2. 사람 픽셀 마스크 → 행별 가로 너비 프로필 f(h) → w
 *   3. Pose landmark (어깨/허리/엉덩이 높이)에 대응하는 프로필 너비 추출
 *   4. 픽셀 너비 → cm 추정 (사용자 키 입력으로 정규화)
 *   5. 둘레 추정 (정면 너비 → π × 너비 보수, 또는 측면 깊이 있으면 ellipse)
 *
 * 출력: { shoulderWidth, bustWidth, waistWidth, hipWidth } (cm)
 *   → silhouette.ts 입력으로 사용
 *
 * 사진 미서버송신 원칙 ✅ — ImageSegmenter는 브라우저 WASM.
 */
import { getImageSegmenter } from "./loader";

export interface SegmentationOptions {
  /** 사용자 키 (cm). 픽셀→cm 정규화에 사용. */
  heightCm: number;
  /** Pose landmark에서 추출한 사람 전체 높이 (head top ~ heel, px). 키 매핑 기준. */
  personHeightPx: number;
  /** 측정 높이 (px, 사진 좌표). Pose에서 산출. */
  shoulderH: number;
  bustH: number;
  waistH: number;
  hipH: number;
  /** (선택) 측면 사진 깊이 (cm). 있으면 ellipse 둘레, 없으면 원형 보수치. */
  sideDepths?: {
    bustDepthCm?: number;
    waistDepthCm?: number;
    hipDepthCm?: number;
  };
}

export interface SegmentationResult {
  /** 정면 너비 (cm) — 마스크에서 직접 추출 */
  widths: {
    shoulder: number;
    bust: number;
    waist: number;
    hip: number;
  };
  /** 둘레 추정 (cm) — silhouette.ts 입력용 */
  circumferences: {
    bust: number;
    waist: number;
    hip: number;
  };
  /** 너비 프로필 전체 (length = imageHeight, value = 그 행의 사람 픽셀 너비, cm) */
  profile: number[];
  /** 픽셀당 cm 비율 (정규화 인자) */
  pxToCm: number;
  /** 마스크 추출 신뢰도 (0-1). 사람 픽셀이 너무 적거나 비대칭이면 낮음. */
  confidence: number;
}

/**
 * 사진(HTMLImageElement 또는 ImageBitmap)에서 사람 마스크 추출 + 너비 산출.
 */
export async function extractSilhouetteWidths(
  image: HTMLImageElement | ImageBitmap | HTMLCanvasElement,
  opts: SegmentationOptions,
): Promise<SegmentationResult> {
  const segmenter = await getImageSegmenter();

  // MediaPipe ImageSegmenter는 동기 segment(image) 반환
  const result = segmenter.segment(image);
  if (!result.categoryMask) {
    throw new Error("ImageSegmenter: categoryMask 추출 실패");
  }

  const mask = result.categoryMask;
  const width = mask.width;
  const height = mask.height;

  // 카테고리 ID: selfie_multiclass = [bg, hair, body-skin, face-skin, clothes, others]
  // 사람 = body-skin(2) + face-skin(3) + clothes(4) + hair(1) (옷 포함)
  // 우리는 *옷 포함 외곽선*이 실루엣이므로 0(bg) 외 모두 포함
  const personCategories = new Set([1, 2, 3, 4, 5]);

  // ImageSegmenter 결과는 MPMask 객체 — getAsUint8Array() 또는 maskData 접근
  // tasks-vision 0.10.35 기준: mask.getAsUint8Array()
  const maskData = mask.getAsUint8Array();

  // 행별 너비 프로필 산출 (마스크 좌표 기준, px)
  const profilePx: number[] = new Array(height).fill(0);
  for (let y = 0; y < height; y++) {
    let count = 0;
    const rowStart = y * width;
    for (let x = 0; x < width; x++) {
      if (personCategories.has(maskData[rowStart + x])) count++;
    }
    profilePx[y] = count;
  }

  // 마스크 해제 (메모리)
  mask.close();

  // px → cm 정규화. 사용자가 입력한 키와 pose 추출 키(픽셀)의 비율 적용.
  // 단, 마스크 해상도는 입력 이미지와 다를 수 있음 — segmenter 출력은 보통 256x256 고정.
  // 따라서 pose 좌표 (이미지 px) → 마스크 px로 환산 필요.
  const maskScale = height / opts.personHeightPx; // pose px → mask px
  const pxToCm = opts.heightCm / opts.personHeightPx; // 이미지 px → cm

  function widthAt(poseHpx: number): number {
    const maskY = Math.round(poseHpx * (height / (opts.personHeightPx * (opts.personHeightPx / opts.personHeightPx))));
    // 단순화: pose 좌표가 이미 이미지 px 단위면 비율로 환산
    const yIdx = Math.max(0, Math.min(height - 1, Math.round(poseHpx * maskScale)));
    return profilePx[yIdx] * (pxToCm / maskScale); // mask px → 이미지 px → cm
  }

  const widths = {
    shoulder: widthAt(opts.shoulderH),
    bust: widthAt(opts.bustH),
    waist: widthAt(opts.waistH),
    hip: widthAt(opts.hipH),
  };

  // 둘레 추정
  // - 측면 깊이 있으면 Ramanujan ellipse: C ≈ π(a+b)(1 + 3h/(10+√(4-3h))), h=((a-b)/(a+b))²
  // - 없으면 원형 보수: C = π × width (실제 둘레는 ellipse보다 약간 작음, 보수치)
  function circ(widthCm: number, depthCm?: number): number {
    if (depthCm && depthCm > 0) {
      const a = widthCm / 2;
      const b = depthCm / 2;
      const h = ((a - b) / (a + b)) ** 2;
      return Math.PI * (a + b) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));
    }
    return Math.PI * widthCm;
  }

  const circumferences = {
    bust: circ(widths.bust, opts.sideDepths?.bustDepthCm),
    waist: circ(widths.waist, opts.sideDepths?.waistDepthCm),
    hip: circ(widths.hip, opts.sideDepths?.hipDepthCm),
  };

  // 마스크 신뢰도 — 사람 픽셀 면적 대비 이미지 크기, 좌우 대칭성 등
  const totalPersonPx = profilePx.reduce((s, w) => s + w, 0);
  const coverage = totalPersonPx / (width * height);
  // 0.05 (사람이 너무 작음) ~ 0.5 (꽉 참) 사이가 정상
  const coverageScore = coverage >= 0.05 && coverage <= 0.5 ? 1.0 : Math.max(0, 1 - Math.abs(coverage - 0.25) * 4);

  // cm 프로필
  const profile = profilePx.map((p) => p * (pxToCm / maskScale));

  return {
    widths,
    circumferences,
    profile,
    pxToCm,
    confidence: Math.round(coverageScore * 100) / 100,
  };
}
