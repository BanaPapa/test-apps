# FSD · 1. 동네 흐름

기능 명세. 각 기능은 **입력 → 처리 → 출력 → 예외** 순서로 적었다. 계산은 모두 `lib/flow.ts`(새로 만든다)에 순수 함수로 두고 `tests/flow.test.ts` 로 확인한다. 화면 컴포넌트는 계산 결과를 그리기만 한다.

## 공통 정의

```ts
// lib/flow.ts
import type { Deal } from './molit';

export type PeriodMonths = 6 | 12 | 36;

export type FlowInput = {
  deals: Deal[];          // 시군구 전체, 받은 그대로
  dong: string | null;    // null = 시군구 전체
  months: string[];       // YYYYMM, 오래된 순. 길이 = 기간
  regionName: string;     // "신사동" 또는 "강남구" (결론 문장에 쓰는 이름)
};
```

- "거래" = `validDeals()` 를 거친 것(해제 제외). 표 목록만 해제 포함.
- 동 필터: `dong` 이 있으면 `deal.dong === dong`.
- **구간 값(window median)**: 연속한 달 묶음의 거래를 모두 합쳐 평당가 중위값을 낸 것. 거래가 `MIN_SAMPLE`(3) 미만이면 null.

## F1. 지역·기간 고르기

- 입력: 시도 select → 시군구 select → 동 select(맨 위 "전체") → 기간 세그먼트(6개월/1년/3년, 기본 1년) → "조회" 버튼.
- 시도·시군구 목록은 `listSido()`, `listSigungu(sidoCode)`, 동은 `listDongs(lawdCd)`.
- 기본값: 서울특별시 / 강남구 / 신사동 / 1년.
- 고른 값은 localStorage `realdeal.flow.selection` 에 저장하고 다음에 열 때 되살린다(try/catch).
- **다시 받는 조건**: 시군구 또는 기간이 바뀌고 "조회"를 누를 때만. 동만 바꾸면 이미 받은 목록으로 즉시 다시 계산한다(조회 버튼 없이).
- 예시 모드: 시도·시군구 select 를 서울특별시·강남구로 고정하고 비활성. 동과 기간은 고를 수 있다. 기간 3년은 예시 데이터가 13개월뿐이므로 비활성 + 툴팁 "예시 데이터는 13개월".
- 끝 달: 키 모드는 `currentYm()`, 예시 모드는 `SAMPLE_LATEST_YM`. 기간 목록 = `monthsBack(끝달, 기간)`.

## F2. 받기와 진행 표시

- `fetchDeals({ lawdCd, months, key, sample, onProgress, signal })` 한 번.
- 받는 동안: 조회 버튼 자리에 `n / N개월 받는 중` + 진행 막대 + "중지" 버튼(AbortController). 결과 자리에 회색 뼈대.
- 중지하면 받은 데까지 버리고 이전 결과(있으면)를 그대로 둔다.
- 오류는 STACK.md 7절과 API_MOLIT.md 6절대로. `KEY_INVALID` 면 인증키 상태를 `키 오류` 로.

## F3. 결론 문장

```ts
export type Headline = {
  /** "신사동 아파트, 1년 새 3.3㎡당 8.6% 올랐습니다" */
  text: string;
  /** 강조할 부분(변화율 문자열). 없으면 null */
  emphasis: string | null;
  direction: 'up' | 'down' | 'flat' | 'unknown';
  /** "2025년 10월부터 2026년 9월까지 신고된 73건. 해제 거래는 뺐고, 가격은 전용면적 기준 중위값입니다." */
  sub: string;
};
export function buildHeadline(input: FlowInput): Headline;
```

처리:
1. 시작 구간 = 기간의 **처음 3개월**, 끝 구간 = **마지막 3개월**(6개월 기간도 동일). 각 구간 값(window median)을 낸다.
2. 둘 다 있으면 변화율 `changePct(시작, 끝)`.
   - `>= +1.0` → up: "{이름} 아파트, {기간말} 새 3.3㎡당 {+x.x%} 올랐습니다"
   - `<= -1.0` → down: "… {x.x%} 내렸습니다" (부호 없이 숫자, 예 "2.3%")
   - 그 사이 → flat: "{이름} 아파트, {기간말} 동안 3.3㎡당 가격이 제자리입니다"
   - 기간말: 6 → "6개월", 12 → "1년", 36 → "3년".
3. 어느 한쪽이 null → unknown: "{이름} 아파트는 거래가 적어 흐름을 말하기 어렵습니다".
4. sub: "{첫달 'YYYY년 M월'}부터 {끝달}까지 신고된 {건수}건. 해제 거래는 뺐고, 가격은 전용면적 기준 중위값입니다."
5. 이름: 동이 있으면 동 이름, 없으면 시군구 이름.

예외: 기간 전체 거래 0건 → 결론 영역 대신 "결과 0건" 상태(STACK 7절).

## F4. 3.3㎡당 중위 가격 차트

```ts
export type PricePoint = { ym: string; value: number | null; count: number; thin: boolean };
export function pricePoints(input: FlowInput): PricePoint[];
```

- 달마다 `monthlyStats` 의 medianPerPyeong. `count < MIN_SAMPLE` 이면 `thin: true`(값은 있으면 그대로 둔다, 0건이면 null).
- 그리기(SVG, viewBox 1000×300):
  - y축: 값 범위의 위아래 5% 여유. 눈금 3개, 보기 좋은 숫자(100 단위)로 반올림. 왼쪽에 고정폭 숫자.
  - 선: 2.5px 강조색. thin 인 점과 그 앞뒤 선분은 점선(4 4), 점은 속이 빈 원.
  - null 인 달은 선을 끊는다.
  - 선 아래 면: 강조색 7% 투명도.
  - 설명 3개: ① 기간 중 최고값 점 "{M}월 {값}, {기간말} 최고"(최고가 마지막 달이면 이 하나만) ② 마지막 점 값 ③ 첫 점 값(작게). 서로 겹치면 ③을 뺀다.
  - x축: 첫 달 `YYYY.MM`, 해가 바뀌는 달 `YYYY.MM`, 그 밖에 3개월마다 `MM`, 마지막 달.
  - `aria-label`: "중위 평당가가 {첫달} {값}에서 {끝달} {값}으로 {변화}".
- 점에 마우스를 올리면(또는 터치) 작은 상자: "{YYYY.MM} · {값} · 거래 {n}건".

## F5. 월별 거래량 차트

- 달마다 막대(HTML 또는 SVG). 높이 = count / 기간 최대 count.
- 최근 3개월 막대는 글자색(진한 색), 나머지는 옅은 회색. 막대 위에 건수.
- 아래 한 줄: "최근 3개월 월평균 {a}건, {기간말} 평균 {b}건." 소수 한 자리. a ≥ b × 1.2 이면 앞에 "거래가 늘었습니다." a ≤ b × 0.8 이면 "거래가 줄었습니다." 붙인다.
- 36개월이면 막대가 가늘어진다. 막대 사이 간격을 2px 로 줄이고 건수 글자는 뺀다(툴팁으로만).

## F6. 면적대별 작은 차트

```ts
export type BandCard = {
  band: AreaBand;
  label: string;           // AREA_BAND_LABEL
  points: (number | null)[]; // 달별 중위 평당가
  latest: number | null;   // 끝 구간 값
  changePct: number | null;
  total: number;           // 기간 거래 수
  thin: boolean;           // latest 또는 시작 구간이 null
};
export function bandCards(input: FlowInput): BandCard[];
```

- 4칸 고정, 2×2 격자. 각 칸: 이름, 가는 선 차트(SVG 160×44), 최근 값(`formatPerPyeong`), 변화율.
- thin 이면 선은 회색 점선, 값 자리에 "{total}건뿐", 변화율 자리에 "표본 부족".

## F7. 거래 표와 CSV

- "거래 {n}건 표로 보기" 링크를 누르면 아래에 표가 펼쳐진다. n 은 해제 포함 전체 건수(동 필터 적용).
- 열: 계약일 · 단지명 · 동 · 전용면적(`formatArea`) · 층 · 금액(`formatManwon`) · 3.3㎡당 · 건축년도. 숫자 열 오른쪽 정렬.
- 기본 정렬: 계약일 최신순. 머리글 클릭으로 정렬 전환(▲▼ 표시). 해제 거래는 행 흐리게 + 금액 취소선 + "해제" 꼬리표.
- 한 번에 100행, 아래에 "더 보기".
- CSV: 같은 열 + 해제여부·해제일. 금액은 숫자(만원) 그대로. 첫 바이트에 UTF-8 BOM(`﻿`). 파일명 `실거래_{지역}_{첫달}-{끝달}.csv`. 값에 쉼표·따옴표가 있으면 따옴표로 감싼다.

```ts
export function toCsv(deals: Deal[]): string;
```

## F8. 인증키와 예시 모드

STACK.md 6절 그대로. 머리줄 오른쪽에 둔다. 첫 화면(키 없음)에는 결론 자리에 안내와 두 버튼: "예시 데이터로 먼저 보기"(강남구 신사동 1년을 바로 조회) / "인증키 받는 법".

## 테스트 (tests/flow.test.ts)

예시 데이터(`sampleMonth`)로 실제 값을 확인한다.

- `buildHeadline`: 강남구 전체 12개월(202511~202610)에서 direction 이 'up'/'down'/'flat' 중 하나이고 text 에 "강남구 아파트" 가 들어간다
- `buildHeadline`: 거래 0건 동(없는 이름)이면 unknown
- `pricePoints`: 길이 = 기간, 0건 달은 null
- `bandCards`: 항상 4개, 순서 고정
- `toCsv`: 첫 글자 BOM, 쉼표 든 단지명을 따옴표로 감쌈, 해제 거래 포함
- 경계: 시작 구간 거래 2건 → unknown
