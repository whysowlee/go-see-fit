"use client";

import { useRouter } from "next/navigation";
import { useApp } from "@/lib/store";
import { useEffect, useState, useCallback } from "react";
import { getFaceLandmarker, getPoseLandmarker } from "@/lib/mediapipe/loader";
import { mapToFaceLandmarks, FACE_IDX, FACE_IDX_EXTRA, type FaceLandmarkKey } from "@/lib/mediapipe/faceMap";
import { measureSideDepths, estimateSideHeight, POSE_IDX, type LandmarkPoint } from "@/lib/mediapipe/bodyExtract";
import type { Point } from "@/lib/geometry";
import LandmarkEditor, {
  type LMGroup,
  buildGroups,
  groupsToCoords,
  FACE_GROUPS,
  BODY_FRONT_GROUPS,
  BODY_SIDE_GROUPS,
} from "@/components/LandmarkEditor";

type Tab = "face" | "bodyFront" | "bodySide";
const TABS: { key: Tab; label: string }[] = [
  { key: "face", label: "얼굴" },
  { key: "bodyFront", label: "전신 정면" },
  { key: "bodySide", label: "전신 측면" },
];

// ── MediaPipe → scheme coords ──

function meshToFaceCoords(mesh: LandmarkPoint[]): Record<string, { x: number; y: number }> {
  const p = (idx: number) => ({ x: mesh[idx].x, y: mesh[idx].y });
  return {
    foreheadTop: p(FACE_IDX.foreheadCenterTop), menton: p(FACE_IDX.menton),
    templeL: p(FACE_IDX.foreheadL), templeR: p(FACE_IDX.foreheadR),
    zygoL: p(FACE_IDX.zygomaticL), zygoR: p(FACE_IDX.zygomaticR),
    gonionL: p(FACE_IDX.gonionL), gonionR: p(FACE_IDX.gonionR),
    browInnerL: p(FACE_IDX.browInnerL), browPeakL: p(FACE_IDX.browMidL),
    browInnerR: p(FACE_IDX_EXTRA.browInnerR), browPeakR: p(FACE_IDX_EXTRA.browPeakR),
    sellion: p(FACE_IDX.noseSellion), noseTip: p(FACE_IDX.noseTip),
  };
}

function frontPoseToCoords(pose: LandmarkPoint[]): Record<string, { x: number; y: number }> {
  const p = (idx: number) => ({ x: pose[idx].x, y: pose[idx].y });
  const shL = pose[11], shR = pose[12];
  const hipL_mp = pose[23], hipR_mp = pose[24];
  const shMid = { x: (shL.x + shR.x) / 2, y: (shL.y + shR.y) / 2 };
  const hipMid = { x: (hipL_mp.x + hipR_mp.x) / 2, y: (hipL_mp.y + hipR_mp.y) / 2 };
  const eyeMidY = (pose[2].y + pose[5].y) / 2;
  const noseY = pose[0].y;
  const nte = Math.abs(noseY - eyeMidY);
  const crownY = nte > 0.003 ? eyeMidY - nte * 3 : noseY - (shMid.y - noseY) * 0.9;
  const shW = Math.abs(shL.x - shR.x);
  const hipW = Math.abs(hipL_mp.x - hipR_mp.x);
  const torsoH = hipMid.y - shMid.y;

  // 3 어깨끝: MediaPipe 어깨를 살짝 바깥으로 (삼각근 두께)
  const acromionL = { x: shL.x - shW * 0.05, y: shL.y };
  const acromionR = { x: shR.x + shW * 0.05, y: shR.y };

  // 4 목아래: 어깨선 위 ~25%, 어깨에서 목 중심 쪽 50%
  const neckBaseL = {
    x: shL.x + (shMid.x - shL.x) * 0.5,
    y: shMid.y - torsoH * 0.08,
  };
  const neckBaseR = {
    x: shR.x + (shMid.x - shR.x) * 0.5,
    y: shMid.y - torsoH * 0.08,
  };

  // 5 목옆: 귀(7,8)를 안쪽 25%로, y는 귀와 어깨 중간
  const neckL = {
    x: pose[7].x + (shMid.x - pose[7].x) * 0.25,
    y: (pose[7].y + shMid.y) / 2,
  };
  const neckR = {
    x: pose[8].x + (shMid.x - pose[8].x) * 0.25,
    y: (pose[8].y + shMid.y) / 2,
  };

  // 6 가슴: 어깨~골반 20% 지점, 너비는 어깨너비의 90%
  const chestY = shMid.y + torsoH * 0.20;
  const chestHW = shW * 0.45;

  // 7 허리: 어깨~골반 50% 지점, 너비는 골반너비(보정)의 80%
  const waistY = shMid.y + torsoH * 0.50;
  const hipBodyW = hipW * 1.8;
  const waistHW = hipBodyW * 0.40;

  // 8 골반: MediaPipe hip을 대전자 보정(×1.8)
  const hipL = { x: hipMid.x + hipBodyW / 2, y: hipMid.y };
  const hipR = { x: hipMid.x - hipBodyW / 2, y: hipMid.y };

  // 11 사타구니: 골반 아래, 키의 약 4%
  const heightPx = Math.max(pose[29].y, pose[30].y) - crownY;
  const crotchY = hipMid.y + heightPx * 0.04;

  return {
    crown: { x: shMid.x, y: crownY },
    heelL: p(POSE_IDX.LEFT_HEEL), heelR: p(POSE_IDX.RIGHT_HEEL),
    acromionL, acromionR,
    neckBaseL, neckBaseR, neckL, neckR,
    chestL: { x: shMid.x + chestHW, y: chestY }, chestR: { x: shMid.x - chestHW, y: chestY },
    waistL: { x: hipMid.x + waistHW, y: waistY }, waistR: { x: hipMid.x - waistHW, y: waistY },
    hipL, hipR,
    elbowL: p(13), elbowR: p(14),
    kneeL: p(25), kneeR: p(26),
    crotch: { x: hipMid.x, y: crotchY },
  };
}

function sidePoseToCoords(pose: LandmarkPoint[]): Record<string, { x: number; y: number }> {
  const shMid = { x: (pose[11].x + pose[12].x) / 2, y: (pose[11].y + pose[12].y) / 2 };
  const hipMid = { x: (pose[23].x + pose[24].x) / 2, y: (pose[23].y + pose[24].y) / 2 };
  const eyeMidY = (pose[2].y + pose[5].y) / 2;
  const nte = Math.abs(pose[0].y - eyeMidY);
  const crownY = nte > 0.003 ? eyeMidY - nte * 3 : pose[0].y - (shMid.y - pose[0].y) * 0.9;
  const soleY = Math.max(pose[29].y, pose[30].y);
  const waistY = shMid.y + (hipMid.y - shMid.y) * 0.50;

  // 측면에서 모든 관련 랜드마크의 x 범위를 수집해 앞/뒤 경계 추정
  const allX = [pose[0].x, pose[11].x, pose[12].x, pose[13].x, pose[14].x,
                pose[23].x, pose[24].x, pose[25].x, pose[26].x];
  const minX = Math.min(...allX);
  const maxX = Math.max(...allX);
  const bodyW = maxX - minX;

  // 14 가슴 앞: 랜드마크 최전방에서 체표면 두께분 더 앞 (~15%)
  const chestFrontX = minX - bodyW * 0.15;
  // 15 등 뒤: 랜드마크 최후방에서 체표면 두께분 더 뒤 (~15%)
  const chestBackX = maxX + bodyW * 0.15;

  // 16 허리: 앞뒤 중간에서 살짝 앞쪽 (허리는 배 쪽이 더 들어감)
  const waistX = chestFrontX + (chestBackX - chestFrontX) * 0.35;

  // 17 엉덩이 뒤: 골반 높이에서 뒤쪽 경계
  const hipBackX = maxX + bodyW * 0.2;

  return {
    crownSide: { x: shMid.x, y: crownY },
    heelSide: { x: (pose[29].x + pose[30].x) / 2, y: soleY },
    chestFront: { x: chestFrontX, y: shMid.y },
    chestBack: { x: chestBackX, y: shMid.y },
    waistLowSide: { x: waistX, y: waistY },
    hipBack: { x: hipBackX, y: hipMid.y },
  };
}

// ── page ──

export default function LandmarksPage() {
  const router = useRouter();
  const { state, dispatch } = useApp();
  const photos = state.photos;

  const [tab, setTab] = useState<Tab>("face");
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [error, setError] = useState("");

  // store에 보존된 groups가 있으면 복원, 없으면 빈 배열
  const saved = state.editorGroups;
  const [faceMesh, setFaceMesh] = useState<LandmarkPoint[] | null>(saved?.faceMesh as LandmarkPoint[] ?? null);
  const [frontPose, setFrontPose] = useState<LandmarkPoint[] | null>(saved?.frontPose as LandmarkPoint[] ?? null);
  const [sidePose, setSidePose] = useState<LandmarkPoint[] | null>(saved?.sidePose as LandmarkPoint[] ?? null);

  const [faceGroups, setFaceGroups] = useState<LMGroup[]>((saved?.faceGroups as LMGroup[]) ?? []);
  const [frontGroups, setFrontGroups] = useState<LMGroup[]>((saved?.frontGroups as LMGroup[]) ?? []);
  const [sideGroups, setSideGroups] = useState<LMGroup[]>((saved?.sideGroups as LMGroup[]) ?? []);

  useEffect(() => { if (!photos) router.push("/upload"); }, [photos, router]);

  const faceUrl = photos?.face.croppedUrl || photos?.face.url || "";
  const frontUrl = photos?.bodyFront.croppedUrl || photos?.bodyFront.url || "";
  const sideUrl = photos?.bodySide.croppedUrl || photos?.bodySide.url || "";

  // 추출: store에 보존된 데이터가 있으면 건너뜀
  useEffect(() => {
    if (!photos || saved) {
      if (saved && faceMesh) setStatus("ready");
      return;
    }
    let cancelled = false;
    (async () => {
      setStatus("loading");
      try {
        const [faceLm, poseLm] = await Promise.all([getFaceLandmarker(), getPoseLandmarker()]);
        if (cancelled) return;
        const loadImg = (url: string) => new Promise<HTMLImageElement>((res, rej) => {
          const i = new Image();
          i.crossOrigin = "anonymous";
          i.onload = () => res(i);
          i.onerror = rej;
          i.src = url;
        });
        const [fImg, frImg, sImg] = await Promise.all([loadImg(faceUrl), loadImg(frontUrl), loadImg(sideUrl)]);
        if (cancelled) return;

        const fm = faceLm.detect(fImg).faceLandmarks?.[0] as LandmarkPoint[] | undefined;
        const fp = poseLm.detect(frImg).landmarks?.[0] as LandmarkPoint[] | undefined;
        const sp = poseLm.detect(sImg).landmarks?.[0] as LandmarkPoint[] | undefined;

        if (!fm || !fp || !sp) { setError("일부 사진에서 랜드마크를 감지하지 못했습니다."); setStatus("error"); return; }

        setFaceMesh(fm); setFrontPose(fp); setSidePose(sp);
        setFaceGroups(buildGroups(FACE_GROUPS, meshToFaceCoords(fm)));
        setFrontGroups(buildGroups(BODY_FRONT_GROUPS, frontPoseToCoords(fp)));
        setSideGroups(buildGroups(BODY_SIDE_GROUPS, sidePoseToCoords(sp)));
        setStatus("ready");
      } catch (e) { if (!cancelled) { setError(String(e)); setStatus("error"); } }
    })();
    return () => { cancelled = true; };
  }, [photos, faceUrl, frontUrl, sideUrl, saved]);

  // ── 결과 보기 ──
  const goToResult = useCallback(() => {
    if (!faceMesh || !frontPose || !sidePose || !photos) return;

    // 보정된 groups를 store에 보존 (뒤로가기 시 복원용)
    dispatch({
      type: "SET_EDITOR_GROUPS",
      data: { faceGroups, frontGroups, sideGroups, faceMesh, frontPose, sidePose },
    });

    const faceCoords = groupsToCoords(faceGroups);
    const frontCoords = groupsToCoords(frontGroups);
    const sideCoords = groupsToCoords(sideGroups);

    const FACE_MAP: Record<string, FaceLandmarkKey> = {
      foreheadTop: "foreheadCenterTop", menton: "menton", templeL: "foreheadL", templeR: "foreheadR",
      zygoL: "zygomaticL", zygoR: "zygomaticR", gonionL: "gonionL", gonionR: "gonionR",
      browInnerL: "browInnerL", browPeakL: "browMidL", sellion: "noseSellion", noseTip: "noseTip",
    };
    const origFace = meshToFaceCoords(faceMesh);
    const fW = photos.face.croppedWidth || photos.face.width;
    const fH = photos.face.croppedHeight || photos.face.height;
    const faceOv: Partial<Record<FaceLandmarkKey, Point>> = {};
    for (const [sid, fk] of Object.entries(FACE_MAP)) {
      const cur = faceCoords[sid]; const orig = origFace[sid];
      if (!cur || !orig) continue;
      if (Math.abs(cur.x - orig.x) > 0.0005 || Math.abs(cur.y - orig.y) > 0.0005) {
        faceOv[fk] = { x: cur.x * fW, y: cur.y * fH };
      }
    }

    const FRONT_MAP: Record<string, number> = {
      acromionL: 11, acromionR: 12, neckL: 7, neckR: 8,
      hipL: 23, hipR: 24, elbowL: 13, elbowR: 14, kneeL: 25, kneeR: 26,
    };
    const origFront = frontPoseToCoords(frontPose);
    const frW = photos.bodyFront.croppedWidth || photos.bodyFront.width;
    const frH = photos.bodyFront.croppedHeight || photos.bodyFront.height;
    const frontOv: Record<number, LandmarkPoint> = {};
    for (const [sid, idx] of Object.entries(FRONT_MAP)) {
      const cur = frontCoords[sid]; const orig = origFront[sid];
      if (!cur || !orig) continue;
      if (Math.abs(cur.x - orig.x) > 0.0005 || Math.abs(cur.y - orig.y) > 0.0005) {
        frontOv[idx] = { x: cur.x * frW, y: cur.y * frH };
      }
    }

    const adjustedSidePose = sidePose.map((lm) => ({ ...lm }));
    const sImg = new Image();
    sImg.src = sideUrl;
    sImg.onload = () => {
      const dims = { width: photos.bodySide.croppedWidth || photos.bodySide.width, height: photos.bodySide.croppedHeight || photos.bodySide.height };
      const tmp = document.createElement("canvas");
      tmp.width = dims.width; tmp.height = dims.height;
      tmp.getContext("2d")!.drawImage(sImg, 0, 0);
      const depths = measureSideDepths(tmp, adjustedSidePose, dims);
      const sideH = estimateSideHeight(adjustedSidePose, dims);
      const cf = sideCoords.chestFront; const cb = sideCoords.chestBack;
      if (cf && cb) depths.chestAP = Math.abs(cf.x - cb.x) * dims.width;
      const hb = sideCoords.hipBack;
      if (hb && cf) depths.hipAP = Math.abs(hb.x - cf.x) * dims.width;

      const faceMapped = mapToFaceLandmarks(faceMesh, fW, fH, faceOv);
      dispatch({
        type: "SET_LANDMARKS",
        landmarks: { faceMesh, faceMapped, faceOverrides: faceOv, frontPose, sidePose, sideDepths: { ...depths, personHeight: sideH }, frontOverrides: frontOv },
      });
      router.push("/result");
    };
  }, [faceMesh, frontPose, sidePose, photos, faceGroups, frontGroups, sideGroups, faceUrl, frontUrl, sideUrl, dispatch, router]);

  if (!photos) return null;

  const imageUrl = tab === "face" ? faceUrl : tab === "bodyFront" ? frontUrl : sideUrl;
  const grps = tab === "face" ? faceGroups : tab === "bodyFront" ? frontGroups : sideGroups;
  const setGrps = tab === "face" ? setFaceGroups : tab === "bodyFront" ? setFrontGroups : setSideGroups;

  return (
    <div style={{ minHeight: "100vh", background: "var(--white)", color: "var(--black)" }}>
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "24px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <button onClick={() => router.push("/upload")} style={{ color: "var(--ash)", fontSize: 14, background: "none", border: "none", cursor: "pointer" }}>&larr; 사진 입력</button>
        </div>

        {status === "loading" && (
          <div style={{ textAlign: "center", padding: "80px 0", color: "var(--gray)" }}>
            <span style={{ display: "inline-block", width: 24, height: 24, border: "3px solid var(--ash)", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
            <p style={{ marginTop: 12 }}>모델 로딩 & 랜드마크 추출 중…</p>
            <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
          </div>
        )}

        {status === "error" && (
          <div style={{ textAlign: "center", padding: "80px 0" }}>
            <p style={{ color: "#dc2626", fontSize: 14 }}>{error}</p>
            <button onClick={() => router.push("/upload")} style={{ marginTop: 12, color: "var(--ash)", background: "none", border: "none", textDecoration: "underline", cursor: "pointer" }}>사진 다시 올리기</button>
          </div>
        )}

        {status === "ready" && (
          <>
            {/* 세그먼트 캡슐 탭 */}
            <div style={{ display: "flex", border: "0.5px solid rgba(0,0,0,0.15)", borderRadius: 999, overflow: "hidden", marginBottom: 18 }}>
              {TABS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  style={{
                    flex: 1, padding: "10px 0", fontSize: 14, border: "none", cursor: "pointer",
                    fontWeight: tab === key ? 600 : 400,
                    background: tab === key ? "rgba(28,35,49,0.08)" : "var(--white)",
                    color: tab === key ? "var(--black)" : "var(--gray)",
                    borderRight: key !== "bodySide" ? "0.5px solid rgba(0,0,0,0.1)" : "none",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            <LandmarkEditor
              title={`${TABS.find((t) => t.key === tab)!.label} 랜드마크 보정`}
              imageUrl={imageUrl}
              groups={grps}
              onChange={setGrps}
              dotRadius={tab === "face" ? 6.5 : 9}
            />

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
              <button
                onClick={goToResult}
                style={{ padding: "12px 24px", borderRadius: 8, border: "none", background: "var(--black)", color: "var(--white)", fontSize: 14, fontWeight: 700, cursor: "pointer" }}
              >
                결과 보기 →
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
