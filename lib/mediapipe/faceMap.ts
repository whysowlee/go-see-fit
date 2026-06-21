/**
 * MediaPipe Face Mesh 478점(468 mesh + 10 iris) →
 * lib/faceShape.ts FaceLandmarks 14개 의미 좌표 매핑.
 *
 * 인덱스 선정: canonical face mesh의 FACE_OVAL 컨투어 +
 * eyebrow/nose 그룹에서 해부학적으로 가장 가까운 점.
 * 드래그 보정 UI에서 사용자가 미세 조정 가능.
 */
import type { FaceLandmarks } from "../faceShape";
import type { FaceProportionPoints } from "../faceProportion";
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

/*
 * 세로 3분할(상/중/하안)용 경계점.
 *  trichion  = 10  (= foreheadCenterTop, 상안 위 끝; 헤어라인 근사 — pitch·앞머리에 불안정)
 *  glabella  = 107·336 중점 (눈썹 안쪽 = 상/중 경계)
 *  subnasale = 2   (코밑 = 중/하 경계; 정면 미드라인, 드래그 보정 가능)
 *  menton    = 152 (= menton, 하안 아래 끝)
 */
export const FACE_IDX_PROPORTION = {
  trichion: 10,
  glabellaL: 107,
  glabellaR: 336,
  subnasale: 2,
  menton: 152,
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

/**
 * MediaPipe mesh → 세로 3분할 경계 4점(FaceProportionPoints).
 * 기존 드래그 보정점을 재사용: trichion←foreheadCenterTop, menton←menton,
 * glabella 좌←browInnerL(보정 가능)·우←336(mesh). subnasale 는 mesh 전용.
 * 좌표는 mapToFaceLandmarks 와 동일하게 픽셀 단위로 변환(종횡 스케일 일치).
 */
export function mapToFaceProportionPoints(
  mesh: LandmarkPoint[],
  imageWidth: number,
  imageHeight: number,
  overrides?: Partial<Record<FaceLandmarkKey, Point>>,
): FaceProportionPoints {
  const px = (idx: number): Point => {
    const lm = mesh[idx];
    // z 는 MediaPipe 규약상 x 와 같은 스케일(이미지 너비 기준) → ×imageWidth 로 통일.
    // (x=×W, y=×H, z=×W 픽셀 단위로 맞춰야 3D 정사영이 기하적으로 정확)
    return { x: lm.x * imageWidth, y: lm.y * imageHeight, z: lm.z !== undefined ? lm.z * imageWidth : undefined };
  };
  const trichion = overrides?.foreheadCenterTop ?? px(FACE_IDX_PROPORTION.trichion);
  const menton = overrides?.menton ?? px(FACE_IDX_PROPORTION.menton);
  const glaL = overrides?.browInnerL ?? px(FACE_IDX_PROPORTION.glabellaL);
  const glaR = px(FACE_IDX_PROPORTION.glabellaR);
  const glabella: Point = { x: (glaL.x + glaR.x) / 2, y: (glaL.y + glaR.y) / 2 };
  const subnasale = px(FACE_IDX_PROPORTION.subnasale);
  return { trichion, glabella, subnasale, menton };
}
