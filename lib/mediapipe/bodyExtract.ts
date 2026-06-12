/**
 * MediaPipe PoseLandmarker 33점 → lib/bodyType.ts BodyMeasurements 매핑.
 *
 * [좌표 정규화 → 픽셀 변환]
 * MediaPipe 정규화 좌표(x: 0-1 너비, y: 0-1 높이)를 x*W, y*H로
 * 픽셀 변환한 뒤 dist()/각도를 계산하여 종횡비 왜곡을 제거.
 *
 * [정면-측면 공통 스케일]
 * 각 이미지 안의 인물 키(px)를 기준으로 정규화(÷키 → 무차원).
 * 정면 너비·측면 깊이 모두 "키 대비 비율"이 되어 이미지 해상도·
 * 촬영 거리에 무관하게 합칠 수 있다.
 *
 * [측면 AP 깊이]
 * 좌/우 어깨 x-차이는 체표면 깊이가 아니라 골격 투영일 뿐이다.
 * → 측면 사진 캔버스를 가슴·허리·골반 높이에서 수평 스캔하여
 *   배경 대비 body 실루엣 폭(= AP 깊이)을 직접 측정한다.
 *   (measureSideDepths 함수, 호출측에서 전달)
 *
 * ── 보정이 필요한 부위 & 개선 방안 ──
 * (이전 주석과 동일: 골반폭 ×1.8, 키 프록시, jointWidthIndex 프록시,
 *  허리 위치 보간, shoulderSlopeDeg 목밑→견봉 하강각)
 */
import type { BodyMeasurements } from "../bodyType";
import { ellipseCircumference } from "../geometry";

export interface LandmarkPoint {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
}

export const POSE_IDX = {
  NOSE: 0,
  LEFT_EYE: 2,
  RIGHT_EYE: 5,
  LEFT_EAR: 7,
  RIGHT_EAR: 8,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
  LEFT_HEEL: 29,
  RIGHT_HEEL: 30,
  LEFT_FOOT_INDEX: 31,
  RIGHT_FOOT_INDEX: 32,
} as const;

export type PoseKey = keyof typeof POSE_IDX;

export const POSE_LABELS: Record<PoseKey, string> = {
  NOSE: "코",
  LEFT_EYE: "좌 눈",
  RIGHT_EYE: "우 눈",
  LEFT_EAR: "좌 귀",
  RIGHT_EAR: "우 귀",
  LEFT_SHOULDER: "좌 어깨",
  RIGHT_SHOULDER: "우 어깨",
  LEFT_ELBOW: "좌 팔꿈치",
  RIGHT_ELBOW: "우 팔꿈치",
  LEFT_WRIST: "좌 손목",
  RIGHT_WRIST: "우 손목",
  LEFT_HIP: "좌 골반",
  RIGHT_HIP: "우 골반",
  LEFT_KNEE: "좌 무릎",
  RIGHT_KNEE: "우 무릎",
  LEFT_ANKLE: "좌 발목",
  RIGHT_ANKLE: "우 발목",
  LEFT_HEEL: "좌 발뒤꿈치",
  RIGHT_HEEL: "우 발뒤꿈치",
  LEFT_FOOT_INDEX: "좌 발끝",
  RIGHT_FOOT_INDEX: "우 발끝",
};

export const POSE_UI_INDICES = Object.values(POSE_IDX);

const CORRECTIONS = {
  shoulder: 1.05,
  hip: 1.8,
  chestVsShoulder: 0.90,
  waistVsHip: 0.75,
} as const;

// ── helpers ──

function toPx(lm: LandmarkPoint, w: number, h: number): LandmarkPoint {
  return { x: lm.x * w, y: lm.y * h, z: lm.z, visibility: lm.visibility };
}

function pick(
  lm: LandmarkPoint[],
  idx: number,
  ov?: Record<number, LandmarkPoint>,
): LandmarkPoint {
  return ov?.[idx] ?? lm[idx];
}

function estimateHeightAndTop(
  lm: LandmarkPoint[],
  ov?: Record<number, LandmarkPoint>,
): { h: number; headTopY: number } {
  const nose = pick(lm, POSE_IDX.NOSE, ov);
  const eyeL = pick(lm, POSE_IDX.LEFT_EYE, ov);
  const eyeR = pick(lm, POSE_IDX.RIGHT_EYE, ov);
  const eyeMidY = (eyeL.y + eyeR.y) / 2;
  const noseToEye = Math.abs(nose.y - eyeMidY);

  let headTopY: number;
  if (noseToEye > 3) {
    headTopY = eyeMidY - noseToEye * 3.0;
  } else {
    const shMidY =
      (pick(lm, POSE_IDX.LEFT_SHOULDER, ov).y +
        pick(lm, POSE_IDX.RIGHT_SHOULDER, ov).y) /
      2;
    headTopY = nose.y - (shMidY - nose.y) * 0.9;
  }

  const footY = Math.max(
    pick(lm, POSE_IDX.LEFT_HEEL, ov).y,
    pick(lm, POSE_IDX.RIGHT_HEEL, ov).y,
    pick(lm, POSE_IDX.LEFT_FOOT_INDEX, ov).y,
    pick(lm, POSE_IDX.RIGHT_FOOT_INDEX, ov).y,
  );

  return { h: Math.max(footY - headTopY, 1), headTopY };
}

// ── side silhouette scan ──

/**
 * 측면 사진 캔버스에서 가슴·허리·골반 높이의 body 실루엣 폭(= AP 깊이)을 측정.
 *
 * 이미지 네 모서리를 배경색으로 추정하고, 각 높이에서 좌→우 스캔하여
 * 배경과 색 차이가 큰 연속 영역의 폭을 body로 판정한다.
 * ±5행을 평균하여 노이즈를 완화.
 *
 * @param canvas  원본 이미지가 그려진 캔버스 (annotation 없는 상태)
 * @param sidePoseNorm  MediaPipe 정규화 좌표 (스캔 높이 결정용)
 * @param dims  이미지 실제 px 크기
 */
export function measureSideDepths(
  canvas: HTMLCanvasElement,
  sidePoseNorm: LandmarkPoint[],
  dims: { width: number; height: number },
): { chestAP: number; waistAP: number; hipAP: number } {
  const { width: w, height: imgH } = dims;
  const ctx = canvas.getContext("2d")!;

  const sampleBg = (sx: number, sy: number, size: number) => {
    const d = ctx.getImageData(sx, sy, size, size).data;
    let r = 0,
      g = 0,
      b = 0;
    const n = d.length / 4;
    for (let i = 0; i < d.length; i += 4) {
      r += d[i];
      g += d[i + 1];
      b += d[i + 2];
    }
    return { r: r / n, g: g / n, b: b / n };
  };

  const pad = Math.min(10, Math.floor(w / 20), Math.floor(imgH / 20));
  const corners = [
    sampleBg(0, 0, pad),
    sampleBg(w - pad, 0, pad),
    sampleBg(0, imgH - pad, pad),
    sampleBg(w - pad, imgH - pad, pad),
  ];
  const bgR = corners.reduce((s, c) => s + c.r, 0) / 4;
  const bgG = corners.reduce((s, c) => s + c.g, 0) / 4;
  const bgB = corners.reduce((s, c) => s + c.b, 0) / 4;

  const THRESH = 35;
  const BAND = 5;

  function scanWidth(yCenter: number): number {
    let total = 0,
      cnt = 0;
    for (let dy = -BAND; dy <= BAND; dy++) {
      const y = Math.round(yCenter) + dy;
      if (y < 0 || y >= imgH) continue;
      const row = ctx.getImageData(0, y, w, 1).data;
      let left = -1,
        right = -1;
      for (let x = 0; x < w; x++) {
        const i = x * 4;
        const dr = row[i] - bgR;
        const dg = row[i + 1] - bgG;
        const db = row[i + 2] - bgB;
        if (Math.sqrt(dr * dr + dg * dg + db * db) > THRESH) {
          if (left < 0) left = x;
          right = x;
        }
      }
      if (left >= 0 && right > left) {
        total += right - left;
        cnt++;
      }
    }
    return cnt > 0 ? total / cnt : 0;
  }

  const shY =
    ((sidePoseNorm[POSE_IDX.LEFT_SHOULDER].y +
      sidePoseNorm[POSE_IDX.RIGHT_SHOULDER].y) /
      2) *
    imgH;
  const hipY =
    ((sidePoseNorm[POSE_IDX.LEFT_HIP].y +
      sidePoseNorm[POSE_IDX.RIGHT_HIP].y) /
      2) *
    imgH;
  const waistY = shY + (hipY - shY) * 0.4;

  return {
    chestAP: scanWidth(shY),
    waistAP: scanWidth(waistY),
    hipAP: scanWidth(hipY),
  };
}

/** 측면 사진에서 인물 키를 픽셀로 추정 (정규화→픽셀 변환 후 계산). */
export function estimateSideHeight(
  sideRaw: LandmarkPoint[],
  dims: { width: number; height: number },
): number {
  const px = sideRaw.map((lm) => toPx(lm, dims.width, dims.height));
  return estimateHeightAndTop(px).h;
}

// ── main ──

export interface SideDepths {
  chestAP: number;
  waistAP: number;
  hipAP: number;
  personHeight: number;
}

export interface BodyExtractResult {
  measurements: BodyMeasurements;
  sideAvailable: boolean;
  approximations: string[];
  crossValidation?: {
    thoraxFlat_fromCirc: number | null;
  };
  pxPerCm?: number;
}

function inverseEllipseDepth(circumference: number, frontWidth: number): number {
  const a = frontWidth / 2;
  let lo = 0.01,
    hi = frontWidth * 3;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (ellipseCircumference(frontWidth, mid) < circumference) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * 정면 Pose 랜드마크 + (선택) 측면 실루엣 깊이 → BodyMeasurements.
 *
 * 모든 폭·깊이를 "그 이미지 안 인물 키"로 나눠 무차원화한 뒤 합친다.
 * 따라서 이미지 해상도·촬영 거리에 무관하게 정면+측면을 결합할 수 있다.
 */
/**
 * 정면 Pose 랜드마크 + (선택) 측면 실루엣 깊이 + (선택) 실측 입력
 * → BodyMeasurements.
 *
 * 실측 우선 원칙 (§4-bis):
 *  - bustIn/waistIn/hipIn (inch) → cm 변환 → bhr, whtr, chestMinusWaist_cm 직접 산출
 *  - heightCm → pxPerCm 확보, cm 변환
 *  - 실측 없으면 타원근사 폴백
 *
 * 사진 기반으로만 남는 값: shoulderSlopeDeg, bustHeight, waistPos,
 * sittingHeightRatio, jointWidthIndex, thoraxFlat, shoulderHipRatio,
 * shoulderHeightRatio
 */
export function extractBodyMeasurements(
  frontRaw: LandmarkPoint[],
  options: {
    frontDims: { width: number; height: number };
    sideDepths?: SideDepths;
    heightCm?: number;
    bustIn?: number;
    waistIn?: number;
    hipIn?: number;
    frontOverrides?: Record<number, LandmarkPoint>;
    neckBasePx?: { left: { x: number; y: number }; right: { x: number; y: number } };
    /** 사용자가 보정한 "양쪽 목 옆선" (편집 그룹 #5). neckIndexLow 계산에 사용. */
    neckPx?: { left: { x: number; y: number }; right: { x: number; y: number } };
  },
): BodyExtractResult {
  const approx: string[] = [];
  const { frontDims } = options;
  const fo = options.frontOverrides;

  const IN2CM = 2.54;
  const bustCm = options.bustIn != null ? options.bustIn * IN2CM : undefined;
  const waistCm = options.waistIn != null ? options.waistIn * IN2CM : undefined;
  const hipCm = options.hipIn != null ? options.hipIn * IN2CM : undefined;
  const hasRealCirc = bustCm != null && waistCm != null && hipCm != null;
  const hasHeight = options.heightCm != null && options.heightCm > 0;

  // ── 정규화 → 픽셀 ──
  const front = frontRaw.map((lm) =>
    toPx(lm, frontDims.width, frontDims.height),
  );
  const { h: frontH, headTopY } = estimateHeightAndTop(front, fo);

  const pxPerCm = hasHeight ? frontH / options.heightCm! : undefined;

  // ── 정면 랜드마크 (px) ──
  const shL = pick(front, POSE_IDX.LEFT_SHOULDER, fo);
  const shR = pick(front, POSE_IDX.RIGHT_SHOULDER, fo);
  const hipL = pick(front, POSE_IDX.LEFT_HIP, fo);
  const hipR = pick(front, POSE_IDX.RIGHT_HIP, fo);
  const nose = pick(front, POSE_IDX.NOSE, fo);
  const earL = pick(front, POSE_IDX.LEFT_EAR, fo);
  const earR = pick(front, POSE_IDX.RIGHT_EAR, fo);

  // 축분해: 너비는 x차이만, 높이는 y차이만 (유클리드 직선거리 금지)
  const shoulderW_raw = Math.abs(shL.x - shR.x);
  const hipW_raw = Math.abs(hipL.x - hipR.x);
  const shMidX = (shL.x + shR.x) / 2;
  const shMidY = (shL.y + shR.y) / 2;
  const hipMidY = (hipL.y + hipR.y) / 2;

  // ── 어깨경사각: 측경(neckBase)→견봉(acromion) 하강각 ──
  // neckBasePx가 있으면(landmarks 보정 UI에서 전달) 그걸 사용,
  // 없으면 코-어깨중점 중간을 폴백 프록시로.
  const nbL = options.neckBasePx?.left ?? { x: shMidX, y: (nose.y + shMidY) / 2 };
  const nbR = options.neckBasePx?.right ?? { x: shMidX, y: (nose.y + shMidY) / 2 };
  const leftDescent =
    (Math.atan2(shL.y - nbL.y, Math.abs(shL.x - nbL.x)) * 180) / Math.PI;
  const rightDescent =
    (Math.atan2(shR.y - nbR.y, Math.abs(shR.x - nbR.x)) * 180) / Math.PI;
  const shoulderSlopeDeg = (leftDescent + rightDescent) / 2;

  // ── 체표면 보정 (px) ──
  const shBody = shoulderW_raw * CORRECTIONS.shoulder;
  const hipBody = hipW_raw * CORRECTIONS.hip;

  // ── 키 대비 무차원 (÷ 정면 인물 키) ──
  const shBody_n = shBody / frontH;
  const hipBody_n = hipBody / frontH;

  const shoulderHipRatio = shBody / hipBody;
  const shoulderHeightRatio = shBody_n;

  const sittingHeightRatio = ((hipMidY - headTopY) / frontH) * 100;
  approx.push("sittingHeightRatio: 머리~골반 프록시");

  const jointWidthIndex = (shBody_n + hipBody_n) * 13;
  approx.push("jointWidthIndex: 어깨+골반 비례 프록시");

  // 목 폭: 사용자가 보정한 neckL/neckR (편집 그룹 #5 "목에서 가장 굵은 부분") 우선.
  // 없으면 귀 간격 프록시로 폴백 (정확도 ↓ — 머리 크기에 좌우됨).
  const neckWidth = options.neckPx
    ? Math.abs(options.neckPx.right.x - options.neckPx.left.x)
    : Math.abs(earL.x - earR.x);
  // 컷 0.40 = 목 옆선 폭 / 어깨 너비. (귀 간격 기준 0.55 → 목 폭은 더 좁으니 임계도 더 작아야)
  // 임시값. SizeKorea 목둘레지수 분포로 보정 예정.
  const neckThin = neckWidth / shoulderW_raw < 0.40;
  const neckIndexLow = neckThin && shoulderSlopeDeg <= 16;
  approx.push(options.neckPx ? "neckIndexLow: 보정된 목 옆선 폭/어깨" : "neckIndexLow: 귀 간격/어깨 프록시 (폴백)");

  // ── 정면 체표면 너비 (키 대비 무차원) ──
  const chestFW_n = shBody_n * CORRECTIONS.chestVsShoulder;
  const hipFW_n = hipBody_n;
  const waistFW_n = hipBody_n * CORRECTIONS.waistVsHip;

  // ── 측면 AP 깊이 (키 대비 무차원) — thoraxFlat 산출용 ──
  const hasSide = options.sideDepths != null;
  let chestSD_n: number;
  let waistSD_n: number;
  let hipSD_n: number;

  if (hasSide) {
    const sd = options.sideDepths!;
    const sH = Math.max(sd.personHeight, 1);
    chestSD_n = sd.chestAP / sH;
    waistSD_n = sd.waistAP / sH;
    hipSD_n = sd.hipAP / sH;
  } else {
    chestSD_n = chestFW_n * 0.75;
    waistSD_n = waistFW_n * 0.70;
    hipSD_n = hipFW_n * 0.75;
    approx.push("체형 깊이: 측면 사진 없어 기본 AP/횡경 비율 적용");
  }

  const thoraxFlat = chestSD_n / chestFW_n;

  // ── 둘레 기반 측정값: 실측 우선, 없으면 타원근사 폴백 ──
  let whtr: number;
  let bhr: number;
  let chestMinusWaist_cm: number;

  if (hasRealCirc) {
    bhr = bustCm! / hipCm!;
    chestMinusWaist_cm = bustCm! - waistCm!;
    if (hasHeight) {
      whtr = waistCm! / options.heightCm!;
    } else {
      whtr = waistCm! / 170;
      approx.push("whtr: 키 미입력 → 170cm 기본값");
    }
  } else {
    const chestC = ellipseCircumference(chestFW_n, chestSD_n);
    const waistC = ellipseCircumference(waistFW_n, waistSD_n);
    const hipC = ellipseCircumference(hipFW_n, hipSD_n);
    whtr = waistC;
    bhr = chestC / hipC;
    const fallbackH = options.heightCm ?? 170;
    chestMinusWaist_cm = (chestC - waistC) * fallbackH;
    approx.push("둘레: 실측 미입력 → 타원근사 추정");
    if (!hasHeight) approx.push("chestMinusWaist_cm: 키 미입력 → 170cm 기본값");
  }

  // ── 수직 위치 ──
  const bustHeight = (shMidY - headTopY) / frontH;
  const waistY = shMidY + (hipMidY - shMidY) * 0.4;
  const footY = headTopY + frontH;
  const waistPos = (footY - waistY) / frontH;

  // ── thoraxFlat 교차검증: 실측 가슴둘레 + 정면 너비(cm) → 타원 역산 깊이 ──
  let crossValidation: BodyExtractResult["crossValidation"];
  if (hasRealCirc && pxPerCm) {
    const chestFW_cm = (shBody * CORRECTIONS.chestVsShoulder) / pxPerCm;
    const depthCm = inverseEllipseDepth(bustCm!, chestFW_cm);
    crossValidation = { thoraxFlat_fromCirc: depthCm / chestFW_cm };
  }

  return {
    measurements: {
      shoulderSlopeDeg,
      jointWidthIndex,
      whtr,
      neckIndexLow,
      thoraxFlat,
      bhr,
      bustHeight,
      waistPos,
      shoulderHipRatio,
      chestMinusWaist_cm,
      sittingHeightRatio,
      shoulderHeightRatio,
    },
    sideAvailable: hasSide,
    approximations: approx,
    crossValidation,
    pxPerCm,
  };
}
