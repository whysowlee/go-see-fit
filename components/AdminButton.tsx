"use client";

/**
 * AdminButton — 개발/테스트용 빠른 채우기
 *
 * 우측 상단 작은 버튼. 누르면 public/sample 의 예시 사진 3장(얼굴/전신정면/전신측면)을
 * 브라우저에서 fetch → 크롭(전체 선택) → store 에 채우고, 신체 정보까지 입력한 뒤
 * /upload 로 이동한다. 사진은 서버로 전송되지 않고 브라우저 안에서만 처리된다.
 *
 * 파일명 규칙: 키_가슴_허리_엉덩이_발  →  176_32_23_33_245
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useApp, type Photos, type PhotoSlot } from "@/lib/store";
import { cropImage, FACE_ASPECT, BODY_ASPECT } from "@/components/ImageCropper";

const SAMPLES = [
  { key: "face", aspect: FACE_ASPECT, src: "/sample/face.png" },
  { key: "bodyFront", aspect: BODY_ASPECT, src: "/sample/body-front.png" },
  { key: "bodySide", aspect: BODY_ASPECT, src: "/sample/body-side.png" },
] as const;

const SAMPLE_INPUTS = { heightCm: 176, bustIn: 32, waistIn: 23, hipIn: 33, footSize: 245 };

function measure(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.src = url;
  });
}

async function buildSlot(src: string, aspect: number): Promise<PhotoSlot> {
  const res = await fetch(src);
  const blob = await res.blob();
  const file = new File([blob], src.split("/").pop() ?? "sample.png", { type: blob.type || "image/png" });
  const url = URL.createObjectURL(file);
  const { width, height } = await measure(url);
  const cropRect = { x: 0, y: 0, w: 1, h: 1 }; // 전체 선택과 동일
  const croppedUrl = await cropImage(url, aspect, cropRect);
  const { width: croppedWidth, height: croppedHeight } = await measure(croppedUrl);
  return { file, url, width, height, cropRect, croppedUrl, croppedWidth, croppedHeight };
}

export default function AdminButton() {
  const router = useRouter();
  const { state, dispatch } = useApp();
  const [loading, setLoading] = useState(false);

  const run = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const [face, bodyFront, bodySide] = await Promise.all(
        SAMPLES.map((s) => buildSlot(s.src, s.aspect)),
      );
      const photos: Photos = { face, bodyFront, bodySide };
      dispatch({ type: "SET_SEX", sex: state.sex ?? "female" });
      dispatch({ type: "SET_BODY_INPUTS", inputs: { ...SAMPLE_INPUTS } });
      dispatch({ type: "SET_PHOTOS", photos });
      router.push("/upload");
    } catch (e) {
      console.error("[관리자 모드] 예시 불러오기 실패", e);
      setLoading(false);
    }
  };

  return (
    <button
      onClick={run}
      disabled={loading}
      title="예시 사진으로 업로드 단계 자동 완료"
      style={{
        position: "fixed",
        top: 10,
        right: 10,
        zIndex: 1000,
        padding: "5px 10px",
        fontSize: 11,
        fontWeight: 600,
        color: "#6B829A",
        background: "rgba(255,255,255,0.9)",
        border: "1px solid #d8dde4",
        borderRadius: 6,
        cursor: loading ? "wait" : "pointer",
        backdropFilter: "blur(4px)",
        boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
      }}
    >
      {loading ? "불러오는 중…" : "관리자 모드"}
    </button>
  );
}
