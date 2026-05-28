import {
  FaceLandmarker,
  PoseLandmarker,
  FilesetResolver,
} from "@mediapipe/tasks-vision";

const WASM_CDN =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";
const FACE_MODEL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const POSE_MODEL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task";

let visionPromise: Promise<Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>> | null = null;

function getVision() {
  if (!visionPromise) {
    visionPromise = FilesetResolver.forVisionTasks(WASM_CDN);
  }
  return visionPromise;
}

let facePromise: Promise<FaceLandmarker> | null = null;
let posePromise: Promise<PoseLandmarker> | null = null;

export function getFaceLandmarker(): Promise<FaceLandmarker> {
  if (!facePromise) {
    facePromise = getVision().then((vision) =>
      FaceLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: FACE_MODEL, delegate: "GPU" },
        runningMode: "IMAGE",
        numFaces: 1,
      }),
    );
  }
  return facePromise;
}

export function getPoseLandmarker(): Promise<PoseLandmarker> {
  if (!posePromise) {
    posePromise = getVision().then((vision) =>
      PoseLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: POSE_MODEL, delegate: "GPU" },
        runningMode: "IMAGE",
        numPoses: 1,
      }),
    );
  }
  return posePromise;
}

export type { FaceLandmarker, PoseLandmarker };
