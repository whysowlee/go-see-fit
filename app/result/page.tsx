"use client";

import { useRouter } from "next/navigation";
import { useApp, VF_SESSION_LIMIT } from "@/lib/store";
import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { classifyFaceShape, computeTrust, type FaceShape } from "@/lib/faceShape";
import { classifySkeleton, classifyAxes, describe, type Skeleton } from "@/lib/bodyType";
import { extractBodyMeasurements } from "@/lib/mediapipe/bodyExtract";
import { FACE_IDX, FACE_IDX_EXTRA } from "@/lib/mediapipe/faceMap";
import { getStyleRecommendation, getFaceStyling, type StyleChip, type VFCategory } from "@/lib/recommend";
import { FaceShapeTab, ResultTabBar, type FaceResultData, type SoftScore, type DiagItem, type VFControlProps } from "@/components/ResultFaceTab";
import { BodyTypeTab, type BodyResultData, type BodyPoint } from "@/components/ResultBodyTab";

function vfCacheKey(kind: "face" | "body", labels: string[]): string {
  return `${kind}:${[...labels].sort().join("|")}`;
}

async function callVFAPI(payload: {
  kind: "face" | "body";
  imageDataUrl: string;
  chips: { label: string; category: VFCategory; prompt: string; imageUrl?: string }[];
  garmentImages?: string[];
}): Promise<{ imageDataUrl?: string; source?: string; errorMessage?: string }> {
  const res = await fetch("/api/virtual-fitting", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.json();
}

async function urlToDataUrl(url: string): Promise<string> {
  if (url.startsWith("data:")) return url;
  const r = await fetch(url);
  const blob = await r.blob();
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = reject;
    fr.readAsDataURL(blob);
  });
}

const C = { white: "#FFFFFF", black: "#000000", gray: "#8C8C8C", indigo: "#1C2331", ash: "#6B829A" } as const;

// 대칭 진단 임계값 (패션 촬영 맥락 기준, 문헌 참고)
// 4단계: 양호 → 경미한 비대칭 → 비대칭 → 심한 비대칭
function tiltBadge(abs: number, t1: number, t2: number, t3: number): string {
  if (abs < t1) return "양호";
  if (abs < t2) return "경미한 비대칭";
  if (abs < t3) return "비대칭";
  return "심한 비대칭";
}
function offsetBadge(v: number, t1: number, t2: number, t3: number): string {
  if (v < t1) return "양호";
  if (v < t2) return "경미한 비대칭";
  if (v < t3) return "비대칭";
  return "심한 비대칭";
}

// FACE_STYLING은 getFaceStyling(faceShape)으로 대체

// ── posing tip API helper ──

async function fetchPosingTip(
  kind: "face" | "body",
  measurements: Record<string, number | string | undefined>,
  classification: Record<string, unknown>,
): Promise<string> {
  try {
    const res = await fetch("/api/diagnose", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, measurements, classification }),
    });
    const data = await res.json();
    if (data.basis) console.log(`[diagnose/${kind}] basis:`, data.basis, "source:", data.source);
    return data.posingTip ?? "";
  } catch {
    return "";
  }
}

// ── tilt helper ──

function pairTilt(
  points: { id: string; x: number; y: number }[],
  idL: string,
  idR: string,
): { deg: number; abs: number; higher: string } {
  const pL = points.find((p) => p.id === idL);
  const pR = points.find((p) => p.id === idR);
  if (!pL || !pR) return { deg: 0, abs: 0, higher: "" };
  const dy = pR.y - pL.y;
  const dx = Math.abs(pR.x - pL.x) || 0.001;
  const deg = (Math.atan2(dy, dx) * 180) / Math.PI;
  return { deg, abs: Math.abs(deg), higher: deg > 0 ? "좌" : "우" };
}

export default function ResultPage() {
  const router = useRouter();
  const { state, dispatch } = useApp();
  const [tab, setTab] = useState<"face" | "body">("face");

  const lm = state.landmarks;
  const photos = state.photos;
  const bi = state.bodyInputs;
  const vf = state.vf;
  const sessionRemaining = Math.max(0, VF_SESSION_LIMIT - vf.sessionCount);

  // posing tip cache
  const [faceTip, setFaceTip] = useState<string | null>(null);
  const [bodyTip, setBodyTip] = useState<string | null>(null);
  const faceTipRequested = useRef(false);
  const bodyTipRequested = useRef(false);

  // ── face data ──
  const faceCalc = useMemo(() => {
    if (!lm || !photos) return null;
    const faceResult = classifyFaceShape(lm.faceMapped);
    const trust = computeTrust(lm.faceMapped, faceResult.metrics);

    const mesh = lm.faceMesh;
    const ov = lm.faceOverrides;
    const norm = (key: string, idx: number) => {
      const MAP: Record<string, string> = {
        foreheadTop: "foreheadCenterTop", menton: "menton",
        templeL: "foreheadL", templeR: "foreheadR",
        zygoL: "zygomaticL", zygoR: "zygomaticR",
        gonionL: "gonionL", gonionR: "gonionR",
        browInnerL: "browInnerL", browPeakL: "browMidL",
        sellion: "noseSellion", noseTip: "noseTip",
      };
      const fk = MAP[key];
      if (fk && ov[fk as keyof typeof ov]) {
        const o = ov[fk as keyof typeof ov]!;
        const fw = photos.face.croppedWidth || photos.face.width;
        const fh = photos.face.croppedHeight || photos.face.height;
        return { id: key, x: o.x / fw, y: o.y / fh };
      }
      return { id: key, x: mesh[idx].x, y: mesh[idx].y };
    };

    const points = [
      norm("foreheadTop", FACE_IDX.foreheadCenterTop), norm("menton", FACE_IDX.menton),
      norm("templeL", FACE_IDX.foreheadL), norm("templeR", FACE_IDX.foreheadR),
      norm("zygoL", FACE_IDX.zygomaticL), norm("zygoR", FACE_IDX.zygomaticR),
      norm("gonionL", FACE_IDX.gonionL), norm("gonionR", FACE_IDX.gonionR),
      norm("browInnerL", FACE_IDX.browInnerL), norm("browPeakL", FACE_IDX.browMidL),
      { id: "browInnerR", x: mesh[FACE_IDX_EXTRA.browInnerR].x, y: mesh[FACE_IDX_EXTRA.browInnerR].y },
      { id: "browPeakR", x: mesh[FACE_IDX_EXTRA.browPeakR].x, y: mesh[FACE_IDX_EXTRA.browPeakR].y },
      norm("sellion", FACE_IDX.noseSellion), norm("noseTip", FACE_IDX.noseTip),
    ];

    const sorted = (Object.entries(faceResult.scores) as [FaceShape, number][]).sort((a, b) => b[1] - a[1]);
    const soft: SoftScore[] = sorted.slice(0, 3).map(([label, score]) => ({ label, score }));
    const impression = 1 / (1 + Math.exp(-trust.score * 0.8));

    const brow = pairTilt(points, "browInnerL", "browInnerR");
    const zygo = pairTilt(points, "zygoL", "zygoR");
    const top = points.find((p) => p.id === "foreheadTop");
    const bottom = points.find((p) => p.id === "menton");
    const centerXDiff = top && bottom ? Math.abs(top.x - bottom.x) : 0;

    return { faceResult, trust, points, soft, impression, brow, zygo, centerXDiff, top, bottom };
  }, [lm, photos]);

  const doFetchFaceTip = useCallback(() => {
    if (!faceCalc) return;
    const { brow, zygo, centerXDiff, faceResult, trust } = faceCalc;
    const m = faceResult.metrics;
    fetchPosingTip("face", {
      browTiltDeg: +brow.deg.toFixed(1),
      browHigherSide: brow.higher,
      cheekTiltDeg: +zygo.deg.toFixed(1),
      cheekHigherSide: zygo.higher,
      centerOffsetX: +centerXDiff.toFixed(3),
      AR: +m.AR.toFixed(2), F: +m.F.toFixed(2), J: +m.J.toFixed(2), T: +m.T.toFixed(2),
      jawAngle: +m.jawAngle.toFixed(1),
    }, {
      faceShape: faceResult.primary,
      faceShapeScores: Object.fromEntries(Object.entries(faceResult.scores).slice(0, 3)),
      impression: trust.label,
    }).then((tip) => { if (tip) setFaceTip(tip); });
  }, [faceCalc]);

  useEffect(() => {
    if (!faceCalc || faceTipRequested.current) return;
    faceTipRequested.current = true;
    doFetchFaceTip();
  }, [faceCalc, doFetchFaceTip]);

  const faceData: FaceResultData | null = useMemo(() => {
    if (!faceCalc || !photos) return null;
    const { points, soft, impression, brow, zygo, centerXDiff, top, bottom, faceResult } = faceCalc;

    const diagnosis: DiagItem[] = [
      {
        name: "눈썹 라인",
        value: brow.abs < 1 ? "좌우 균형" : `${brow.higher}측이 약 ${brow.abs.toFixed(1)}° 높음`,
        badge: tiltBadge(brow.abs, 1, 4, 7),
      },
      {
        name: "광대 라인",
        value: zygo.abs < 1 ? "좌우 균형" : `${zygo.higher}측이 약 ${zygo.abs.toFixed(1)}° 높음`,
        badge: tiltBadge(zygo.abs, 1, 4, 6),
      },
      {
        name: "중심축",
        value: centerXDiff < 0.01 ? "이마·턱 수직 정렬" : `중심이 ${centerXDiff < 0.03 ? "약간" : "다소"} ${top && bottom && top.x > bottom.x ? "좌측" : "우측"} 편향`,
        badge: offsetBadge(centerXDiff, 0.01, 0.04, 0.07),
      },
    ];

    return {
      photoUrl: photos.face.croppedUrl || photos.face.url,
      fittingUrl: vf.face.imageDataUrl ?? undefined,
      points, soft, impression, diagnosis,
      posingTip: faceTip ?? "포징 팁 생성 중…",
      styling: getFaceStyling(faceResult.primary),
    };
  }, [faceCalc, photos, faceTip, vf.face.imageDataUrl]);

  // ── body data ──
  const bodyCalc = useMemo(() => {
    if (!lm || !photos || !state.sex) return null;
    const extract = extractBodyMeasurements(lm.frontPose, {
      frontDims: { width: photos.bodyFront.croppedWidth || photos.bodyFront.width, height: photos.bodyFront.croppedHeight || photos.bodyFront.height },
      sideDepths: lm.sideDepths,
      heightCm: bi.heightCm ?? undefined,
      bustIn: bi.bustIn ?? undefined,
      waistIn: bi.waistIn ?? undefined,
      hipIn: bi.hipIn ?? undefined,
      frontOverrides: lm.frontOverrides,
    });
    const skel = classifySkeleton(extract.measurements, state.sex, extract.sideAvailable);
    const axes = classifyAxes(extract.measurements, state.sex);

    const pose = lm.frontPose;
    const foMap = lm.frontOverrides;
    const W = photos.bodyFront.croppedWidth || photos.bodyFront.width;
    const H = photos.bodyFront.croppedHeight || photos.bodyFront.height;
    const bp = (id: string, idx: number): BodyPoint => {
      if (foMap[idx]) return { id, x: foMap[idx].x / W, y: foMap[idx].y / H };
      return { id, x: pose[idx].x, y: pose[idx].y };
    };
    const shMid = { x: (pose[11].x + pose[12].x) / 2, y: (pose[11].y + pose[12].y) / 2 };
    const hipMid = { x: (pose[23].x + pose[24].x) / 2, y: (pose[23].y + pose[24].y) / 2 };
    const eyeMidY = (pose[2].y + pose[5].y) / 2;
    const nte = Math.abs(pose[0].y - eyeMidY);
    const crownY = nte > 0.003 ? eyeMidY - nte * 3 : pose[0].y - (shMid.y - pose[0].y) * 0.9;
    const soleY = Math.max(pose[29].y, pose[30].y, pose[31].y, pose[32].y);

    const heelLY = pose[29].y;
    const heelRY = pose[30].y;
    const points: BodyPoint[] = [
      { id: "crown", x: shMid.x, y: crownY },
      bp("heelL", 29), bp("heelR", 30),
      { id: "sole", x: shMid.x, y: (heelLY + heelRY) / 2 },
      bp("acromionL", 11), bp("acromionR", 12),
      { id: "neckBaseL", x: (pose[7].x + pose[11].x) / 2, y: (pose[7].y + pose[11].y) / 2 },
      { id: "neckBaseR", x: (pose[8].x + pose[12].x) / 2, y: (pose[8].y + pose[12].y) / 2 },
      bp("neckL", 7), bp("neckR", 8),
      { id: "chestL", x: shMid.x + Math.abs(pose[11].x - pose[12].x) * 0.45, y: shMid.y + (hipMid.y - shMid.y) * 0.25 },
      { id: "chestR", x: shMid.x - Math.abs(pose[11].x - pose[12].x) * 0.45, y: shMid.y + (hipMid.y - shMid.y) * 0.25 },
      { id: "waistL", x: hipMid.x + Math.abs(pose[23].x - pose[24].x) * 0.7, y: shMid.y + (hipMid.y - shMid.y) * 0.45 },
      { id: "waistR", x: hipMid.x - Math.abs(pose[23].x - pose[24].x) * 0.7, y: shMid.y + (hipMid.y - shMid.y) * 0.45 },
      bp("hipL", 23), bp("hipR", 24),
      bp("elbowL", 13), bp("elbowR", 14),
      bp("kneeL", 25), bp("kneeR", 26),
      { id: "crotch", x: hipMid.x, y: hipMid.y + (hipMid.y - shMid.y) * 0.08 },
    ];

    const soft = (Object.entries(skel.scores) as [Skeleton, number][]).sort((a, b) => b[1] - a[1]).map(([label, score]) => ({ label, score }));
    const detail = { silhouette: axes.silhouette, proportion: axes.ratio, frame: axes.frame };
    const sh = pairTilt(points, "acromionL", "acromionR");
    const hip = pairTilt(points, "hipL", "hipR");
    const crown = points.find((p) => p.id === "crown")!;
    const sole = points.find((p) => p.id === "sole")!;
    const centerDrift = Math.abs(crown.x - sole.x);

    return { extract, skel, axes, points, soft, detail, sh, hip, centerDrift };
  }, [lm, photos, state.sex, bi]);

  // fetch body posing tip
  const doFetchBodyTip = useCallback(() => {
    if (!bodyCalc || !state.sex) return;
    const { sh, hip, centerDrift, skel, axes } = bodyCalc;
    const em = bodyCalc.extract?.measurements;
    const round = (v: number) => +v.toFixed(3);
    fetchPosingTip("body", {
      ...(em ? {
        shoulderSlopeDeg: round(em.shoulderSlopeDeg),
        jointWidthIndex: round(em.jointWidthIndex),
        whtr: round(em.whtr),
        thoraxFlat: round(em.thoraxFlat),
        bhr: round(em.bhr),
        bustHeight: round(em.bustHeight),
        waistPos: round(em.waistPos),
        shoulderHipRatio: round(em.shoulderHipRatio),
        chestMinusWaist_cm: round(em.chestMinusWaist_cm),
        sittingHeightRatio: round(em.sittingHeightRatio),
        shoulderHeightRatio: round(em.shoulderHeightRatio),
        neckIndexLow: em.neckIndexLow ? 1 : 0,
      } : {}),
      shoulderTiltDeg: round(sh.deg),
      shoulderHigherSide: sh.higher,
      pelvisTiltDeg: round(hip.deg),
      pelvisHigherSide: hip.higher,
      centerOffset: round(centerDrift),
      frameRatio: em ? round(em.shoulderHeightRatio) : undefined,
    }, {
      skeleton: skel.type,
      skeletonScores: Object.fromEntries(Object.entries(skel.scores)),
      axes: { silhouette: axes.silhouette, proportion: axes.ratio, frame: axes.frame },
    }).then((tip) => { if (tip) setBodyTip(tip); });
  }, [bodyCalc, state.sex]);

  useEffect(() => {
    if (!bodyCalc || bodyTipRequested.current || !state.sex) return;
    bodyTipRequested.current = true;
    doFetchBodyTip();
  }, [bodyCalc, state.sex, doFetchBodyTip]);

  const bodyData: BodyResultData | null = useMemo(() => {
    if (!bodyCalc || !photos || !state.sex) return null;
    const { points, soft, detail, sh, hip, centerDrift, skel, axes } = bodyCalc;

    const diagnosis: DiagItem[] = [
      {
        name: "어깨 라인",
        value: sh.abs < 1 ? "좌우 수평" : `${sh.higher}측이 약 ${sh.abs.toFixed(1)}° 높음`,
        badge: tiltBadge(sh.abs, 1, 4, 7),
      },
      {
        name: "골반 라인",
        value: hip.abs < 1 ? "좌우 수평" : `${hip.higher}측이 약 ${hip.abs.toFixed(1)}° 높음`,
        badge: tiltBadge(hip.abs, 1, 4, 6),
      },
      {
        name: "중심축",
        value: centerDrift < 0.01 ? "정수리→발 중심 일직선" : `편차 있음 — ${centerDrift < 0.03 ? "약간" : "다소"} 편향`,
        badge: offsetBadge(centerDrift, 0.01, 0.04, 0.08),
      },
    ];

    const styleRec = getStyleRecommendation({
      skeleton: skel.type,
      silhouette: axes.silhouette,
      proportion: axes.ratio,
      frame: axes.frame,
      sex: state.sex,
    });

    return {
      photoUrl: photos.bodyFront.croppedUrl || photos.bodyFront.url,
      fittingUrl: vf.body.imageDataUrl ?? undefined,
      points, soft, detail, diagnosis,
      posingTip: bodyTip ?? "포징 팁 생성 중…",
      recommend: styleRec.recommend, avoid: styleRec.avoid, selectedDefault: styleRec.selectedDefault,
    };
  }, [bodyCalc, photos, state.sex, bodyTip, vf.body.imageDataUrl]);

  // ── VF wiring ──
  // 이름→칩 매핑 (현재 탭의 추천+비추천 전체에서 검색)
  const faceChipPool: StyleChip[] = useMemo(
    () => (faceData ? [...faceData.styling.recommend, ...faceData.styling.avoid] : []),
    [faceData],
  );
  const bodyChipPool: StyleChip[] = useMemo(
    () => (bodyData ? [...bodyData.recommend, ...bodyData.avoid] : []),
    [bodyData],
  );

  const handleSelectChange = useCallback((kind: "face" | "body", labels: string[]) => {
    dispatch({ type: "VF_SET_SELECTED", kind, labels });
  }, [dispatch]);

  const doVFGenerate = useCallback(async (kind: "face" | "body") => {
    if (!photos) return;
    if (sessionRemaining <= 0) return;
    const cur = state.vf[kind];
    if (cur.status === "generating" || cur.status === "generated") return;

    const pool = kind === "face" ? faceChipPool : bodyChipPool;
    const want: VFCategory[] = kind === "face" ? ["hair", "makeup"] : ["garment"];
    const selectedChips = cur.selectedLabels
      .map((l) => pool.find((c) => c.label === l))
      .filter((c): c is StyleChip => !!c && !!c.category && want.includes(c.category));
    if (selectedChips.length === 0) return;

    const key = vfCacheKey(kind, cur.selectedLabels);
    const cached = state.vf.cache[key];
    if (cached) {
      dispatch({ type: "VF_SUCCESS", kind, labels: cur.selectedLabels, dataUrl: cached, cacheKey: key, fromCache: true });
      return;
    }

    dispatch({ type: "VF_START", kind });
    try {
      const photo = kind === "face" ? photos.face : photos.bodyFront;
      const sourceUrl = photo.croppedUrl || photo.url;
      const imageDataUrl = await urlToDataUrl(sourceUrl);

      const garmentImages: string[] = [];
      if (kind === "body") {
        for (const c of selectedChips) {
          if (c.imageUrl) {
            try { garmentImages.push(await urlToDataUrl(c.imageUrl)); } catch { /* skip */ }
          }
        }
      }

      const res = await callVFAPI({
        kind,
        imageDataUrl,
        chips: selectedChips.map((c) => ({ label: c.label, category: c.category!, prompt: c.prompt ?? c.label, imageUrl: c.imageUrl })),
        garmentImages,
      });

      // fallback(쿼터·키 없음 등)이면 세션 카운트는 차감하지 않고 에러로 표시
      if (res.source === "fallback") {
        dispatch({ type: "VF_ERROR", kind, message: res.errorMessage ?? "가상 피팅을 사용할 수 없습니다 (API 한도)" });
        return;
      }
      if (res.imageDataUrl) {
        dispatch({ type: "VF_SUCCESS", kind, labels: cur.selectedLabels, dataUrl: res.imageDataUrl, cacheKey: key, fromCache: false });
      } else {
        dispatch({ type: "VF_ERROR", kind, message: res.errorMessage ?? "이미지 응답 없음" });
      }
    } catch (e) {
      dispatch({ type: "VF_ERROR", kind, message: String(e).slice(0, 120) });
    }
  }, [photos, sessionRemaining, state.vf, dispatch, faceChipPool, bodyChipPool]);

  const buildVFControl = (kind: "face" | "body"): VFControlProps => {
    const cur = vf[kind];
    const pool = kind === "face" ? faceChipPool : bodyChipPool;
    const want: VFCategory[] = kind === "face" ? ["hair", "makeup"] : ["garment"];
    const eligible = cur.selectedLabels.some((l) => {
      const c = pool.find((p) => p.label === l);
      return !!c?.category && want.includes(c.category);
    });
    return {
      status: cur.status,
      sessionRemaining,
      hasSelection: eligible,
      errorMessage: cur.errorMessage,
      onGenerate: () => doVFGenerate(kind),
    };
  };

  if (!lm || !photos) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: C.white }}>
        <div style={{ textAlign: "center" }}>
          <p style={{ color: C.gray, fontSize: 14 }}>분석 데이터가 없습니다.</p>
          <button onClick={() => router.push("/")} style={{ marginTop: 12, color: C.ash, background: "none", border: "none", textDecoration: "underline", cursor: "pointer" }}>
            처음부터 시작
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: C.white, color: C.black }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "24px 16px" }}>
        <div className="no-print" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <button onClick={() => router.push("/landmarks")} style={{ color: C.ash, fontSize: 14, background: "none", border: "none", cursor: "pointer" }}>
            &larr; 랜드마크 보정
          </button>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <button onClick={() => window.print()} style={{ color: C.black, fontSize: 13, background: C.white, border: `1px solid ${C.ash}`, borderRadius: 6, padding: "5px 10px", cursor: "pointer" }}>
              PDF 저장
            </button>
            <button onClick={() => router.push("/")} style={{ color: C.ash, fontSize: 13, background: "none", border: "none", cursor: "pointer" }}>
              처음부터
            </button>
          </div>
        </div>

        <div className="no-print"><ResultTabBar active={tab} onChange={setTab} /></div>

        <div className="print-show-both">
          <div style={{ display: tab === "face" ? "block" : "none" }}>
            {faceData && (
              <FaceShapeTab
                data={faceData}
                onRefreshTip={() => { setFaceTip("포징 팁 생성 중…"); doFetchFaceTip(); }}
                selected={vf.face.selectedLabels}
                onSelectChange={(labels) => handleSelectChange("face", labels)}
                vf={buildVFControl("face")}
              />
            )}
          </div>
          <div className="print-page-break" style={{ display: tab === "body" ? "block" : "none" }}>
            {bodyData && (
              <BodyTypeTab
                data={bodyData}
                onRefreshTip={() => { setBodyTip("포징 팁 생성 중…"); doFetchBodyTip(); }}
                selected={vf.body.selectedLabels}
                onSelectChange={(labels) => handleSelectChange("body", labels)}
                vf={buildVFControl("body")}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
