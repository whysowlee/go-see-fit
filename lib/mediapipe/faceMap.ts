/**
 * MediaPipe Face Mesh 478점(468 mesh + 10 iris) →
 * lib/faceShape.ts FaceLandmarks 14개 의미 좌표 매핑.
 *
 * 인덱스 선정: canonical face mesh의 FACE_OVAL 컨투어 +
 * eyebrow/nose 그룹에서 해부학적으로 가장 가까운 점.
 * 드래그 보정 UI에서 사용자가 미세 조정 가능.
 */
import type { FaceLandmarks } from "../faceShape";
import type { Point } from "../geometry";

export interface LandmarkPoint {
  x: number;
  y: number;
  z?: number;
}

/*
 * FACE_OVAL 컨투어 (시계방향, top → right → bottom → left):
 * 10,338,297,332,284,251,389,356,454,323,361,288,
 * 397,365,379,378,400,377,152,148,176,149,150,136,
 * 172,58,132,93,234,127,162,21,54,103,67,109
 *
 * 좌우 대칭 쌍:  foreheadR 284 ↔ foreheadL 54
 *               zygomaticR 454 ↔ zygomaticL 234
 *               gonionR 397 ↔ gonionL 172
 *               jawMidR 288 ↔ jawMidL 58
 *
 * 좌 눈썹 상부 컨투어 (외→내): 70, 63, 105, 66, 107
 */
export const FACE_IDX = {
  foreheadCenterTop: 10,
  menton: 152,
  zygomaticL: 234,
  zygomaticR: 454,
  foreheadL: 54,
  foreheadR: 284,
  gonionL: 172,
  gonionR: 397,
  jawMidL: 58,
  jawMidR: 288,
  browInnerL: 107,
  browMidL: 105,
  noseSellion: 168,
  noseTip: 1,
} as const;

// 우측 눈썹 — FaceLandmarks 인터페이스에는 없지만 에디터 표시·대칭 보정용
export const FACE_IDX_EXTRA = {
  browInnerR: 336,
  browPeakR: 334,
} as const;

export type FaceLandmarkKey = keyof typeof FACE_IDX;

export const FACE_LABELS: Record<FaceLandmarkKey, string> = {
  foreheadCenterTop: "이마 중앙",
  menton: "턱끝",
  zygomaticL: "좌 광대",
  zygomaticR: "우 광대",
  foreheadL: "좌 이마",
  foreheadR: "우 이마",
  gonionL: "좌 하악각",
  gonionR: "우 하악각",
  jawMidL: "좌 턱선",
  jawMidR: "우 턱선",
  browInnerL: "좌 눈썹 안쪽",
  browMidL: "좌 눈썹 중간",
  noseSellion: "콧대(셀리온)",
  noseTip: "코끝",
};

export const FACE_LANDMARK_KEYS = Object.keys(FACE_IDX) as FaceLandmarkKey[];

/**
 * MediaPipe 정규화 좌표 → 픽셀 좌표로 변환하여 FaceLandmarks 반환.
 *
 * MediaPipe 정규화 좌표는 x가 이미지 너비, y가 이미지 높이 기준이라
 * 가로·세로 단위가 다르다. geometry.ts dist()가 올바른 비율(AR 등)을
 * 산출하려면 동일 단위(픽셀)로 변환해야 한다.
 *
 * overrides는 드래그 보정 UI에서 전달하며 이미 픽셀 좌표여야 한다.
 */
export function mapToFaceLandmarks(
  mesh: LandmarkPoint[],
  imageWidth: number,
  imageHeight: number,
  overrides?: Partial<Record<FaceLandmarkKey, Point>>,
): FaceLandmarks {
  const get = (key: FaceLandmarkKey): Point => {
    if (overrides?.[key]) return overrides[key]!;
    const lm = mesh[FACE_IDX[key]];
    return { x: lm.x * imageWidth, y: lm.y * imageHeight, z: lm.z };
  };

  return {
    foreheadCenterTop: get("foreheadCenterTop"),
    menton: get("menton"),
    zygomaticL: get("zygomaticL"),
    zygomaticR: get("zygomaticR"),
    foreheadL: get("foreheadL"),
    foreheadR: get("foreheadR"),
    gonionL: get("gonionL"),
    gonionR: get("gonionR"),
    jawMidL: get("jawMidL"),
    jawMidR: get("jawMidR"),
    browInnerL: get("browInnerL"),
    browMidL: get("browMidL"),
    noseSellion: get("noseSellion"),
    noseTip: get("noseTip"),
  };
}
