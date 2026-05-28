# Go-See Fit — 빌드 플랜 & 핵심 로직 핸드오프

> 이 문서 + `lib/*.ts` 4개를 Claude Code에 넘기면 됩니다. 분류 **로직은 완성**되어 있고,
> Claude Code가 채울 것은 (1) MediaPipe 좌표→측정값 매핑, (2) UI 화면, (3) Gemini 라우트, (4) 추천 매핑표입니다.

---

## 1. 확정 스택

| 영역 | 선택 | 이유 |
|---|---|---|
| 프레임워크 | **Next.js (App Router) + TypeScript** | Gemini 키를 숨길 서버 라우트가 필요 → SPA 대신 Next |
| 스타일 | **Tailwind CSS** | 와이어프레임 레이아웃 빠르게 |
| 랜드마크 | **MediaPipe Tasks Vision** (FaceLandmarker + PoseLandmarker, 브라우저 WASM) | 기술문서가 MediaPipe를 명시. **사진이 기기 밖으로 안 나감** |
| 분류 | **순수 TS 모듈** (이 폴더) | 학습 없이 결정론적. 테스트·보정 쉬움 |
| 생성 문장 | **Gemini API** (`/api/diagnose`만) | 사진이 아니라 *계산된 수치*만 전송 |
| 배포 | **Vercel** | 환경변수에 `GEMINI_API_KEY` |

---

## 2. 폴더 구조

```
gosee-fit/
├─ app/
│  ├─ page.tsx                 # 성별 선택(시작)
│  ├─ upload/page.tsx          # 사진 3장 + 키·3사이즈·발사이즈 입력
│  ├─ landmarks/page.tsx       # 랜드마크 보정(얼굴/전신 탭, 점 드래그)
│  ├─ result/page.tsx          # 결과(얼굴형/체형 탭)
│  └─ api/diagnose/route.ts    # Gemini 교정문장 (수치 in → 문장 out)
├─ lib/
│  ├─ config.ts        ✅ 제공  # 모든 컷·가중치·norm (보정 단일 진입점)
│  ├─ geometry.ts      ✅ 제공  # 거리·각도·z·둘레 타원근사(폴백용)
│  ├─ faceShape.ts     ✅ 제공  # 6분류 + 신뢰성 4지표(Todorov)
│  ├─ bodyType.ts      ✅ 제공  # S/W/N 2단계 + 보정 3축
│  ├─ mediapipe/faceMap.ts     ⬜ 빌드  # 468점 → FaceLandmarks 매핑
│  ├─ mediapipe/bodyExtract.ts ⬜ 빌드  # Pose + 실측 입력 → BodyMeasurements
│  └─ recommend.ts             ⬜ 빌드  # 타입 → 추천/비추천·스타일링 (문서 매핑표)
├─ components/                 ⬜ 빌드  # 업로드·드래그 보정·결과 카드 등
└─ .env.local                          # GEMINI_API_KEY=...
```

---

## 3. 빌드 단계 (Claude Code 진행 순서)

1. **프로젝트 셋업**: `npx create-next-app@latest`(TS, Tailwind, App Router), `lib/*` 복사.
2. **라우팅 골격**: 4개 화면 + 상태 전달(성별/사진/**키·3사이즈·발사이즈**/랜드마크). 사진은 메모리 보관, 서버 전송 금지.
3. **MediaPipe 연동**: FaceLandmarker/PoseLandmarker 로드 → 1차 추출 → 드래그 보정 UI → `faceMap.ts`/`bodyExtract.ts`로 매핑.
4. **분류 연결**: `classifyFaceShape`, `computeTrust`, `classifySkeleton`, `classifyAxes` 호출 → 결과 화면(소프트 점수 바·탭).
5. **추천 매핑**: `recommend.ts`를 통합기준표/핏문서/넥라인 매핑으로 채움 → 추천/비추천 카드.
6. **Gemini 라우트**: §7 규약대로 `/api/diagnose` 구현.
7. **Vercel 배포**: 환경변수 등록, 샘플 사진 1~2장 번들(“샘플로 체험” 버튼).
8. **beta placeholder**: 저장/로그인·AR·가상피팅·상품연결은 비활성 버튼.

---

## 4. 핵심 로직 사용 예

```ts
import { classifyFaceShape, computeTrust } from "@/lib/faceShape";
import { classifySkeleton, classifyAxes, describe } from "@/lib/bodyType";

const face = classifyFaceShape(faceLandmarks);     // {scores, primary, confidence, reviewFlag}
const trust = computeTrust(faceLandmarks, face.metrics); // {score, label}
const skel = classifySkeleton(bodyMeas, sex, hasSidePhoto);
const axes = classifyAxes(bodyMeas, sex);
const oneLine = describe(skel, axes);              // "내추럴 · 어깨형 · 롱레그 · 와이드"
```

---

## 4-bis. 사용자 입력 측정값 활용 (업데이트)

입력은 **사진 3장 + 키(cm) + 3사이즈(가슴·허리·엉덩이 둘레, cm) + 발 사이즈**다. 이 실측값이 사진 추정의 가장 약한 부분(둘레·절대 스케일)을 대체한다. **`lib/*.ts`는 수정 불필요** — `BodyMeasurements`의 기존 필드(whtr·bhr·chestMinusWaist_cm 등)에 실측을 채워 넣을 뿐이다. 변경은 **업로드 UI + bodyExtract.ts** 한정.

| 입력 | 쓰임 | 대체/개선되는 값 |
|---|---|---|
| 키(cm) | 절대 스케일: `pxPerCm = 인물픽셀키 ÷ 키` | 모든 px 길이를 cm로. whtr 분모, V-Taper cm 변환 |
| 가슴·허리·엉덩이 둘레(cm) | 실측 둘레로 추정 대체 | `bhr=가슴/엉덩이`, `whtr=허리/키`, `chestMinusWaist_cm=가슴−허리` (전부 정확) |
| 발 사이즈 | 보조 스케일 앵커(머리·발 잘림 대비) + 신발 추천(후속) | 스케일 교차검증 |

핵심:
- **둘레 3종은 더 이상 타원근사로 추정하지 않는다.** bhr·whtr·chestMinusWaist를 실측에서 직접 산출 → 정면/측면 스케일 불일치 문제 소멸. 남성 V-Taper의 "170cm 기본값" 문제도 해결.
- **thoraxFlat**(AP깊이÷너비)은 둘레가 아니라 형태라 직접 대체는 안 되지만, **실측 가슴둘레 + 정면 가슴너비(px→cm)로 타원식을 역산해 깊이를 교차검증**할 수 있다(실루엣 스캔 보강).
- 키 입력 시 모든 비율(shoulderHip/shoulderHeight/frame)을 cm로도 표기 가능(분류 결과는 동일).

여전히 사진 추정으로 남는 것(실측 대체 불가): `bustHeight`·`waistPos`(수직 위치), `sittingHeightRatio`(앉은키 프록시 — 선 자세에선 실측 불가), `shoulderSlopeDeg`(각도), `jointWidthIndex`(관절 너비 — 실측 스케일로 정밀화는 가능하나 별도 측정 필요).

**입력 누락 대비(폴백)**: 둘레가 없으면 기존 타원근사로, 키가 없으면 비율 기반 축만 동작(cm 표기·V-Taper cm 비활성).

---

## 5. 임계값 보정 레지스트리 (← 질문 정리)

`config.ts`의 모든 값에 `status` 플래그가 붙어 있습니다. UI 감사용 `calibrationAudit()`로 전체 목록을 뽑을 수 있어요.

### 5-1. 확정(ESTABLISHED) — 그대로 사용
| 항목 | 값 | 근거 |
|---|---|---|
| 안면비율 단/중/장모 컷 | 1.6 / 1.699 | 문헌 인용 [1] |
| 흉곽 AP/횡경 측정 방향 | 두꺼움>0.75·얇음<0.65 | ISO 7250-1 (ICC 0.85~0.95) |
| BHR 기준 | 0.97 | ISO 8559-1 |
| **신뢰성 4지표 가중치** | +0.13·+0.13·+0.21·−0.09 | **Todorov 2008 Table 1** |

> 주의: 어깨경사 측정·관절너비 등은 *측정 표준*은 확정이지만, 그 값을 **분류 컷으로 쓰는 적용**은 잠정입니다.

### 5-2. 잠정(PROVISIONAL) — 패션모델 표본으로 재보정 **대상**
일반인 평균(차수정 2019·SizeKorea)에서 끌어온 시작값. 모델 집단은 내추럴/웨이브로 수렴해 변별력이 떨어지므로 **컷을 모델 분포에 맞게 조정**해야 합니다.
- 골격 1단계: 어깨경사 16° 적용, 관절너비 5.2/5.5, WHtR 0.43/0.45, Nscore 임계 2.5, 가중치 1.5/1
- 골격 2단계: S/W ±임계 0.5
- 보정 3축: 실루엣 1.10 / V형 21cm, 좌고비 50·52 / 52.1·53.6, 프레임 0.225·0.235 / 0.244·0.256
- 얼굴 형태: AR 1.25·1.5, 동률 0.08, 이마우세 1.08, 턱좁음 0.90

### 5-3. 미정(UNDETERMINED) — 데이터로 채워야 동작
- **z-score norm**: 신뢰성 4지표 norm, 골격 2단계 4지표 norm (현재 임시값)
- **커머셜/비커머셜 임계**(commercialCutZ)
- **하악각 각짐 경계**(125° 임시)

### 5-4. 보정 방법(절차)
1. **표본 수집**: 모델/지망생 20~30명(문서 권고), 1인당 사진 3장 + 정답 라벨(전문가 진단/합의).
2. **norm 산출**: 변수별 평균·SD → 미정 norm 확정(특히 신뢰성·골격 2단계 z-score 기준).
3. **컷 재설정**: ① 분포 분위수(3분할이면 33/66 퍼센타일)로 경계 잡기, 또는 ② 라벨 일치율 최대화 그리드서치.
4. **가중치 보정**: 라벨 데이터에 로지스틱/선형 회귀 → Nscore·신뢰성 가중치 추정(데이터 부족 시 균등 유지).
5. **외부 대조**: 박선미·정은영(2024, KCI)의 흉곽·BHR 경계, 알려진 골격타입 모델과 대조.
6. **운영**: 코드 수정 없이 `config.ts` 값만 교체 → 재배포.

---

## 6. 측정 추출 — 남은 갭 / 결정사항 (업데이트)
로직은 완성이고, 측정값을 *뽑아내는* 단계만 다룬다. 실측 입력 도입으로 둘레·스케일 갭은 대부분 해소됨(§4-bis).
- **랜드마크 매핑**: MediaPipe 점 → 의미 좌표. `/test`에서 검증 완료(px 좌표 + 정면/측면 스케일 통일).
- **둘레**: ~~타원근사 추정~~ → **실측 3사이즈 직접 사용**(§4-bis). 타원근사는 누락 시 폴백으로만.
- **절대 스케일**: 키 입력으로 `pxPerCm` 확보, 발 사이즈로 교차검증.
- **thoraxFlat**: 측면 실루엣 AP깊이(검증됨) + 실측 둘레 역산 교차검증.
- **좌고비(앉은키)**: 여전히 프록시(머리~골반). 선 자세에선 실측 불가 → "참고" 표기.
- **측면 결측**: `classifySkeleton(.., sideAvailable=false)` → **"보류"**(문서 규칙).
- **AR vs FR 정의 충돌**: 문서상 둘 다 `L/W_c`. 구현 전 원문에서 FR 분모/분자 재확인.
- **신뢰성 단위 근사**: Todorov 계수는 FaceGen morph 단위 → 기하 z-score 적용은 근사(보정 시 재검토).

---

## 7. Gemini 라우트 규약 (`/api/diagnose`)
- **전송**: 사진 아님. `{ asymmetryDeg, tiltDeg, shoulderBalance, centerAxis, faceShape, skeleton, axes }` 같은 **수치/라벨만**.
- **반환**: 사용자용 설명 + 교정 제안 한국어 문장(2~3문장).
- **키**: 서버 전용 `process.env.GEMINI_API_KEY`. 클라이언트 번들 노출 금지.
- **남용 방지**: 공개 배포이므로 간단한 rate-limit(예: IP/세션당 N회) 권장.
- 모델 예: `gemini-2.0-flash` 계열(문장 생성용, 저비용). 정확한 최신 모델명은 Google AI Studio 문서 확인.

---

## 8. 배포 · 프라이버시
- Vercel 프로젝트 환경변수에 `GEMINI_API_KEY` 등록 후 `vercel --prod`.
- **셀링포인트**: 사진은 브라우저 안에서만 분석되고 서버로 업로드되지 않음. Gemini엔 수치만 감. → 공개 데모에서 사진 유출 위험 없음. UI에 이 점을 명시 권장.

---

## 9. Claude Code 킥오프 프롬프트(예시)
> "Next.js(App Router, TS, Tailwind) 프로젝트를 만들어줘. `lib/`에 config/geometry/faceShape/bodyType.ts가 이미 있어(분류 로직 완성, 수정 금지). 너는 ① MediaPipe Tasks Vision으로 얼굴/전신 랜드마크 추출 + 드래그 보정 UI, ② 468/33점을 lib의 FaceLandmarks/BodyMeasurements로 매핑하는 mediapipe/ 모듈, ③ BUILD_PLAN의 4개 화면(성별→업로드→보정→결과 탭), ④ /api/diagnose Gemini 라우트(수치만 전송, 키는 env)를 구현해. 사진은 절대 서버로 보내지 마. PROVISIONAL/UNDETERMINED 값은 결과에 '참고용' 배지로 표시해."

> **입력 정정(§4-bis)**: 업로드 단계에서 사진 3장 외에 **키(cm)·3사이즈(가슴·허리·엉덩이 둘레)·발 사이즈**도 받는다. bodyExtract.ts는 이 실측값을 우선 사용(둘레=실측, 스케일=키 기반)하고, 누락 시에만 타원근사로 폴백한다.
