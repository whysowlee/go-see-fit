/**
 * geometry.ts — 좌표 기반 순수 계산 함수.
 * 입력 좌표는 정규화/픽셀 무관(비율·각도만 쓰므로 스케일 불변).
 */

export interface Point {
  x: number;
  y: number;
  z?: number;
}

export const dist = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

export const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/** vertex에서 a, c로 향하는 두 벡터가 이루는 각(도). 예: 하악각 = angleDeg(턱점, 고니온, 턱끝) */
export function angleDeg(a: Point, vertex: Point, c: Point): number {
  const v1 = { x: a.x - vertex.x, y: a.y - vertex.y };
  const v2 = { x: c.x - vertex.x, y: c.y - vertex.y };
  const dot = v1.x * v2.x + v1.y * v2.y;
  const m = Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y) || 1e-9;
  return (Math.acos(Math.min(1, Math.max(-1, dot / m))) * 180) / Math.PI;
}

/** 선 a-b가 수평선과 이루는 각(0~90도). 어깨 경사각 등. */
export function slopeAngleDeg(a: Point, b: Point): number {
  return (Math.atan2(Math.abs(b.y - a.y), Math.abs(b.x - a.x)) * 180) / Math.PI;
}

/** 안쪽 눈썹 각도: 안쪽 끝점→중간점 선이 수평과 이루는 각. 이미지 좌표는 y가 아래로 +라 부호 보정.
 *  ⚠ 결과 범위 [-180, +180]. 좌측 눈썹은 mid.x < inner.x 라 결과가 ±180° 경계에 모여 wrap이 발생함 → 평균/SD 부적합.
 *  새 코드에서는 signedSlopeAngleDeg 사용 권장 (호환성 위해 함수 자체는 보존). */
export function browAngleDeg(inner: Point, mid: Point): number {
  return (Math.atan2(-(mid.y - inner.y), mid.x - inner.x) * 180) / Math.PI;
}

/** 두 점을 잇는 선이 수평선과 이루는 부호 있는 각도 (도, [-90, +90]).
 *  양수 = to 가 from 보다 화면상 위, 음수 = 아래. 수평 성분은 abs() 처리해서 좌·우 무관하게 동일 동작.
 *  ⚠ 머리가 기울어진 사진에서는 그만큼 같이 기울어진 값으로 측정됨 → 얼굴 자체 기준이 필요하면 tiltFromAxis 사용. */
export function signedSlopeAngleDeg(from: Point, to: Point): number {
  const dx = Math.abs(to.x - from.x);
  const dy = -(to.y - from.y);  // 화면 y는 아래로 + → 부호 보정해서 위가 +
  return (Math.atan2(dy, dx) * 180) / Math.PI;
}

/** vStart→vEnd 벡터가 ref 축 (refStart→refEnd) 으로부터 이루는 부호 있는 각도 [-90, +90].
 *  양수 = v 가 ref 축에서 "위쪽" (이미지에서 픽셀 y 감소 방향) 으로 기울음.
 *  refStart/End 를 얼굴 자체의 수평 (예: 광대 양쪽) 으로 주면 머리 자세 기울기에 robust 한 측정.
 *  사용 예: brow tilt = tiltFromAxis(browInnerL, browMidL, zygomaticL, zygomaticR). */
export function tiltFromAxis(
  vStart: Point, vEnd: Point,
  refStart: Point, refEnd: Point,
): number {
  const rx = refEnd.x - refStart.x;
  const ry = refEnd.y - refStart.y;
  const rn = Math.hypot(rx, ry);
  if (rn === 0) return 0;
  const ux = rx / rn, uy = ry / rn;
  // 이미지 좌표 (y 아래로 +) 에서 ref 축에 수직이면서 "위쪽" 방향: (uy, -ux)
  const vx = uy, vy = -ux;
  const bx = vEnd.x - vStart.x;
  const by = vEnd.y - vStart.y;
  const parallel = bx * ux + by * uy;
  const perp = bx * vx + by * vy;
  return (Math.atan2(perp, Math.abs(parallel)) * 180) / Math.PI;
}

export const zscore = (value: number, m: number, s: number): number => (value - m) / (s || 1e-9);

/**
 * 둘레 타원근사(Ramanujan). 정면너비 + 측면깊이로 가슴/허리/엉덩이 둘레를 추정.
 * (문서 §0/3: "둘레는 정면+측면 타원근사 보조값")
 */
export function ellipseCircumference(frontWidth: number, sideDepth: number): number {
  const a = frontWidth / 2;
  const b = sideDepth / 2;
  const h = ((a - b) ** 2) / ((a + b) ** 2 || 1e-9);
  return Math.PI * (a + b) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));
}

/** softmax류 정규화 (얼굴형 소프트 점수 표시용) */
export function normalizeScores<K extends string>(raw: Record<K, number>): Record<K, number> {
  const keys = Object.keys(raw) as K[];
  const sum = keys.reduce((s, k) => s + Math.max(0, raw[k]), 0) || 1;
  const out = {} as Record<K, number>;
  for (const k of keys) out[k] = Math.max(0, raw[k]) / sum;
  return out;
}
