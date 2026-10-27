# FSD · 3. 브리핑 데스크

계산과 프롬프트는 `lib/briefing.ts`(새로 만든다)에 순수 함수로, 테스트는 `tests/briefing.test.ts`. 모델 연결은 제공된 `lib/llm-client.ts`, 숫자 대조는 `lib/number-check.ts`.

## F1. 입력

- 왼쪽 설정 줄: 시도·시군구·동 select(동은 "전체" 없음, 동을 꼭 고른다), 기준 달 select, 사무소 이름과 연락처(한 칸, 예 "신사공인 02-000-0000"), 공공데이터포털 인증키.
- 기준 달 목록: 끝 달(키 모드 `currentYm()`, 예시 모드 `SAMPLE_LATEST_YM`)의 **지난달부터** 거꾸로 12개. 기본값은 첫 번째(= 지난달). 이번 달은 신고가 덜 들어와 고를 수 없다.
- 예시 모드에서는 12개월이 모두 들어 있는 달이 2026년 9월뿐이므로 기준 달을 `202609` 로 고정하고 select 를 비활성한다.
- 고른 값과 사무소 정보는 localStorage `realdeal.desk.selection`.
- 조회 범위: 기준 달로 끝나는 12개월(`monthsBack(기준달, 12)`). 시군구·기준 달이 바뀌면 다시 받는다. 동만 바뀌면 다시 계산만.

## F2. 사실 자료

```ts
// lib/briefing.ts
import type { Deal } from './molit';
import type { AllowedNumbers } from './number-check';

export type Facts = {
  region: string;            // "서울특별시 강남구 대치동"
  month: string;             // "2026년 9월"
  period: string;            // "2025.10 ~ 2026.09"
  monthCount: number;        // 기준 달 거래(해제 제외)
  yearAvgCount: number;      // 12개월 월평균, 소수 한 자리로 반올림한 값
  monthCancelled: number;    // 기준 달에 계약된 거래 중 해제된 건수 (해제가 언제 일어났는지와 무관)
  short: Change;             // 최근 3개월 vs 그 전 3개월
  long: Change;              // 최근 3개월 vs 조회 기간 처음 3개월
  bandLeader: { label: string; count: number; changePct: number | null; changePctText: string | null } | null; // 12개월 거래 최다 면적대
  months: { label: string; count: number; perPyeong: number | null; perPyeongText: string | null }[]; // 최근 6개월, 표용
  topDeals: DealFact[];      // 기준 달 해제 제외 금액 상위 3
  highs: (DealFact & { previousHigh: string; previousHighValue: number })[]; // 기준 달 거래 중 같은 단지·평형 12개월 최고가 경신, 최대 3
};
/** 숫자는 값(value)과 화면·모델용 표기(text)를 함께 둔다. 숫자 대조는 value 로 한다 */
export type Change = {
  from: number | null; fromText: string | null;   // 3.3㎡당 만원 (반올림 전 값)
  to: number | null; toText: string | null;
  pct: number | null; pctText: string | null;     // 부호 있는 퍼센트, 예 8.63 / "+8.6%"
  direction: 'up' | 'down' | 'flat' | 'unknown';
};
export type DealFact = { apt: string; area: string; areaValue: number; floor: number; price: string; priceValue: number; date: string };

export function buildFacts(deals: Deal[], dong: string, endYm: string, regionName: string): Facts;
export function allowedNumbers(facts: Facts): AllowedNumbers;
```

규칙:
- 거래 = 동 필터 + `validDeals`. 평당가 구간 값은 1번 시나리오와 같은 방식(구간 거래를 합친 중위값, 3건 미만이면 null).
- Change.direction: pct ≥ +1.0 up, ≤ −1.0 down, 그 사이 flat, null 이면 unknown. 표기는 `formatPerPyeong`, `formatPct`.
- `months[].perPyeong`: 그 달 거래 3건 미만이면 null(표에 "-").
- `highs`: 기준 달 정상 거래 중, 같은 단지(aptName+jibun)·평형(Math.floor 면적)의 **기준 달 이전 11개월** 정상 거래 최고가보다 비싼 것. 이전 거래가 없으면 제외.
- area 표기는 `84㎡`(areaValue = Math.floor), date 는 `9월 21일`, price 는 `formatManwon`.
- "같은 단지"는 `sggCd|dong|aptName|jibun`, "같은 평형"은 그에 Math.floor(면적)을 더한 열쇠로 가린다.
- `allowedNumbers`: Facts 안의 **value 필드들**로 만든다. money = 평당가 값(반올림 전 값과 Math.round 값 둘 다)·거래 금액·previousHighValue. percent = pct·changePct(부호 그대로). plain = 건수·평균·해제 수·areaValue 와 문장에 늘 나오는 고정 숫자 `1, 3, 6, 12`("1년", "3개월", "6개월", "12개월"), `3.3`("3.3㎡당"), `60, 85, 135`(면적대 이름 "60~85㎡"). names = facts 에 나오는 단지명(topDeals·highs 의 apt)과 동 이름(숫자가 든 이름만 의미가 있다, 예 "개포주공5단지"). 테스트에 "facts 의 표기를 그대로 옮긴 정상 문장은 unknown 0개"를 꼭 넣고, 예시 데이터 개포동 202609 처럼 숫자 든 단지명이 있는 경우로 확인한다. 모델에게 보내는 JSON 에는 value 와 text 가 둘 다 들어가도 된다.

## F3. 프롬프트

```ts
export const DEFAULT_RULES = `결론을 먼저, 숫자는 근거로.
단기와 중장기를 나눠 말한다.
한 문장은 한 줄을 넘기지 않는다.
앱이 준 숫자만 쓴다.`;

export function buildPrompt(facts: Facts, userRules: string): { system: string; user: string };
export type BriefingText = { headline: string; shortTerm: string; longTerm: string };
export function parseBriefing(modelText: string): BriefingText; // 실패하면 Error
```

system:
```
너는 부동산 중개사무소의 월간 시장 브리핑을 쓰는 사람이다.
아래 규칙을 지킨다.
- '자료' JSON 에 있는 숫자만 쓴다. 더하거나 빼거나 새 숫자를 만들지 않는다.
- 숫자는 자료의 표기 문자열을 그대로 옮긴다.
- 매수나 매도를 권하지 않는다. 폭등, 폭락, 역대급, 무조건 같은 말을 쓰지 않는다.
- direction 이 unknown 이면 "거래가 적어 판단하기 이르다"는 취지로 쓴다.
- 답은 아래 JSON 하나로만 한다. 앞뒤에 다른 글을 붙이지 않는다.
{"headline": "제목, 25자 이내, 마침표 없이", "shortTerm": "단기 판단, 두 문장 이내", "longTerm": "중장기 판단, 두 문장 이내"}
[사용자 작성 규칙]
{userRules}
```

user: `자료:\n` + `JSON.stringify(facts, null, 2)`.

parseBriefing: 첫 `{` 부터 마지막 `}` 까지 잘라 JSON.parse, 세 칸이 모두 비지 않은 문자열인지 확인. 앞뒤 공백 제거. headline 끝 마침표 제거.

## F4. 쓰기 흐름

1. "브리핑 쓰기" → `askModel(settings, buildPrompt(facts, rules))` (답 길이 상한은 기본값 4000 을 쓴다. 생각을 오래 하는 모델도 잘리지 않게).
2. parseBriefing 실패 또는 `TRUNCATED` 오류 → 같은 요청을 한 번 더. 또 실패 → "모델 답을 읽지 못했습니다. 다른 모델을 골라 보세요."
3. 세 칸마다 `findUnknownNumbers(text, allowedNumbers(facts))`.
4. 결과 저장: localStorage `realdeal.desk.brief.{lawdCd}.{dong}.{ym}` = `{ text, model, at, tokens, factsKey }`. 숫자 대조 결과는 저장하지 않는다. 다시 열 때 API_LLM.md 3절 "저장한 결과를 다시 열 때"대로 factsKey 를 비교하고 지금 facts 로 다시 대조한다. `export function factsKey(facts: Facts): string` 를 `lib/briefing.ts` 에 만든다.
5. 쓰는 동안 문서의 판단 자리에 회색 줄 3개, 버튼은 "쓰는 중…" + 중지.

## F5. 숫자 표시

```ts
export type Segment = { text: string; kind: 'plain' | 'verified' | 'unknown' };
export function markNumbers(text: string, unknown: NumberToken[]): Segment[];
```
- `extractNumbers(text)` 로 나눈 숫자 조각 중 unknown 에 든 것(같은 index) → 'unknown', 나머지 숫자 → 'verified', 숫자 아닌 글 → 'plain'. 날짜·층처럼 검사 대상이 아닌 숫자는 'plain'.
- verified: 1px 점선 밑줄(종이 강조색). unknown: 빨간 물결 밑줄 + `title="자료에 없는 숫자"`.
- unknown 이 하나라도 있으면 문서 위(인쇄되지 않는 자리)에 경고 띠: "자료에 없는 숫자가 {n}개 있습니다. 고치거나 다시 쓰세요." + "다시 쓰기".

## F6. 문서

A4 비율 종이(최대 폭 600, 인쇄 시 A4 꽉 차게):
1. 머리: 왼쪽 "{동} 아파트 시장 브리핑"(13/700), 오른쪽 "{YYYY년 M월}", 아래 2px 선.
2. 제목: headline (Noto Serif KR 32/900). 모델 전이면 "{동}, {M}월 시장" 기본 제목.
3. 판단 묶음: 왼쪽 3px 강조선, 라벨 "분석 모델이 쓴 판단", shortTerm, longTerm (17, 줄높이 1.75). 모델 전이면 "모델을 연결하면 여기에 판단 문장이 채워집니다."
4. 표 "최근 6개월": 열 = 달, 행 = 거래(건), 3.3㎡당(만). 기준 달 열 굵게.
5. "{M}월 눈여겨볼 거래": topDeals 3줄. highs 에 든 거래는 뒤에 "· 1년 최고" 를 붙인다. highs 가 topDeals 밖에 있으면 최대 2줄 더.
6. 해제가 있으면 한 줄: "이달 계약분 중 해제된 {n}건은 통계에서 뺐습니다." (해제가 일어난 날이 아니라 계약월 기준이다)
7. 바닥: "{사무소 이름과 연락처}" · "점선 숫자는 국토부 원자료와 대조했습니다". 모델을 썼으면 그 아래 작게 "문장 작성: {모델 id}".

## F7. 인쇄

- `@media print`: 문서(`article`)만 보이게, 배경 흰색, 그림자 없음, `@page { size: A4; margin: 16mm; }`, 경고 띠·버튼 숨김.
- "인쇄"와 "PDF로 저장" 둘 다 `window.print()`. PDF 버튼 옆 작은 글 "인쇄 창에서 'PDF로 저장'을 고르세요".

## F8. 모델 연결 판

`docs/API_LLM.md` 2절 그대로 오른쪽 판에. 아래에 "모델에게 주는 작성 규칙" textarea(기본 DEFAULT_RULES, localStorage `realdeal.desk.rules`, "기본값으로" 링크), 큰 버튼 "브리핑 쓰기", 토큰 수 표시.

## 테스트 (tests/briefing.test.ts)

- `buildFacts`: 예시 데이터 강남구 · 대치동 · 202609 에서 months 6개, topDeals ≤ 3, monthCount 가 직접 센 값과 같다
- `buildFacts`: 해제 거래는 topDeals 에 없다
- `highs`: 가짜 Deal 로 이전 최고 22억 6천 → 23억 5천 경신 1건, previousHigh 표기 "22억 6,000"
- `allowedNumbers` + `findUnknownNumbers`: facts 의 표기 문자열을 그대로 쓴 문장은 unknown 0개, 숫자 하나를 바꾸면 1개
- `parseBriefing`: 앞뒤에 설명이 붙은 답, 코드 블록(```json)에 싸인 답을 모두 읽는다. 칸이 빠지면 Error
- `markNumbers`: verified/unknown/plain 조각 순서
