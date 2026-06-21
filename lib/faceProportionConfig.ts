/**
 * faceProportionConfig.ts — 세로 3분할(상/중/하안) 비율 임계·가중치의 단일 진입점.
 *
 * config.ts 가 frozen(절대 수정 금지)이므로, 세로비율 전용 보정값은 여기 둔다.
 * config.ts 와 동일한 Threshold<T> + status 컨벤션을 따른다.
 *
 * 설계 메모(2026-06): 대표 지표는 "상:중:하 = 1:1:1 기준 이탈도".
 *   백분위/인구 norm 은 쓰지 않는다(요구사항). 각 부위 share(합=1)를 이상치
 *   1/3 과 비교해 균형 점수와 두드러진 부위를 낸다. cute↔mature 는 3분할에서
 *   파생되는 보조 축(별도 측정 아님).
 *
 * status:
 *   ESTABLISHED = 측정 표준/고전 canon 근거
 *   PROVISIONAL = 시작값. 모델 표본으로 재보정 대상.
 */
import type { CalStatus } from "./config";

interface Threshold<T = number> {
  value: T;
  status: CalStatus;
  source: string;
}
const T = <T,>(value: T, status: CalStatus, source: string): Threshold<T> => ({ value, status, source });

export const PROP = {
  /** 이상 비율: 상:중:하 = 1:1:1 → 각 부위 share = 1/3 (고전 facial thirds canon). 절대 기준. */
  idealShare: T(1 / 3, "ESTABLISHED", "고전 안면 3등분 canon (상:중:하 = 1:1:1)"),

  /** 균형 점수 '표시 배율'(절대 기준 아님). (최장-최단) share 차가 이 값이면 balanceScore=0.
   *  0.22 ≈ 한 부위가 다른 부위보다 얼굴길이의 22%p 길면 0%로 보이게 하는 막대 스케일. */
  balanceSpreadScale: T(0.22, "PROVISIONAL", "균형% 표시 배율(무엇을 재는지 안 바꿈). 모델 표본 재보정 대상"),

  /** 1:1:1에서 '눈에 띄게 벗어났다'고 볼 편차 폭. |share-1/3| 가 이 값 미만이면 '균형'.
   *  '긴 부위' 판정과 cute/mid/mature 라벨에 공통으로 쓰는 단일 기준. */
  dominantTol: T(0.04, "PROVISIONAL", "1:1:1 이탈 notable 폭(±4%p). 긴 부위·cute/mature 라벨 공통"),

  /** cute↔mature 축 '표시 배율'(가중치 아님). 하안 편차가 이 값이면 축 끝(mature=1).
   *  축 정의는 하안부 편차 하나로 1:1:1에 직접 묶임 — 하안 짧음=cute, 김=mature. */
  cuteMatureScale: T(0.12, "PROVISIONAL", "cute↔mature 축 표시 배율. 하안 편차→축 위치 매핑"),
} as const;
