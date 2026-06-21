"use client";

import { useRouter } from "next/navigation";
import { useApp, type CropRect, type PhotoSlot } from "@/lib/store";
import { useState, useCallback, useRef, type DragEvent, type ChangeEvent } from "react";
import ImageCropper, { cropImage, FACE_ASPECT, BODY_ASPECT } from "@/components/ImageCropper";

interface RawPhoto { file: File | null; url: string; width: number; height: number }
interface CropState { rect: CropRect | null; croppedUrl: string; croppedW: number; croppedH: number }

const SLOTS = [
  { key: "face" as const, label: "얼굴 정면", desc: "정면을 바라보는 얼굴 사진", aspect: FACE_ASPECT },
  { key: "bodyFront" as const, label: "전신 정면", desc: "팔을 내리고 정면을 바라보는 전신", aspect: BODY_ASPECT },
  { key: "bodySide" as const, label: "전신 측면", desc: "옆에서 촬영한 전신", aspect: BODY_ASPECT },
] as const;
type SlotKey = (typeof SLOTS)[number]["key"];

function loadImage(file: File): Promise<RawPhoto> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ file, url, width: img.naturalWidth, height: img.naturalHeight });
    img.src = url;
  });
}

export default function UploadPage() {
  const router = useRouter();
  const { state, dispatch } = useApp();

  // store 에 이미 사진이 있으면(예: 관리자 모드 자동 채우기, 또는 뒤로가기) 그 상태로 복원한다.
  const [photos, setPhotos] = useState<Record<SlotKey, RawPhoto>>(() => {
    const p = state.photos;
    const mk = (s?: PhotoSlot): RawPhoto =>
      s ? { file: s.file, url: s.url, width: s.width, height: s.height } : { file: null, url: "", width: 0, height: 0 };
    return { face: mk(p?.face), bodyFront: mk(p?.bodyFront), bodySide: mk(p?.bodySide) };
  });
  const [crops, setCrops] = useState<Record<SlotKey, CropState>>(() => {
    const p = state.photos;
    const mk = (s?: PhotoSlot): CropState =>
      s?.croppedUrl
        ? { rect: s.cropRect ?? null, croppedUrl: s.croppedUrl, croppedW: s.croppedWidth ?? 0, croppedH: s.croppedHeight ?? 0 }
        : { rect: null, croppedUrl: "", croppedW: 0, croppedH: 0 };
    return { face: mk(p?.face), bodyFront: mk(p?.bodyFront), bodySide: mk(p?.bodySide) };
  });
  const [activeSlot, setActiveSlot] = useState<SlotKey | null>(null);

  const [heightCm, setHeightCm] = useState(state.bodyInputs.heightCm?.toString() ?? "");
  const [bustIn, setBustIn] = useState(state.bodyInputs.bustIn?.toString() ?? "");
  const [waistIn, setWaistIn] = useState(state.bodyInputs.waistIn?.toString() ?? "");
  const [hipIn, setHipIn] = useState(state.bodyInputs.hipIn?.toString() ?? "");
  const [footSize, setFootSize] = useState(state.bodyInputs.footSize?.toString() ?? "");
  const fileRefs = useRef<Record<SlotKey, HTMLInputElement | null>>({ face: null, bodyFront: null, bodySide: null });

  const handleFile = useCallback(async (key: SlotKey, file: File) => {
    if (!file.type.startsWith("image/")) return;
    if (photos[key].url) URL.revokeObjectURL(photos[key].url);
    const slot = await loadImage(file);
    setPhotos((p) => ({ ...p, [key]: slot }));
    setCrops((p) => ({ ...p, [key]: { rect: null, croppedUrl: "", croppedW: 0, croppedH: 0 } }));
    setActiveSlot(key);
  }, [photos]);

  const onDrop = useCallback((key: SlotKey) => (e: DragEvent) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(key, f); }, [handleFile]);
  const onFileChange = useCallback((key: SlotKey) => (e: ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (f) handleFile(key, f); }, [handleFile]);

  const confirmCrop = useCallback(async (key: SlotKey) => {
    const photo = photos[key]; const crop = crops[key];
    if (!photo.file || !crop.rect) return;
    const aspect = SLOTS.find((s) => s.key === key)!.aspect;
    const croppedUrl = await cropImage(photo.url, aspect, crop.rect);
    const img = new Image(); img.src = croppedUrl;
    await new Promise((r) => { img.onload = r; });
    setCrops((p) => ({ ...p, [key]: { ...p[key], croppedUrl, croppedW: img.naturalWidth, croppedH: img.naturalHeight } }));
    setActiveSlot(null);
  }, [photos, crops]);

  const allPhotos = photos.face.file && photos.bodyFront.file && photos.bodySide.file;
  const allCropped = crops.face.croppedUrl && crops.bodyFront.croppedUrl && crops.bodySide.croppedUrl;
  const hasRequired = allCropped && heightCm && bustIn && waistIn && hipIn;

  const proceed = () => {
    if (!allPhotos || !allCropped) return;
    const mk = (key: SlotKey) => ({
      file: photos[key].file!, url: photos[key].url, width: photos[key].width, height: photos[key].height,
      cropRect: crops[key].rect!, croppedUrl: crops[key].croppedUrl, croppedWidth: crops[key].croppedW, croppedHeight: crops[key].croppedH,
    });
    dispatch({ type: "SET_PHOTOS", photos: { face: mk("face"), bodyFront: mk("bodyFront"), bodySide: mk("bodySide") } });
    dispatch({ type: "SET_BODY_INPUTS", inputs: { heightCm: parseFloat(heightCm) || null, bustIn: parseFloat(bustIn) || null, waistIn: parseFloat(waistIn) || null, hipIn: parseFloat(hipIn) || null, footSize: parseFloat(footSize) || null } });
    router.push("/landmarks");
  };

  if (!state.sex) { router.push("/"); return null; }

  return (
    <div style={{ minHeight: "100vh", background: "var(--white)", color: "var(--black)" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "24px 16px" }}>
        <button onClick={() => router.push("/")} style={{ color: "var(--ash)", fontSize: 14, background: "none", border: "none", cursor: "pointer" }}>&larr; 성별 선택</button>
        <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 24, fontWeight: 700, margin: "8px 0 4px", color: "var(--indigo)" }}>사진 & 신체 정보</h1>
        <p style={{ fontSize: 13, color: "var(--gray)", margin: "0 0 20px" }}>사진은 브라우저에서만 처리됩니다. 서버로 전송되지 않습니다.</p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
          {SLOTS.map(({ key, label, desc, aspect }) => (
            <div key={key}>
              <p style={{ fontSize: 13, fontWeight: 600, color: "var(--black)", marginBottom: 6 }}>{label}</p>
              <div onDragOver={(e) => e.preventDefault()} onDrop={onDrop(key)}
                onClick={() => !photos[key].file ? fileRefs.current[key]?.click() : setActiveSlot(key)}
                style={{ aspectRatio: `${aspect}`, borderRadius: 8, border: "2px dashed", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", borderColor: crops[key].croppedUrl ? "var(--indigo)" : "var(--ash)", background: crops[key].croppedUrl ? "var(--white)" : "#f8f8f8" }}>
                {crops[key].croppedUrl ? (
                  <img src={crops[key].croppedUrl} alt={label} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                ) : photos[key].url ? (
                  <img src={photos[key].url} alt={label} style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.5 }} />
                ) : (
                  <div style={{ textAlign: "center", padding: 8 }}><p style={{ fontSize: 24, color: "var(--ash)" }}>+</p><p style={{ fontSize: 11, color: "var(--gray)" }}>{desc}</p></div>
                )}
                <input ref={(el) => { fileRefs.current[key] = el; }} type="file" accept="image/*" onChange={onFileChange(key)} style={{ display: "none" }} />
              </div>
              {photos[key].file && !crops[key].croppedUrl && (
                <button onClick={() => setActiveSlot(key)} style={{ width: "100%", marginTop: 4, padding: "6px 0", fontSize: 12, fontWeight: 600, color: "var(--indigo)", background: "none", border: "1px solid var(--indigo)", borderRadius: 6, cursor: "pointer" }}>영역 맞추기</button>
              )}
              {crops[key].croppedUrl && <p style={{ fontSize: 10, color: "var(--gray)", marginTop: 4, textAlign: "center" }}>확정됨 · 클릭하여 재조정</p>}
            </div>
          ))}
        </div>

        {activeSlot && photos[activeSlot].url && (
          <div style={{ marginBottom: 20, padding: 16, border: "1px solid var(--ash)", borderRadius: 10, background: "#fafafa" }}>
            <ImageCropper title={`${SLOTS.find((s) => s.key === activeSlot)!.label} — 영역 맞추기`}
              imageUrl={photos[activeSlot].url} aspect={SLOTS.find((s) => s.key === activeSlot)!.aspect}
              value={crops[activeSlot].rect ?? undefined}
              onChange={(rect) => setCrops((p) => ({ ...p, [activeSlot!]: { ...p[activeSlot!], rect } }))}
              onReplace={() => { fileRefs.current[activeSlot!]?.click(); }} />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 10 }}>
              <button onClick={() => setActiveSlot(null)} style={{ padding: "8px 14px", borderRadius: 6, border: "1px solid var(--ash)", background: "var(--white)", color: "var(--ash)", fontSize: 13, cursor: "pointer" }}>취소</button>
              <button onClick={() => confirmCrop(activeSlot)} style={{ padding: "8px 14px", borderRadius: 6, border: "none", background: "var(--black)", color: "var(--white)", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>확정</button>
            </div>
          </div>
        )}

        <div style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: "var(--indigo)", marginBottom: 10 }}>신체 정보</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10 }}>
            {[
              { label: "키 (cm) *", val: heightCm, set: setHeightCm, ph: "165", step: "1" },
              { label: "가슴둘레 (in) *", val: bustIn, set: setBustIn, ph: "33", step: "0.5" },
              { label: "허리둘레 (in) *", val: waistIn, set: setWaistIn, ph: "26", step: "0.5" },
              { label: "엉덩이 (in) *", val: hipIn, set: setHipIn, ph: "36", step: "0.5" },
              { label: "발 (mm)", val: footSize, set: setFootSize, ph: "245", step: "5" },
            ].map(({ label, val, set, ph, step }) => (
              <label key={label} style={{ display: "block", fontSize: 11 }}>
                <span style={{ color: "var(--black)", fontWeight: 600 }}>{label}</span>
                <input type="number" step={step} value={val} onChange={(e) => set(e.target.value)} placeholder={ph}
                  style={{ display: "block", width: "100%", marginTop: 3, padding: "6px 8px", border: "2px solid #ddd", borderRadius: 6, fontSize: 14, color: "var(--black)", fontWeight: 500, background: "var(--white)" }} />
              </label>
            ))}
          </div>
          <p style={{ fontSize: 11, color: "var(--gray)", marginTop: 6 }}>* 필수 입력. 발 사이즈는 선택.</p>
        </div>

        <div style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: "var(--indigo)", marginBottom: 10 }}>퍼스널컬러 <span style={{ fontWeight: 400, color: "var(--gray)" }}>(선택 — 메이크업·트렌드 추천 정확도 ↑)</span></h2>
          <select
            value={state.personalColor}
            onChange={(e) => dispatch({ type: "SET_PERSONAL_COLOR", personalColor: e.target.value as typeof state.personalColor })}
            style={{ display: "block", width: "100%", padding: "8px 10px", border: "2px solid #ddd", borderRadius: 6, fontSize: 14, color: "var(--black)", fontWeight: 500, background: "var(--white)" }}
          >
            <option value="unknown">모름 (선택 안 함)</option>
            <option value="summer">여름 쿨 — 핑크빛, 부드러운 인상 (한국인 다수)</option>
            <option value="winter">겨울 쿨 — 블루빛, 대비 뚜렷</option>
            <option value="autumn">가을 웜 — 황갈빛, 차분</option>
            <option value="spring">봄 웜 — 노란빛, 화사</option>
          </select>
          <p style={{ fontSize: 11, color: "var(--gray)", marginTop: 6 }}>
            확실하지 않으면 &quot;모름&quot; 선택 — 색 추천은 일반 가이드로 제공됩니다.
          </p>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button onClick={proceed} disabled={!hasRequired}
            style={{ padding: "12px 24px", borderRadius: 8, border: "none", background: "var(--black)", color: "var(--white)", fontSize: 14, fontWeight: 700, cursor: hasRequired ? "pointer" : "not-allowed", opacity: hasRequired ? 1 : 0.25 }}>
            랜드마크 보정 →
          </button>
        </div>
      </div>
    </div>
  );
}
