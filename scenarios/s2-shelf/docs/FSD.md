# FSD · 2. 단지 서랍

계산은 `lib/shelf.ts`(새로 만든다)에 순수 함수로, 테스트는 `tests/shelf.test.ts`.

## 공통 정의

```ts
// lib/shelf.ts
import type { Deal } from './molit';

/** 단지 하나. 같은 시군구·동 안에서 이름 + 지번으로 구별한다. */
export type ComplexRef = { lawdCd: string; dong: string; aptName: string; jibun: string };

export const complexKey = (c: ComplexRef): string => `${c.lawdCd}|${c.dong}|${c.aptName}|${c.jibun}`;

export type Favorite = ComplexRef & { buildYear: number | null; addedAt: string };

export type PeriodYears = 1 | 2 | 3;
```

- 거래가 어느 단지 것인지: `deal.sggCd === lawdCd && deal.dong === dong && deal.aptName === aptName && deal.jibun === jibun`.
- **평형 묶음(areaGroup)**: `Math.floor(deal.areaM2)` (84.97 → 84). 표시는 `84㎡`. 같은 단지 안에서 84.97 과 84.99 를 한 묶음으로 본다.
- **주력 평형**: 기간 안 해제 제외 거래가 가장 많은 areaGroup. 같으면 더 큰 면적.
- 기간: 1년 / 2년(기본) / 3년. 끝 달은 키 모드 `currentYm()`, 예시 모드 `SAMPLE_LATEST_YM`. 예시 모드는 1년만(2·3년 비활성).

## F1. 동 고르기와 단지 목록

```ts
export type ComplexRow = ComplexRef & {
  dealCount: number;            // 해제 제외
  latest: Deal | null;          // 해제 제외 가장 최근 계약
  buildYear: number | null;
};
export function listComplexes(deals: Deal[], lawdCd: string, dong: string): ComplexRow[];
```

- 동의 거래를 단지별로 묶어 `dealCount` 내림차순, 같으면 이름 가나다순.
- 화면: 상단 알약의 검색칸 옆 "동 고르기" 버튼 → 시도·시군구·동 select 3개가 든 작은 판(popover)이 열린다. 고르면 그 시군구 기간 데이터를 받고(F5 캐시) 단지 목록을 아래 "이 동의 단지" 띠에 보여 준다.
- 검색칸: 현재 띠에 보이는 단지 이름을 거른다(대소문자·공백 무시 부분 일치).

## F2. 즐겨찾기 저장

- localStorage `realdeal.shelf.favorites` 에 `Favorite[]`(최대 12). 13번째를 담으려 하면 "서랍은 12곳까지입니다" 안내.
- 담은 순서 유지. 대표 카드는 `realdeal.shelf.featured`(complexKey)에 저장, 없으면 첫 단지.
- 별 버튼: `aria-pressed`, `aria-label` = "즐겨찾기: {단지}" / "즐겨찾기 해제: {단지}".

## F3. 대표 카드 계산

```ts
export type AreaRange = { area: number; min: number; max: number; latest: number; count: number };
export type FeaturedCard = {
  ref: ComplexRef;
  buildYear: number | null;
  dealCount: number;
  latest: Deal | null;
  isPeriodHigh: boolean;        // latest 가 같은 areaGroup 기간 최고가 이상
  mainArea: number | null;      // 주력 평형
  points: { date: string; price: number; area: number; main: boolean; cancelled: boolean }[];
  ranges: AreaRange[];          // areaGroup 오름차순, 해제 제외
};
export function featuredCard(deals: Deal[], ref: ComplexRef): FeaturedCard;
```

화면:
- 제목: 단지명 25px, 아래 "{동} · {buildYear}년 준공, 최근 {기간} {dealCount}건".
- 큰 숫자: `formatManwon(latest.priceManwon)` 40px 고정폭 + "{area}㎡, {floor}층, {M월 D일}" + isPeriodHigh 면 알약 "{기간} 최고가".
- **거래 점 그림**(SVG viewBox 620×200): x = 날짜(기간 첫날~끝날 선형), y = 금액(억). y 눈금은 5억 단위 3개 안팎(범위가 좁으면 1억 단위). 점 지름 12, 흰 테두리 2px. 주력 평형 = `--accent`, 나머지 = `--dot-muted`, 해제 = 속 빈 점선 원. 주력 평형 정상 거래를 날짜순으로 잇는 1.5px 선(35% 투명도). 마지막 주력 거래 점은 지름 14.
  - 다른 평형 점 중 가장 비싼 것 하나에만 "{area}㎡ {금액}" 글을 붙인다. 해제 점 하나에 "해제".
  - 아래 x 라벨: 첫 달, 가운데 달, 끝 달 `YYYY.MM`.
  - 그림 위 설명 13px: "거래 한 건이 점 하나 · 파란 점이 {mainArea}㎡".
- **평형별 가격 폭**: 행마다 [평형 64px][띠][범위 글 120px]. 띠의 가로 눈금은 모든 행 공통(전체 최저~최고, 앞뒤 3% 여유). 1px 회색 기준선 위에 `--accent-band` 띠(높이 8, 둥근 끝), 최근 거래 위치에 지름 14 강조 점. 거래 1건이면 띠 대신 점만 + 글 "{가격} 1건".
- 범위 글: `16.5~17.2억` (억 단위 소수 한 자리).

## F4. 작은 카드

```ts
export type SideCard = {
  ref: ComplexRef;
  latest: Deal | null;  // 주력 평형의 가장 최근 정상 거래 (큰 숫자와 note 가 같은 거래를 말하게)
  spark: number[];      // 주력 평형 정상 거래 금액, 날짜순 (최근 24개)
  note: string;
};
export function sideCard(deals: Deal[], ref: ComplexRef, periodLabel: string): SideCard;
```

note 규칙(주력 평형 기준, latest 는 주력 평형의 최근 정상 거래):
1. 거래 0건: "{기간} 동안 거래가 없습니다."
2. latest 가 그 평형 기간 최고가 이상: "{area}㎡, {M월 D일}. 이 단지 {기간} 거래 중 가장 높습니다."
3. d = (latest − 그 평형 기간 중위값) ÷ 중위값 × 100
   - d ≥ 3: "최근 거래가 {기간} 중위값보다 {d}% 높습니다."
   - d ≤ −3: "최근 거래가 {기간} 중위값보다 {|d|}% 낮습니다."
   - 그 밖: "{area}㎡는 {기간} 중위값 근처에서 거래됐습니다."
   - d 는 소수 한 자리.

화면: 카드 하나 = 이름 20px, 큰 숫자 32px 고정폭, 가는 선(SVG 300×50, spark 를 그대로 잇는다, 2개 미만이면 선 없이 "거래 1건"), note 15px.
- 서랍의 **두 번째 단지 카드만** 강조 카드(강조색 바탕, 흰 글씨)로 그린다(DESIGN 5절). 나머지는 흰 카드.
- 카드 구조(버튼 안에 버튼을 넣지 않는다): 바깥은 `<article>`. 안에 **형제로** 두 버튼을 둔다. ① 카드 내용 전체를 덮는 "대표로 보기" `<button>`(이름·금액·선·해설을 품고, `aria-label` = "{단지} 대표로 보기") ② 오른쪽 위 별 `<button>`. 별 버튼은 `position: absolute` 로 ① 위에 겹쳐 놓고 z-index 를 한 단계 높인다.

## F5. 데이터 받기와 캐시

- 서랍과 띠에 필요한 시군구 목록 = 즐겨찾기들의 lawdCd ∪ 지금 고른 동의 lawdCd.
- 시군구마다 `fetchDeals` 한 번(기간 전체). 여러 시군구면 차례로.
- **세션 캐시**: `Map<"lawdCd|첫달|끝달|sample", Deal[]>` 를 모듈 변수로 둔다. 같은 키는 다시 받지 않는다. 기간을 바꾸면 키가 달라져 다시 받는다. 새로고침하면 비워진다.
- 진행 표시: 상단 알약 아래 얇은 띠 "강남구 7 / 24개월 받는 중 · 시군구 1 / 2" + 중지.
- 한 시군구가 실패하면 그 시군구의 카드에만 오류 표시("다시 받기" 버튼), 나머지는 그린다.

## F6. 이 동의 다른 단지 띠

- 현재 동의 `listComplexes` 중 서랍에 없는 것, 최대 30개, 가로 스크롤.
- 칩: ☆ + 이름 + 건수(고정폭). 누르면 서랍에 담긴다.
- 동을 아직 고르지 않았으면 띠 대신 "동을 고르면 그 동의 단지가 여기에 나옵니다" + "동 고르기" 버튼.

## F7. 빈 서랍

- 즐겨찾기 0개: 제목 "아직 담은 단지가 없습니다", 한 줄 "동을 고르고 단지 옆 별을 누르세요.", 큰 버튼 "동 고르기". 예시 데이터 버튼도 함께(강남구 대치동을 열고 거래 많은 두 단지를 담아 준다).

## F8. 인증키와 예시 모드

STACK.md 6절. 인증키 칸은 상단 알약 안. 예시 모드에서는 동 고르기 판의 시도·시군구가 서울특별시·강남구로 고정된다. 예시 모드에서 담은 즐겨찾기는 `sample: true` 표시를 달아, 키 모드로 바꾸면 그대로 실제 데이터로 다시 받는다.

## 테스트 (tests/shelf.test.ts)

예시 데이터 `sampleMonth` 12개월로:
- `listComplexes(…, '11680', '대치동')` 가 비어 있지 않고 dealCount 내림차순
- 같은 aptName 다른 jibun 이 따로 묶이는지(가짜 Deal 두 개로)
- `featuredCard`: 해제 거래가 points 에는 있고 ranges 계산에는 없음
- `featuredCard`: 주력 평형 동률이면 큰 면적
- `sideCard` note 규칙 4가지(가짜 Deal 로)
- areaGroup: 84.97 과 84.01 이 같은 묶음
