/**
 * faceProportion.ts — 얼굴 세로 3분할(상/중/하안) 비율 + cute↔mature.
 *
 * faceShape.ts 가 다루지 않는 "세로 무게중심"을 채운다. 모든 임계·가중치는
 * faceProportionConfig.ts 에서 주입(로직에 숫자 하드코딩 금지).
 *
 * 입력은 의미 좌표 4점(트리키온·미간·코밑·턱끝). MediaPipe mesh → 이 4점 매핑은
 * lib/mediapipe/faceMap.ts(mapToFaceProportionPoints)에서 처리.
 *
 * 정확도 메모:
 *  - 좌우 기울기(roll): 경계점을 얼굴 세로축(트리키온→턱끝)에 정사영해 측정 → roll robust.
 *  - 위아래 기울기(pitch): 2D 정면 한 장으로는 보정 불가. 상안(헤어라인)은 특히 불안정 →
 *    UI 에서 '참고용'으로 다룰 것.
 */
import type { Point } from "./geometry";
import { PROP } from "./faceProportionConfig";

/** 세로 3분할 계산에 필요한 의미 좌표(픽셀 단위 권장 — 종횡 스케일 일치). */
export interface FaceProportionPoints {
  trichion: Point; // 이마 최상단(헤어라인 근사) — 상안 위 끝
  glabella: Point; // 미간(눈썹 안쪽 중점) — 상/중 경계
  subnasale: Point; // 코밑 — 중/하 경계
  menton: Point; // 턱끝 — 하안 아래 끝
}

export type DominantRegion = "상안" | "중안" | "하안" | "균형";
export type CuteMatureLabel = "cute" | "mid" | "mature";

export interface FaceProportionResult {
  /** 각 부위가 얼굴 세로길이에서 차지하는 비율(합=1). */
  upper: number;
  middle: number;
  lower: number;
  /** 이상치(1/3) 대비 부호 있는 편차. 양수 = 이상보다 긴 부위. */
  deviation: { upper: number; middle: number; lower: number };
  /** 표시용 비율 — 이상=1.00 기준. "1.05 : 0.98 : 0.97" (상:중:하). */
  ratio: { upper: number; middle: number; lower: number };
  ratioStr: string;
  /** 1:1:1 균형 점수(0~1, 1=완벽 균형). */
  balanceScore: number;
  /** 가장 두드러진(이상보다 긴) 부위. 편차가 작으면 '균형'. */
  dominant: DominantRegion;
  /** 0(cute)~1(mature). 하안부 길이 기준: 짧으면 동안(cute), 길면 성숙(mature). */
  cuteMature: number;
  cuteMatureLabel: CuteMatureLabel;
}

const zOf = (p: Point): number => p.z ?? 0;

/** 점 p 를 축(origin→) 위로 정사영한 스칼라 위치(축 시작점 기준 거리, 부호 포함).
 *  z 가 있으면 3D 정사영 → 고개 끄덕임(pitch)·돌림(yaw)으로 생기는 단축을 복원.
 *  z 가 모두 없으면(uz=0) 정확히 2D 정사영으로 환원된다. */
function projectOnAxis(p: Point, origin: Point, ux: number, uy: number, uz: number): number {
  return (p.x - origin.x) * ux + (p.y - origin.y) * uy + (zOf(p) - zOf(origin)) * uz;
}

export function computeFaceProportion(pts: FaceProportionPoints): FaceProportionResult {
  // 얼굴 세로축: 트리키온 → 턱끝 (3D 단위벡터; z 없으면 2D로 자동 환원)
  const ax = pts.menton.x - pts.trichion.x;
  const ay = pts.menton.y - pts.trichion.y;
  const az = zOf(pts.menton) - zOf(pts.trichion);
  const axisLen = Math.hypot(ax, ay, az) || 1e-9;
  const ux = ax / axisLen;
  const uy = ay / axisLen;
  const uz = az / axisLen;

  // 각 경계점을 세로축에 정사영(트리키온=0, 턱끝=axisLen 근사)
  const tGla = projectOnAxis(pts.glabella, pts.trichion, ux, uy, uz);
  const tSub = projectOnAxis(pts.subnasale, pts.trichion, ux, uy, uz);
  const tMen = projectOnAxis(pts.menton, pts.trichion, ux, uy, uz);

  // 부위별 길이(정사영 차) → share(합=1). 음수 방지(랜드마크 역전 케이스).
  const upperLen = Math.max(0, tGla);
  const middleLen = Math.max(0, tSub - tGla);
  const lowerLen = Math.max(0, tMen - tSub);
  const sum = upperLen + middleLen + lowerLen || 1e-9;

  const upper = upperLen / sum;
  const middle = middleLen / sum;
  const lower = lowerLen / sum;

  const ideal = PROP.idealShare.value; // 1/3
  const deviation = {
    upper: upper - ideal,
    middle: middle - ideal,
    lower: lower - ideal,
  };

  // 표시용: 이상=1.00 기준 (share × 3)
  const ratio = { upper: upper * 3, middle: middle * 3, lower: lower * 3 };
  const ratioStr = `${ratio.upper.toFixed(2)} : ${ratio.middle.toFixed(2)} : ${ratio.lower.toFixed(2)}`;

  // 균형 점수: (최장-최단) share 차 → [0,1]
  const spread = Math.max(upper, middle, lower) - Math.min(upper, middle, lower);
  const balanceScore = Math.max(0, Math.min(1, 1 - spread / PROP.balanceSpreadScale.value));

  // 두드러진 부위: 이상보다 가장 많이 '긴' 부위(편차 최대). tol 미만이면 균형.
  const tol = PROP.dominantTol.value;
  const devEntries: [DominantRegion, number][] = [
    ["상안", deviation.upper],
    ["중안", deviation.middle],
    ["하안", deviation.lower],
  ];
  const top = devEntries.reduce((a, b) => (b[1] > a[1] ? b : a));
  const dominant: DominantRegion = top[1] >= tol ? top[0] : "균형";

  // cute↔mature: 하안부 편차 하나로 1:1:1에 직접 묶음(가중치 없음).
  //  하안 짧음(dev<0) = 동안(cute), 하안 김(dev>0) = 성숙(mature).
  //  불안정한 상안(헤어라인)을 안 써서 더 robust. 0.5=이상(1/3).
  const cuteMature = Math.max(0, Math.min(1, 0.5 + deviation.lower / (2 * PROP.cuteMatureScale.value)));
  const cuteMatureLabel: CuteMatureLabel =
    deviation.lower < -tol ? "cute" : deviation.lower > tol ? "mature" : "mid";

  return {
    upper, middle, lower,
    deviation, ratio, ratioStr,
    balanceScore, dominant,
    cuteMature, cuteMatureLabel,
  };
}
