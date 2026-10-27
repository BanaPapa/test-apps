# FSD · 6. 단지 알림

판정 로직은 `lib/alerts.ts`(새로 만든다)에 순수 함수로 두고 `tests/alerts.test.ts` 로 확인한다. `scripts/daily.ts` 와 화면의 "지금 확인"이 **같은 함수**를 쓴다.

## 공통 정의

```ts
// lib/alerts.ts
import type { Deal } from './molit';

export type Condition = 'NEW_DEAL' | 'NEW_HIGH' | 'BELOW' | 'CANCELLED';

export type AlertRule = {
  id: string;            // crypto.randomUUID()
  lawdCd: string;
  dong: string;
  aptName: string;
  jibun: string;
  area: number;          // 평형 묶음 = Math.floor(전용㎡). 예: 84
  condition: Condition;
  price?: number;        // BELOW 일 때만, 만원
  on: boolean;
};

export type AlertConfig = { version: 1; rules: AlertRule[]; sendWhenEmpty: boolean };

export type AlertEvent = {
  ruleId: string;
  condition: Condition;
  deal: Deal;
  /** NEW_HIGH 일 때 이전 최고가(만원) */
  previousHigh?: number;
  /** BELOW 일 때 규칙의 기준가(만원). evaluate 가 rule.price 를 옮겨 담는다 */
  threshold?: number;
};

export const CONDITION_LABEL: Record<Condition, string> = {
  NEW_DEAL: '새 거래가 생기면',
  NEW_HIGH: '최고가를 넘으면',
  BELOW: '{가격} 아래로 거래되면',   // {가격} 은 formatManwon(price) 로 바꾼다
  CANCELLED: '거래가 해제되면',
};
```

- 규칙과 거래가 맞는지: `deal.sggCd === lawdCd && deal.dong === dong && deal.aptName === aptName && deal.jibun === jibun && Math.floor(deal.areaM2) === area`.

## F1. 판정 (핵심)

```ts
export function evaluate(params: {
  rules: AlertRule[];
  added: Deal[];           // 새로 신고된 거래 (diffSnapshot 의 added)
  newlyCancelled: Deal[];  // 새 해제 (diffSnapshot 의 newlyCancelled)
  history: Deal[];         // 최근 24개월 전체(최고가 비교용)
}): AlertEvent[];
```

켜진(`on`) 규칙마다:

| 조건 | 대상 | 맞는 때 |
|---|---|---|
| `NEW_DEAL` | added 중 해제 아닌 것 | 규칙과 맞는 거래 |
| `NEW_HIGH` | added 중 해제 아닌 것 | 그 단지·평형의 **이전 최고가**보다 비싼 거래. 이전 최고가 = history 에서 같은 단지·평형, 해제 아님, **이번 added 에 들어 있지 않은** 거래들의 최고 금액. 비교할 거래가 없으면(첫 거래) 맞지 않는다 |
| `BELOW` | added 중 해제 아닌 것 | `priceManwon <= price` |
| `CANCELLED` | newlyCancelled | 규칙과 맞는 거래 |

- 같은 거래가 같은 규칙에 두 번 걸리지 않게 (ruleId, deal.id) 로 중복을 없앤다.
- 결과 정렬: 조건 순서 NEW_HIGH → BELOW → NEW_DEAL → CANCELLED, 같은 조건 안에서는 금액 내림차순.
- `eventLine`·`buildSlackMessage`·`toHistoryItems` 는 이벤트 안의 값(previousHigh, threshold)만으로 문장을 만든다. 규칙 목록을 다시 찾지 않는다.
- CANCELLED 대상인 newlyCancelled 에는 "기존 거래에 해제가 붙은 것"과 "해제 상태로 처음 확인된 것"이 함께 들어 있다(AUTOMATION.md 2절). 둘 다 "거래가 해제됐습니다"로 알린다.

## F2. 메시지 만들기

```ts
export function eventLine(e: AlertEvent): string;
export function buildSlackMessage(events: AlertEvent[], dateLabel: string, windowLabel: string): SlackMessage; // lib/slack.ts 의 형식
```

eventLine 문장(15px 화면 카드와 슬랙이 같은 문장을 쓴다):
- NEW_HIGH: `가로수힐 84㎡ 23억 5,000 (14층, 9월 21일 계약). 이전 최고 22억 6,000보다 9,000만 높습니다.`
- BELOW: `도산파크 114㎡ 29억 8,000 (9층, 10월 2일 계약). 기준 30억 아래입니다.`
- NEW_DEAL: `신사한강 59㎡ 16억 8,000 (7층, 9월 18일 계약).`
- CANCELLED: `가로수힐 84㎡ 22억 1,000 (9월 5일 계약) 거래가 해제됐습니다.`
- 차이 금액은 `formatManwon(차이)`. "M월 D일" 은 앞자리 0 없이.

슬랙 메시지: 첫 줄 `*{dateLabel} 관심 단지 알림 {n}건*`, 마지막에 작은 줄 `확인 구간 {windowLabel}`, 이어서 조건별 묶음 제목(`최고가 경신`, `기준가 아래`, `새 거래`, `거래 해제`)과 `• eventLine` 목록. text 필드에도 같은 내용을 줄바꿈으로 넣는다. 글은 `slackEscape` 를 거친다.

## F3. 설정 파일

`config/alerts.json` (저장소에 커밋되는 파일, 키를 넣지 않는다):

```json
{
  "version": 1,
  "sendWhenEmpty": false,
  "rules": [
    { "id": "8c1…", "lawdCd": "11680", "dong": "신사동", "aptName": "가로수힐", "jibun": "532", "area": 84, "condition": "NEW_HIGH", "on": true },
    { "id": "f02…", "lawdCd": "11680", "dong": "신사동", "aptName": "도산파크", "jibun": "11", "area": 114, "condition": "BELOW", "price": 300000, "on": false }
  ]
}
```

```ts
export function parseConfig(text: string): AlertConfig;   // 형식이 틀리면 어느 칸이 틀렸는지 한국어로 Error
```

- 키트에는 `config/alerts.json` 예시 파일이 없다. 1단계에서 위 형식의 빈 설정(`rules: []`)을 만든다.
- 화면의 "설정 파일 만들기": 지금 규칙들로 이 JSON 을 2칸 들여쓰기로 만들어 `<pre>` 에 보여 주고 "복사" 버튼. 아래 안내: "GitHub 저장소의 config/alerts.json 을 열고(연필 버튼) 전체를 이것으로 바꾼 뒤 Commit 하세요."

## F4. 매일 실행 스크립트 `scripts/daily.ts`

**말 쓰는 규칙:** 국토부 API 에는 신고일이 없다(`docs/AUTOMATION.md` 2절). 알림 문장과 화면에서 "어제 신고"라고 단정하지 않고 **"새로 확인된"** 이라고 쓴다. `design/mockup.html` 의 "어제 신고됐습니다" 같은 문구는 "새로 확인됐습니다"로 바꿔 쓴다.

```ts
// lib/alerts.ts 에 더한다
/** 규칙이 가리키는 단지 열쇠. diffSnapshot 의 scope 로 쓴다 */
export const ruleComplexKey = (r: Pick<AlertRule, 'lawdCd' | 'dong' | 'aptName' | 'jibun'>): string =>
  `${r.lawdCd}|${r.dong}|${r.aptName}|${r.jibun}`;
export const dealComplexKey = (d: Deal): string => `${d.sggCd}|${d.dong}|${d.aptName}|${d.jibun}`;
```

```
0. loadLocalEnv().
1. config = parseConfig(config/alerts.json). 켜진 규칙이 0개면 "켜진 조건이 없습니다" 출력 후 종료(0, 기록 없음).
2. requireEnv(['MOLIT_API_KEY', 'SLACK_WEBHOOK_URL']) 실패 → 이름을 출력하고 exitCode 1 (기록 없음).
3. 켜진 규칙들의 lawdCd 마다 monthsBack(currentYm(), 24) 를 fetchMonth 로 받는다(달 사이 0.3초).
   하나라도 실패 → FAILED 기록 저장, 슬랙에 "단지 알림 확인 실패: {이유}" 보내기 시도(실패해도 무시), exitCode 1.
   스냅샷 저장 안 함. 끝.
4. watched = 받은 거래 중 dealComplexKey 가 켜진 규칙들의 ruleComplexKey 에 드는 것 (평형 무관, 24개월 전체).
5. r = diffSnapshot(readSnapshot('state/alerts-snapshot.json'), watched,
       { scopeOf: dealComplexKey, scopes: 켜진 규칙들의 ruleComplexKey (중복 제거), newWindow: watchMonths(currentYm()) }).
6. r.baseline → 슬랙에 "단지 알림을 시작합니다. 기준선을 저장했고 다음 확인부터 조건에 맞는 새 거래를 보냅니다. (관심 단지 {n}곳, 조건 {m}개)", 기록 kind BASELINE.
   아니면 events = evaluate({ rules: 켜진 규칙, added: r.added, newlyCancelled: r.newlyCancelled, history: watched }).
     events 가 있으면 buildSlackMessage(events, dateLabel, windowLabel(r.previousAt, now)) 를 보낸다.
     없고 sendWhenEmpty 면 "오늘은 조건에 맞는 새 거래가 없습니다. (확인 구간 …)" 를 보낸다.
     r.newScopes 가 있으면 메시지 끝에 "새로 추가한 단지 {이름들}은 이번에 기준선을 저장했습니다" 를 붙인다(보낼 것이 없으면 이 줄만 보낸다).
7. 슬랙 보내기가 실패하면 → FAILED 기록 저장, exitCode 1, **스냅샷 저장 안 함**(다음 실행이 같은 거래를 다시 보낸다). 끝.
8. writeSnapshot('state/alerts-snapshot.json', r.next). 기록 저장(아래). 콘솔에 한 줄 요약.
```

해제는 받은 24개월 전체에서 찾는다(`diffSnapshot` 규칙). 그보다 오래된 계약의 해제는 잡지 못한다.

`state/alerts-history.json` (배열, 새 것이 앞, 최근 100개):
```ts
export type HistoryItem = {
  at: string;                    // 확인 시각 ISO
  kind: Condition | 'BASELINE' | 'FAILED' | 'EMPTY';
  line: string;                  // eventLine 결과 또는 안내 문장
  windowLabel: string | null;    // 확인 구간
  /** 이벤트일 때만. 화면 카드(최고가 계단 그림 포함)를 다시 그리는 데 필요한 값 전부 */
  event?: {
    ruleId: string;
    dong: string; aptName: string; area: number; floor: number;
    priceManwon: number; contractDate: string;
    previousHigh?: number;       // NEW_HIGH
    threshold?: number;          // BELOW 의 기준가
    cancelDate?: string | null;  // CANCELLED
  };
};
export function toHistoryItems(events: AlertEvent[], at: string, windowLabel: string, rules: AlertRule[]): HistoryItem[];
```
```ts
// lib/alerts-history.ts (따로 만든다. node:fs 사용, scripts 와 라우트 전용. lib/alerts.ts 는 화면에서도 import 하므로 node 모듈을 넣지 않는다)
export function readHistory(path: string): HistoryItem[];   // 없으면 []
export function appendHistory(path: string, items: HistoryItem[], keep = 100): void;
```
이벤트 한 건이 기록 한 줄이다. BASELINE·EMPTY·FAILED 는 event 없이 한 줄.

스크립트는 `lib/` 함수만 조합하는 얇은 파일로 둔다(120줄 이하). 날짜 라벨은 한국 시간 "10월 20일".

## F5. 화면

### 왼쪽: 알림함 (휴대폰 화면 모양, 폭 390)

- 위: 가장 최근 기록의 날짜 "10월 20일 화요일", 큰 제목 "새 소식 {n}건"(그 날짜 기록 중 event 가 있는 것의 수), 오른쪽 "관심 단지 {k}".
- 그 날짜 소식 카드: NEW_HIGH 는 크게(진한 바탕 카드, 큰 금액, `event.previousHigh` → 새 값 계단 그림, 아래 "{floor}층 · {M월 D일} 계약, 새로 확인됐습니다"), 나머지는 옅은 카드.
- "지난 알림" 목록: 날짜 · 한 줄 · 금액.
- 데이터: `GET /api/alerts-history` (새로 만든다) 가 `state/alerts-history.json` 을 읽어 준다. 파일이 없으면 빈 목록. Vercel 에 올릴 때 이 파일이 함께 올라가도록 `next.config.mjs` 에 `outputFileTracingIncludes: { '/api/alerts-history': ['./state/**'] }` 를 더한다. 기록은 마지막 배포(또는 `git pull`) 시점까지다. 화면에 작게 "기록 기준: {가장 최근 at}".
- 기록이 없으면: "아직 받은 알림이 없습니다. 오른쪽에서 조건을 만들고 '지금 확인'을 눌러 보세요."

### 오른쪽: 조건과 연결

- 제목 "이럴 때만 알려주세요" + 한 줄 설명.
- **조건 문장 목록**: `{단지} {평형}㎡가 [{조건}] 알려주세요` + 켜기 체크박스 + 삭제(작은 글자 버튼). 조건 부분은 누르면 조건을 바꾸는 select 가 펼쳐지는 버튼.
- **조건 추가**: "+ 단지 조건 추가" → 단계형 판: ① 시도·시군구·동 ② 그 동의 단지 목록(거래 많은 순, 12개월) ③ 그 단지의 평형 묶음(거래 있는 것만) ④ 조건, BELOW 면 금액 입력(억 단위 숫자, 예 30 → 300000만원) ⑤ 추가. 규칙은 localStorage `realdeal.alerts.rules`.
- **연결 칸 두 개**: 공공데이터포털 인증키(STACK 6절) · 슬랙 Webhook(시험 발송용, localStorage `realdeal.slackWebhook`, `isSlackWebhookUrl` 검사).
- 버튼 셋: **지금 확인**(채움) · 설정 파일 만들기 · 시험 알림 보내기.

### 지금 확인 (`POST /api/check-now`, 새로 만든다)

- 요청: `{ rules, sample: boolean, sendToSlack: boolean }`, 헤더 `x-molit-key`, `x-slack-webhook`(sendToSlack 일 때).
- 처리: 규칙의 시군구마다 24개월을 받는다(예시 모드는 `sampleMonth` 로 13개월). 기준일 = 키 모드는 오늘(한국 시간), 예시 모드는 예시 데이터의 가장 늦은 계약일. **기준일 30일 이내 계약분**을 added 로, 그 안의 해제 거래를 newlyCancelled 로 보고 `evaluate`. 스냅샷은 읽지도 쓰지도 않는다.
- 응답: `{ ok: true, items: HistoryItem[] }` (F4 의 `toHistoryItems` 결과를 그대로. windowLabel 은 "최근 30일 계약분 (시험)") 또는 `{ ok: false, code, message }`. 화면은 기록과 **같은 카드 컴포넌트**로 그린다(층·기준가·이전 최고가가 모두 event 안에 있다).
- 화면: 알림함 맨 위에 "시험 결과" 묶음으로 보여 준다(기록과 구분되는 점선 테두리). 0건이면 "최근 30일에 조건에 맞는 거래가 없습니다."
- 시험 알림 보내기: 같은 요청을 sendToSlack: true 로. 성공하면 "슬랙으로 보냈습니다".

## F6. 예시 모드

강남구 고정. "예시 데이터로 먼저 보기" 를 누르면 강남구에서 12개월 거래가 가장 많은 단지의 주력 평형으로 NEW_DEAL 규칙 하나와 NEW_HIGH 규칙 하나를 만들어 주고 "지금 확인"을 실행한다.

## 테스트 (tests/alerts.test.ts)

가짜 Deal 로:
- NEW_DEAL: 다른 평형(84 vs 59) 거래는 걸리지 않는다
- NEW_HIGH: 이전 최고 22억 6천, 새 거래 23억 5천 → 걸림, previousHigh = 226000
- NEW_HIGH: 이번 added 끼리는 서로의 이전 최고가가 되지 않는다
- NEW_HIGH: 비교할 이전 거래가 없으면 걸리지 않는다
- NEW_HIGH: 이전 최고가 해제 거래면 비교에서 빠진다
- BELOW: 같은 값(=)이면 걸린다, 이벤트에 threshold 가 담긴다
- CANCELLED: newlyCancelled 만 본다
- 꺼진 규칙은 무시
- 정렬 순서
- `parseConfig`: version 누락·condition 오타를 한국어 오류로
- `eventLine` 4종 문장이 위 예시와 글자까지 같다
