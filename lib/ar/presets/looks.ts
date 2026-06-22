/**
 * looks.ts — faceShape + 인상 → 추천 메이크업/헤어 프리셋.
 *
 * makeup_color_logic.docx 처방을 라이브 거울 파라미터(색·불투명도)로 매핑.
 * MirrorEngine.setParams 입력 형태로 변환.
 */
import type { FaceShape } from "@/lib/faceShape";
import type { MirrorParams } from "@/lib/ar/mirror/mirrorEngine";

export interface LookPreset {
  id: string;
  name: string;
  desc: string;
  /** MirrorParams 부분 — 색·알파 */
  params: {
    lip: { color: [number, number, number]; alpha: number };
    cheek: { color: [number, number, number]; alpha: number };
    hair: { color: [number, number, number]; alpha: number };
  };
}

// hex → [r,g,b] 0-1
function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/* 공통 프리셋 — 모든 얼굴형에서 선택 가능 */
export const COMMON_LOOKS: LookPreset[] = [
  {
    id: "daily",
    name: "데일리",
    desc: "자연스러운 코랄·로즈. 가벼운 혈색.",
    params: {
      lip: { color: rgb("#e8736a"), alpha: 0.35 },
      cheek: { color: rgb("#f2a09a"), alpha: 0.18 },
      hair: { color: rgb("#4a3228"), alpha: 0.35 },
    },
  },
  {
    id: "glossy",
    name: "글로시",
    desc: "선명한 레드·핑크. 또렷한 포인트.",
    params: {
      lip: { color: rgb("#c8203c"), alpha: 0.5 },
      cheek: { color: rgb("#f08a92"), alpha: 0.22 },
      hair: { color: rgb("#5a2a2a"), alpha: 0.4 },
    },
  },
  {
    id: "mute",
    name: "뮤트",
    desc: "차분한 brick·누드. 부드러운 무드.",
    params: {
      lip: { color: rgb("#a85a4a"), alpha: 0.4 },
      cheek: { color: rgb("#c98a7a"), alpha: 0.18 },
      hair: { color: rgb("#3d2a20"), alpha: 0.35 },
    },
  },
];

/* 얼굴형별 강조 톤 (makeup_color_logic 표 2 인상 방향) */
const FACE_ACCENT: Record<FaceShape, { hint: string; lipBoost: number }> = {
  둥근형: { hint: "또렷한 포인트로 윤곽 정돈", lipBoost: 0.05 },
  사각형: { hint: "부드러운 곡선 블러셔 권장", lipBoost: 0 },
  장방형: { hint: "가로 블러셔로 길이 완화", lipBoost: 0 },
  역삼각형: { hint: "하관에 혈색 더해 균형", lipBoost: 0.05 },
  계란형: { hint: "균형형 — 대부분 잘 어울림", lipBoost: 0 },
  마름모형: { hint: "광대 밖 옅은 블러셔", lipBoost: 0 },
};

/** 얼굴형에 맞춘 프리셋 목록 (공통 + 얼굴형 힌트 적용) */
export function looksForFace(faceShape: FaceShape): { presets: LookPreset[]; hint: string } {
  const accent = FACE_ACCENT[faceShape];
  // 얼굴형별 립 강조 약간 반영
  const presets = COMMON_LOOKS.map((p) => ({
    ...p,
    params: {
      ...p.params,
      lip: { ...p.params.lip, alpha: Math.min(1, p.params.lip.alpha + accent.lipBoost) },
    },
  }));
  return { presets, hint: accent.hint };
}

/** LookPreset → MirrorParams 부분 변환 (enabled 포함) */
export function presetToParams(preset: LookPreset): Partial<MirrorParams> {
  return {
    lip: { ...preset.params.lip, enabled: true },
    cheek: { ...preset.params.cheek, enabled: true },
    hair: { ...preset.params.hair, enabled: true },
  };
}
