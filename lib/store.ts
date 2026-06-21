"use client";

import { createContext, useContext } from "react";
import type { Sex } from "./config";
import type { FaceLandmarks } from "./faceShape";
import type { LandmarkPoint } from "./mediapipe/bodyExtract";
import type { SideDepths } from "./mediapipe/bodyExtract";
import type { FaceLandmarkKey } from "./mediapipe/faceMap";
import type { Point } from "./geometry";
import type { PersonalColor } from "./personalColor";

export interface CropRect { x: number; y: number; w: number; h: number }

export interface PhotoSlot {
  file: File;
  url: string;
  width: number;
  height: number;
  cropRect?: CropRect;
  croppedUrl?: string;
  croppedWidth?: number;
  croppedHeight?: number;
}

export interface Photos {
  face: PhotoSlot;
  bodyFront: PhotoSlot;
  bodySide: PhotoSlot;
}

export interface LandmarkData {
  faceMesh: LandmarkPoint[];
  faceMapped: FaceLandmarks;
  faceOverrides: Partial<Record<FaceLandmarkKey, Point>>;
  frontPose: LandmarkPoint[];
  sidePose: LandmarkPoint[];
  sideDepths: SideDepths;
  frontOverrides: Record<number, LandmarkPoint>;
}

export interface EditorGroupsData {
  faceGroups: unknown[];
  frontGroups: unknown[];
  sideGroups: unknown[];
  faceMesh: LandmarkPoint[];
  frontPose: LandmarkPoint[];
  sidePose: LandmarkPoint[];
}

export interface BodyInputs {
  heightCm: number | null;
  bustIn: number | null;
  waistIn: number | null;
  hipIn: number | null;
  footSize: number | null;
}

// 가상 피팅 상태 (탭별)
export interface VFState {
  status: "idle" | "ready" | "generating" | "generated" | "stale" | "error";
  selectedLabels: string[];        // 현재 선택된 칩 라벨
  generatedFromLabels: string[];   // 마지막 생성에 사용된 라벨
  imageDataUrl: string | null;     // 생성된 이미지 (dataURL)
  errorMessage?: string;
}

export interface VirtualFitting {
  face: VFState;
  body: VFState;
  sessionCount: number;            // 세션 누적 생성 횟수 (캐시 적중 제외)
  cache: Record<string, string>;   // 캐시 키 → dataURL
}

const emptyVF: VFState = { status: "idle", selectedLabels: [], generatedFromLabels: [], imageDataUrl: null };

export interface AppState {
  sex: Sex | null;
  bodyInputs: BodyInputs;
  personalColor: PersonalColor; // 사용자 직접 선택 (드롭다운). 기본 "unknown".
  photos: Photos | null;
  landmarks: LandmarkData | null;
  editorGroups: EditorGroupsData | null;
  vf: VirtualFitting;
}

export type AppAction =
  | { type: "SET_SEX"; sex: Sex }
  | { type: "SET_PERSONAL_COLOR"; personalColor: PersonalColor }
  | { type: "SET_BODY_INPUTS"; inputs: Partial<BodyInputs> }
  | { type: "SET_PHOTOS"; photos: Photos }
  | { type: "SET_LANDMARKS"; landmarks: LandmarkData }
  | { type: "SET_EDITOR_GROUPS"; data: EditorGroupsData }
  | { type: "UPDATE_FACE_OVERRIDES"; overrides: Partial<Record<FaceLandmarkKey, Point>> }
  | { type: "UPDATE_FRONT_OVERRIDES"; overrides: Record<number, LandmarkPoint> }
  | { type: "VF_SET_SELECTED"; kind: "face" | "body"; labels: string[] }
  | { type: "VF_START"; kind: "face" | "body" }
  | { type: "VF_SUCCESS"; kind: "face" | "body"; labels: string[]; dataUrl: string; cacheKey: string; fromCache: boolean }
  | { type: "VF_ERROR"; kind: "face" | "body"; message: string }
  | { type: "VF_RESET_SESSION" }
  | { type: "RESET" };

export const initialState: AppState = {
  sex: null,
  bodyInputs: { heightCm: null, bustIn: null, waistIn: null, hipIn: null, footSize: null },
  personalColor: "unknown",
  photos: null,
  landmarks: null,
  editorGroups: null,
  vf: { face: { ...emptyVF }, body: { ...emptyVF }, sessionCount: 0, cache: {} },
};

export const VF_SESSION_LIMIT = 5;

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "SET_SEX":
      return { ...state, sex: action.sex };
    case "SET_PERSONAL_COLOR":
      return { ...state, personalColor: action.personalColor };
    case "SET_BODY_INPUTS":
      return { ...state, bodyInputs: { ...state.bodyInputs, ...action.inputs } };
    case "SET_PHOTOS":
      return { ...state, photos: action.photos, landmarks: null, editorGroups: null };
    case "SET_LANDMARKS":
      return { ...state, landmarks: action.landmarks };
    case "SET_EDITOR_GROUPS":
      return { ...state, editorGroups: action.data };
    case "UPDATE_FACE_OVERRIDES":
      if (!state.landmarks) return state;
      return { ...state, landmarks: { ...state.landmarks, faceOverrides: action.overrides } };
    case "UPDATE_FRONT_OVERRIDES":
      if (!state.landmarks) return state;
      return { ...state, landmarks: { ...state.landmarks, frontOverrides: action.overrides } };
    case "VF_SET_SELECTED": {
      const cur = state.vf[action.kind];
      const sameAsGenerated = JSON.stringify([...action.labels].sort()) === JSON.stringify([...cur.generatedFromLabels].sort());
      const nextStatus: VFState["status"] = action.labels.length === 0
        ? "idle"
        : cur.imageDataUrl && !sameAsGenerated ? "stale"
        : cur.imageDataUrl && sameAsGenerated ? "generated"
        : "ready";
      return { ...state, vf: { ...state.vf, [action.kind]: { ...cur, selectedLabels: action.labels, status: nextStatus } } };
    }
    case "VF_START":
      return { ...state, vf: { ...state.vf, [action.kind]: { ...state.vf[action.kind], status: "generating", errorMessage: undefined } } };
    case "VF_SUCCESS": {
      const cur = state.vf[action.kind];
      return {
        ...state,
        vf: {
          ...state.vf,
          sessionCount: action.fromCache ? state.vf.sessionCount : state.vf.sessionCount + 1,
          cache: action.fromCache ? state.vf.cache : { ...state.vf.cache, [action.cacheKey]: action.dataUrl },
          [action.kind]: { ...cur, status: "generated", imageDataUrl: action.dataUrl, generatedFromLabels: action.labels, errorMessage: undefined },
        },
      };
    }
    case "VF_ERROR":
      return { ...state, vf: { ...state.vf, [action.kind]: { ...state.vf[action.kind], status: "error", errorMessage: action.message } } };
    case "VF_RESET_SESSION":
      return { ...state, vf: { ...initialState.vf } };
    case "RESET":
      return initialState;
    default:
      return state;
  }
}

export const AppContext = createContext<{
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
}>({ state: initialState, dispatch: () => {} });

export function useApp() {
  return useContext(AppContext);
}
