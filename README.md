# go-see-fit

브라우저에서 사진 한 장으로 **얼굴형(6분류) + 체형(SWN 1층 · 3축 2층)**을 분류하고, 그에 맞는 스타일을 제안하는 Next.js 앱.

- 사진은 **절대 서버로 가지 않음** — MediaPipe Tasks Vision이 WASM으로 브라우저에서 직접 478개 얼굴 랜드마크 + 33개 포즈 랜드마크를 추출
- API로는 계산된 **숫자/라벨만** 송신 (Gemini API 키는 서버 전용)
- 모든 임계값은 [SizeKorea 8차 조사(2021, n≈2,333)](https://sizekorea.kr) 20–39세 인구 분포로 보정

## 시작하기

```bash
npm install
npm run dev      # http://localhost:3000
```

빌드/린트:

```bash
npm run build
npm run lint
```

## 사용자 흐름

```
홈(/) → 사진 업로드(/upload) → 랜드마크 보정(/landmarks) → 결과(/result)
```

1. **/upload** — 정면 사진(필수) + 측면 사진(필수, 체형 분류용). 크롭으로 인물 범위 지정
2. **/landmarks** — MediaPipe가 자동 추출, 사용자가 5개 편집 그룹(머리·얼굴·어깨·허리·목)을 드래그로 미세 보정
3. **/result** — 얼굴형(6분류) + Todorov 신뢰성 + 체형(SWN · 실루엣 · 비율 · 프레임) + 스타일 추천 카드

## 디렉토리 구조

```
app/                       Next.js 16 App Router
  page.tsx                 홈
  upload/                  사진 업로드 + 크롭
  landmarks/               랜드마크 자동 추출 + 사용자 보정
  result/                  결과 카드
  api/diagnose/            Gemini API (서버 전용, 숫자만 송신)
  api/virtual-fitting/     가상피팅 placeholder

lib/                       코어 로직 (read-only — 4개 모듈)
  config.ts                모든 임계값·가중치·norm의 단일 진입점
  geometry.ts              순수 수학 (거리, 각도, z-score, 둘레)
  faceShape.ts             6분류 얼굴형 + Todorov 신뢰성
  bodyType.ts              SWN 1층 + 3축 2층 체형 분류

lib/mediapipe/             MediaPipe Tasks Vision 어댑터
  faceMap.ts               478점 → FaceLandmarks
  bodyExtract.ts           33점 → BodyMeasurements
  loader.ts                WASM 로더

lib/recommend.ts           라벨 → 스타일 매핑
lib/bodyMatrix.ts          추천 매트릭스
lib/store.ts               클라이언트 상태

components/                UI 컴포넌트
  ImageCropper.tsx
  LandmarkEditor.tsx
  ResultFaceTab.tsx
  ResultBodyTab.tsx
```

## 분류 로직 (요약)

### 얼굴형 — 6분류

`lib/faceShape.ts` 의 `hardPrimary` 규칙 트리:

1. **역삼각형** : `F ≥ 1.08` AND `T > 1` (이마 우세)
2. **마름모형** : `cheekIsMax` AND `F < 0.92` AND `J < 0.92` (광대 최대 + 이마·턱 좁음)
3. **거의 평행** (`|F−1| < 0.08` AND `|J−1| < 0.08`):
   - `AR > 1.579` → 장방형
   - `AR < 1.398` → `jawAngle < 125°` 사각형 / 아니면 둥근형
4. **계란형** : `cheekIsMax` AND `J < 0.801` AND `jawAngle ≥ 125°`
5. **잔여** : `F > J` 역삼각형 / 아니면 계란형

별도로 **Todorov 4지표 z-score 가중합**으로 커머셜/비커머셜/경계 라벨 산출.

Metric 정의:
- `Wc` = 얼굴너비 (광대 사이)
- `Wj` = 아래턱사이너비
- `Wf` = 이마너비
- `L`  = 얼굴길이 (눈살-이마 + 얼굴수직길이)
- `F = Wf/Wc` · `J = Wj/Wc` · `T = Wf/Wj` · `AR = L/Wc`
- `cheekIsMax = (Wc ≥ Wf) AND (Wc ≥ Wj)`

### 체형 — SWN 1층 + 3축 2층

**1층 (`classifySkeleton`)** : Straight / Wave / Natural

- 내추럴 점수 4지표 (각 컷 통과 시 +가중치):
  - `shoulderSlopeAngular ≥ 23.5°` (각진 어깨)
  - `jointWidthIdx ≥ 6.05(여)/6.03(남)` (관절 넓음)
  - `whtr ≤ 0.422(여)/0.449(남)` (연조직 적음)
  - `thinNeck` (목 가는 편)
- Nscore ≥ 2.5 → **Natural**
- 아니면 S/W z합으로 분리:
  - `+0.5 이상` → **Straight**
  - `−0.5 이하` → **Wave**
  - 사이 → 경계 (질감 1회 확인)

**2층 (`classifyAxes`)** : 한 metric 박스 → 3분기, 3축 모두 합쳐서 `describe()`로 라벨링

| 축 | 입력 | 분기 |
|---|---|---|
| 실루엣 | 여: shoulderHipRatio / 남: chestMinusWaist_cm | 어깨형·V형 / 밸런스 / 곡선형·직선형 |
| 비율 | sittingHeightRatio | 롱레그 / 밸런스 / 롱토르소 |
| 프레임 | shoulderHeightRatio | 슬림 / 미디엄 / 와이드 |

최종 출력 예: `"내추럴 · V형 · 롱레그 · 슬림"`

## 임계값 보정 (calibration)

모든 분류 컷·norm은 `lib/config.ts` 한 파일에 모여 있고, **이 파일만 수정**해서 보정한다.

### 보정 상태

| 상태 | 의미 |
|---|---|
| `ESTABLISHED` | 측정 표준 / 문헌 / 인구 분포 기반. 그대로 사용 가능 |
| `PROVISIONAL` | 임시 시작값. 표본으로 재보정 대상 |
| `UNDETERMINED` | 원 연구에 직접 대응값 없음. 보정 필수 |

UI는 PROVISIONAL/UNDETERMINED로 산출된 결과에 **"참고용"** 배지를 자동으로 붙인다.

### 현재 보정 출처

- **SizeKorea 제8차 한국인 인체치수 조사 (2021)** 의 20–39세 4구간 (남 n=1,103 / 여 n=1,230) 가중평균·풀드 SD
- P25/P75 컷 = `μ ± 0.674σ` (정규분포 가정, 인구 4분할)
- 비율 norm은 delta method (`σ²_X/Y = (σx/μy)² + (μx²/μy⁴)·σy²`, Cov=0 보수치)
- Wf(이마너비) 관련 3개 컷(`parallelTol`, `foreheadDominant`, `diamondMax`)은 한국 인체측정 표준 13건 전수 검색에서 미수록 → PROVISIONAL 유지

전체 보정 표(이전→새 값 + 자료 출처)는 별도 산출 저장소 `gsf-calibration/output/SK_CALIBRATION_BRIEFING.md`에 상세 정리.

## 절대 규칙

- `lib/config.ts`, `lib/geometry.ts`, `lib/faceShape.ts`, `lib/bodyType.ts` 4개는 **완성된 분류 로직**. 임포트해서 호출만 한다 (`config.ts`는 보정 갱신만 허용).
- 업로드된 사진은 **브라우저에서만** 처리. 어떤 경우에도 사진 원본/이미지 데이터를 서버나 외부 API로 보내지 않는다.
- 랜드마크 추출은 MediaPipe Tasks Vision을 브라우저에서 실행.
- Gemini API 키는 서버 전용(`process.env.GEMINI_API_KEY`)으로만 사용. 클라이언트 번들에 노출 금지. Gemini로는 사진이 아닌 **계산된 수치/라벨만** 전송.
- 저장/로그인 · AR · 가상피팅 · 상품연결은 비활성 placeholder.

## 기술 스택

| 영역 | 사용 기술 |
|---|---|
| 프레임워크 | Next.js 16 (App Router) |
| 언어 | TypeScript 5 |
| 스타일 | Tailwind CSS 4 |
| 런타임 | React 19 |
| ML | @mediapipe/tasks-vision (브라우저 WASM) |
| AI | Gemini API (서버 라우트 경유) |

## 관련 문서

- `BUILD_PLAN.md` — 빌드 계획·미완료 모듈 목록
- `Go-See-Fit_임계값_보정_레지스트리.docx` — 28개 키 보정 레지스트리
- 별도 저장소 `gsf-calibration/` — SizeKorea 추출 스크립트, 보정 산출 데이터, 흐름도(mermaid)
