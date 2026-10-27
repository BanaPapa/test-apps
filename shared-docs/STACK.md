# STACK.md · 공통 개발 규칙

이 문서는 6가지 시나리오 키트가 모두 따르는 규칙이다. 시나리오별 문서(PRD·FSD·DESIGN)와 부딪히면 **시나리오 문서가 이긴다.** 그 밖의 경우에는 이 문서를 따른다.

## 1. 기술 스택 (바꾸지 않는다)

| 항목 | 정한 것 | 이유 |
|---|---|---|
| 프레임워크 | Next.js 16 App Router + TypeScript | 내 PC 실행과 Vercel 배포가 같은 코드로 된다 |
| 런타임 | Node.js 22 이상 | Next.js 16 은 20.9 이상이면 되지만, 자동 실행의 .env.local 읽기(process.loadEnvFile)와 GitHub Actions 가 22 를 쓴다 |
| 스타일 | `app/globals.css` 의 CSS 변수 + 컴포넌트별 CSS Module(`*.module.css`) | 디자인 토큰을 한 곳에서 바꿀 수 있다 |
| 차트 | 직접 그린 SVG (차트 라이브러리 금지) | 디자인 시안과 똑같이 그리기 쉽고 설치할 것이 없다 |
| 테스트 | Vitest (`npm test`) | 계산·변환 함수 확인용 |
| 상태 관리 | React `useState`/`useReducer` 만 | 화면 하나짜리 앱이다 |

설치하지 않는 것: Tailwind, UI 컴포넌트 라이브러리(shadcn, MUI 등), 차트 라이브러리, 상태관리 라이브러리, axios. 꼭 필요하다고 판단되면 먼저 사용자에게 묻는다.

## 2. 폴더 구조

```
app/
  layout.tsx            제공됨. 글꼴 <link> 와 메타데이터만 고친다
  page.tsx              첫 화면. BUILD_PLAN 1단계에서 만든다
  globals.css           DESIGN.md 의 토큰을 옮긴다
  api/molit/route.ts    제공됨. 국토부 프록시
  api/llm/route.ts      제공됨(3·4·5번만). 분석 모델 프록시
components/             화면 조각. 파일 하나에 컴포넌트 하나, 300줄을 넘기지 않는다
lib/                    제공된 부품 + 새로 만드는 계산 함수
data/regions.json       제공됨. 시도·시군구·법정동 코드
data/sample/            제공됨. 예시 데이터(강남구 13개월 실제 응답)
tests/                  제공된 테스트 + 새 계산 함수의 테스트
design/mockup.html      목표 화면. 브라우저로 열어 볼 수 있다
design/preview.png      목표 화면 그림
docs/                   이 문서들
```

5·6번은 여기에 `scripts/`, `config/`, `state/`, `.github/workflows/daily.yml` 이 더 있다. `docs/AUTOMATION.md` 참고.

## 3. 제공된 부품 (고치지 말고 가져다 쓴다)

| 파일 | 하는 일 | 화면 코드에서 import |
|---|---|---|
| `lib/client.ts` | 인증키 저장, 여러 달 받아오기(`fetchDeals`) | 가능 |
| `lib/constants.ts` | 예시 데이터 지역·달, 최대 개월 수, 키 발급 주소 | 가능 |
| `lib/months.ts` | `monthsBack`, `monthsBetween`, `currentYm` | 가능 |
| `lib/stats.ts` | 평당가, 중위값, 면적 구간, 달별 통계, 금액·면적·날짜 표기 | 가능 |
| `lib/regions.ts` | 지역 목록 조회 | 가능 |
| `lib/molit.ts` | 국토부 API 호출, 응답 해석, 오류 분류, `Deal` 형식 | **타입만** (`import type`) |
| `lib/sample.ts` | 예시 데이터 읽기 | 불가(서버 전용) |
| `app/api/molit/route.ts` | 브라우저 → 국토부 중계 | 해당 없음 |
| `lib/llm-client.ts`, `lib/number-check.ts` | 3·4·5번: 모델 연결 설정 보관·호출, 숫자 대조 | 가능 |
| `lib/llm.ts`, `app/api/llm/route.ts` | 3·4·5번: 제공사 호출 | **타입과 `PROVIDERS`만** |
| `lib/snapshot.ts`, `lib/slack.ts`, `.github/workflows/daily.yml` | 5·6번: 전날과 비교, 슬랙 전송, 매일 실행 | 불가(서버·스크립트 전용) |

이 부품들은 실제 국토부 응답으로 검증돼 있고 `tests/` 에 테스트가 있다. **고쳐야 할 것 같으면 고치기 전에 이유를 사용자에게 말한다.** 기능이 더 필요하면 새 파일을 만들어 감싼다.

## 4. 데이터 흐름

```
[화면] --fetchDeals()--> [/api/molit] --fetchMonth()--> [국토부 API]
   인증키는 브라우저 localStorage 에만 저장되고, 요청마다 x-molit-key 헤더로 실려 간다.
   서버는 키를 저장하지 않는다. 헤더가 비면 .env.local 의 MOLIT_API_KEY 를 쓴다.
```

- 화면 코드는 국토부 주소를 직접 부르지 않는다. 항상 `lib/client.ts` 의 `fetchDeals` 를 쓴다.
- 한 번에 받는 기간은 최대 36개월. 달 사이에 0.3초 쉬는 것은 `fetchDeals` 가 이미 한다.
- 같은 조건을 다시 조회하면 다시 받는다(캐시하지 않는다). 단, 화면 안에서 필터만 바꾸는 것은 이미 받은 목록으로 계산한다.

## 5. 숫자 규칙 (모든 시나리오 공통)

| 항목 | 규칙 | 함수 |
|---|---|---|
| 금액 단위 | 국토부 원자료는 만원. 화면 표기는 `23억 5,000`, `8,500만` | `formatManwon` |
| 평당가 | 거래금액 ÷ (전용면적 ÷ 3.3058). 3.3㎡당 만원 | `pricePerPyeong` |
| 대표 가격 | 평균이 아니라 **중위값** | `median` |
| 해제 거래 | 건수·가격 통계에서 **뺀다**. 목록에서는 지우지 않고 흐리게 + 취소선 | `validDeals` |
| 면적 구간 | 60 이하 / 60~85 / 85~135 / 135 초과 (㎡, 경계는 이하) | `areaBand` |
| 표본 부족 | 한 구간·한 달의 거래가 3건 미만이면 값 대신 "표본 부족" | `MIN_SAMPLE` |
| 변화율 | 소수 한 자리, 부호 붙임 `+8.6%` | `formatPct` |
| 날짜 | `2026.09.21` | `formatDate` |
| 오르내림 색 | 한국 관례: 오름 = 빨강 계열, 내림 = 파랑 계열 | DESIGN 토큰 |

## 6. 인증키 입력칸 (모든 시나리오 공통)

- 화면에 늘 보이는 자리(시나리오 DESIGN.md 가 정한 곳)에 둔다.
- `<input type="password">`, 라벨 "공공데이터포털 인증키". 저장하면 끝 4자리만 보인다(`maskKey`).
- 상태 표시: `저장 안 됨` / `저장됨` / `연결 확인됨`(조회 성공 후) / `키 오류`(KEY_INVALID 를 받았을 때).
- 키가 없을 때 첫 화면에 **"예시 데이터로 먼저 보기"** 버튼을 둔다. 누르면 강남구 예시 데이터(`sample: true`)로 같은 화면이 뜨고, 화면 위에 "예시 데이터" 표시가 붙는다.
- 키 발급 안내 링크: https://www.data.go.kr/data/15126469/openapi.do (국토교통부_아파트 매매 실거래가 자료).

## 7. 화면 상태 다섯 가지

모든 데이터 화면은 아래 다섯 상태를 다 그린다. 빠뜨리면 미완성이다.

| 상태 | 보여줄 것 |
|---|---|
| 처음 | 무엇을 고르면 되는지 한 줄 + 예시 데이터 버튼 |
| 받는 중 | `3 / 12개월 받는 중` 진행 표시 + 중지 버튼. 결과 자리는 회색 뼈대 |
| 결과 0건 | "이 조건에 신고된 거래가 없습니다" + 기간을 늘리는 버튼 |
| 오류 | 서버가 준 `message` 를 그대로 보여주고, 코드에 맞는 다음 행동 버튼(키 다시 넣기 / 다시 시도) |
| 결과 | 시나리오 화면 |

오류는 화면 전체를 덮지 않는다. 결과가 나올 자리에 조용히 띄운다.

## 8. 화면 규칙

- 색·글자 크기·간격은 `globals.css` 의 CSS 변수로만 쓴다. 컴포넌트 안에 `#hex` 를 직접 쓰지 않는다.
- 숫자 열은 오른쪽 정렬 + `font-variant-numeric: tabular-nums`.
- 모든 입력에는 보이는 `<label>` 이 있다. placeholder 를 라벨 대신 쓰지 않는다.
- 버튼은 `<button>`, 이동은 `<a>`. `div` 에 onClick 을 달지 않는다.
- 글자색은 배경 대비 4.5 : 1 이상.
- 가로 768px 미만에서 여러 칸 배치는 한 줄로 쌓인다. 표는 가로 스크롤 상자 안에 둔다.
- 이모지를 아이콘 대신 쓰지 않는다. 화면 문구에 긴 줄표(—)를 쓰지 않는다.
- 차트: 축은 하나만(두 값을 한 차트에 다른 축으로 겹치지 않는다), 선 두께 2px 안팎, 값 라벨은 꼭 필요한 점에만. 차트마다 `role="img"` 와 내용을 설명하는 `aria-label`.

## 9. 코드 규칙

- 인증키·API 키를 코드나 커밋되는 파일에 쓰지 않는다. `.env.local` 은 git 에 올라가지 않는다(.gitignore 에 있음).
- `'use client'` 는 상호작용이 있는 컴포넌트에만 붙인다.
- 원본 배열을 고치지 않는다(`sort` 전에 복사).
- `any` 를 쓰지 않는다. 외부에서 온 값은 `unknown` 으로 받고 좁힌다.
- `console.log` 를 남기지 않는다.
- 새로 만든 계산 함수(`lib/` 아래)에는 `tests/` 에 테스트를 붙인다.

## 10. 끝났다고 말하기 전에

1. `npm test` 통과
2. `npm run build` 통과
3. `npm run dev` 로 띄워 예시 데이터 모드에서 시나리오의 핵심 흐름을 끝까지 눌러 본다
4. `docs/BUILD_PLAN.md` 마지막 단계의 확인 목록을 하나씩 확인한다
5. 사용자에게 실행 주소(http://localhost:3000)와, 실제 키로 확인하는 방법을 알려 준다
