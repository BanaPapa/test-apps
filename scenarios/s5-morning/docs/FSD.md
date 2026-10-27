# FSD · 5. 아침 보고

보고 만들기는 `lib/report.ts`(새로 만든다, 순수 함수), 테스트는 `tests/report.test.ts`. `scripts/daily.ts` 와 화면의 미리보기(`/api/run-now`)가 **같은 함수**를 쓴다.

**말 쓰는 규칙:** 국토부 API 에는 신고일이 없다(`docs/AUTOMATION.md` 2절). 그래서 화면·메시지 어디에서도 "어제 신고"라고 단정하지 않고 **"새로 확인된 거래"**, **"확인까지 n일"** 이라고 쓴다. `design/mockup.html` 의 "어제 신고" 같은 문구는 이 규칙대로 바꿔 쓴다.

## 공통 정의

```ts
// lib/report.ts
import type { Deal } from './molit';

export type WatchArea = { lawdCd: string; dong: string };
export const areaKey = (a: { lawdCd: string; dong: string }): string => `${a.lawdCd}|${a.dong}`;
/** 거래가 속한 감시 대상 열쇠. diffSnapshot 의 scopeOf 로 쓴다 */
export const dealAreaKey = (d: Deal): string => `${d.sggCd}|${d.dong}`;

/** 같은 단지·같은 평형을 가리키는 열쇠. 최고가 비교에 쓴다 */
export const complexAreaKey = (d: Deal): string => `${d.sggCd}|${d.dong}|${d.aptName}|${d.jibun}|${Math.floor(d.areaM2)}`;

export type ReportConfig = {
  version: 1;
  areas: WatchArea[];        // 1~5곳
  sendWhenEmpty: boolean;    // 새 거래 0건인 날에도 보낼지 (기본 true)
  rules: string;             // 모델 작성 규칙 (기본 DEFAULT_RULES)
};

export type ReportDeal = {
  dong: string; apt: string; area: string; floor: number;
  price: string; priceValue: number;
  contractDate: string;      // YYYY-MM-DD
  contractLabel: string;     // "9.21"
  checkedAfterDays: number;  // 확인한 날(한국 시간 날짜) - 계약일, 일. 0 이상
  yearHigh: boolean;         // 같은 단지·평형 12개월 최고가 경신
};

export type ReportFacts = {
  dateLabel: string;         // 확인한 날 "10월 20일"
  windowLabel: string;       // 확인 구간 "10월 19일 08:04 ~ 10월 20일 08:03" (windowLabel 함수)
  areas: string[];           // 감시 대상 동 이름, 설정 순서 ["신사동", "압구정동"]
  newCount: number;          // 새로 확인된 정상 거래 수
  byArea: { dong: string; count: number }[];  // 설정의 모든 동, 0건 포함
  deals: ReportDeal[];       // 금액 내림차순, 최대 10
  moreCount: number;         // 10건을 넘는 나머지 수
  cancelled: { dong: string; apt: string; area: string; price: string; priceValue: number; contractLabel: string }[];
  newScopes: string[];       // 이번에 기준선만 만든 새 감시 동 이름
};
```

## F1. 보고 자료 만들기

```ts
export function buildReportFacts(p: {
  areas: WatchArea[];        // 설정의 감시 대상 전체 (거래가 없어도)
  added: Deal[];             // diffSnapshot 의 added (감시 동만)
  newlyCancelled: Deal[];
  history: Deal[];           // 감시 동의 12개월 전체 (최고가 비교용)
  checkedAt: Date;           // 이번 확인 시각
  previousAt: string | null; // diffSnapshot 의 previousAt
  newScopes: string[];       // diffSnapshot 의 newScopes (areaKey 형식)
}): ReportFacts;
```

- areas 의 동 이름 순서대로 `areas`, `byArea`(0건 포함)를 만든다.
- `checkedAfterDays` = 확인 시각의 한국 날짜 − 계약일(일). 신고일이 아니다.
- `yearHigh`: 같은 `complexAreaKey` 의 history 정상 거래 중 **이번 added 를 뺀** 최고가보다 비싸면 true. 비교할 거래가 없으면 false.
- `deals` 는 해제 아닌 added 만. 처음부터 해제 상태로 나타난 거래는 목록에서 뺀다.
- `newScopes` 는 areaKey → 동 이름으로 바꿔 넣는다.

## F2. 모델 요약

```ts
export const DEFAULT_RULES = `결론을 먼저 쓴다.
목록에 있는 거래를 다시 나열하지 않는다.
한 문장은 한 줄을 넘기지 않는다.`;
export function buildReportPrompt(facts: ReportFacts, rules: string): { system: string; user: string };
export type ReportText = { title: string; summary: string };
export function parseReportText(modelText: string): ReportText;
export function allowedFromReport(facts: ReportFacts): AllowedNumbers;
```

system:
```
너는 부동산 팀의 아침 보고를 쓰는 사람이다.
- '자료' JSON 의 숫자만 쓴다. 숫자는 자료의 표기 그대로 옮긴다.
- 신고일은 알 수 없다. "어제 신고"라고 쓰지 말고 "새로 확인된"이라고 쓴다.
- title 은 한 문장, 45자 이내. 가장 눈에 띄는 거래나 흐름을 말한다.
- summary 는 두 문장 이내. 지역별 특징, 1년 최고가, 해제를 다룬다.
- 매수·매도를 권하지 않는다. 폭등, 폭락, 역대급 같은 말을 쓰지 않는다.
- 답은 JSON 하나로만: {"title":"…","summary":"…"}
[작성 규칙]
{rules}
```
user: `자료:\n` + JSON(facts, 2칸 들여쓰기).

- parseReportText: 첫 `{` 부터 마지막 `}`, 두 칸 모두 비지 않은 문자열. 실패하면 한 번 다시 묻고, 또 실패하면 null 로 본다.
- allowedFromReport: money = deals.priceValue + cancelled.priceValue, plain = newCount, byArea.count, moreCount, checkedAfterDays 들, 면적 숫자(Math.floor), cancelled 건수, 1년 최고가 건수, 그리고 고정 숫자 `1, 12`("1년 최고가", "12개월"). percent 는 없다. names = deals·cancelled 의 apt 와 동 이름. 테스트에 "facts 표기를 그대로 옮긴 정상 요약은 unknown 0개"를 넣고, 숫자 든 단지명으로도 확인한다.
- **`facts.newCount > 0` 일 때만 모델을 부른다**(자동 실행·미리보기 모두). 해제만 있는 날은 규칙 제목과 해제 줄만 보낸다. 모델 호출은 `chat()` 기본 답 길이(4000)를 쓴다.

## F3. 안전한 최종 문장 고르기

```ts
export type FinalText = { title: string; summary: string | null; note: string | null; model: string | null };
export function finalizeText(facts: ReportFacts, modelResult: { text: ReportText; model: string } | null): FinalText;
```
- 규칙 제목(fallback): `새로 확인된 거래 {n}건` (+ 1년 최고가가 있으면 `, 1년 최고가 {k}건`).
- modelResult 가 null(모델 없음·오류) → { title: fallback, summary: null, note: null, model: null }.
- title·summary 중 하나라도 `findUnknownNumbers` 결과가 있으면 → { title: fallback, summary: null, note: '요약에 확인 안 된 숫자가 있어 뺐습니다', model: null }.
- 통과 → 모델 문장과 모델 id.

## F4. 슬랙 메시지

```ts
export type ReportKind = 'NEW' | 'EMPTY' | 'BASELINE' | 'FAILED';
export function buildReportMessage(entry: ReportHistory): SlackMessage; // lib/slack.ts 의 형식
```
메시지는 **기록(ReportHistory, F6) 하나로부터** 만든다. 그래서 화면도 같은 기록으로 같은 메시지를 다시 그릴 수 있다.
- NEW: `*{title}*` / summary(있으면) / 빈 줄 / 거래마다 `• {dong} {apt} {area} · {floor}층 · *{price}* ({contractLabel} 계약)` + yearHigh 면 ` · 1년 최고` / moreCount 면 `외 {m}건` / 해제가 있으면 `해제 {c}건: {dong} {apt} {area} {price} ({contractLabel} 계약분)` / newScopes 가 있으면 `새로 추가한 {동들}은 이번에 기준선을 저장했습니다` / 마지막 `context` 블록: `확인 구간 {windowLabel} · ` + (`요약 {model}` 또는 note 또는 `요약 없음`) + ` · 금액·건수는 국토부 원자료`.
- EMPTY: `{dateLabel} 새로 확인된 거래가 없습니다. ({areas 를 · 로}) · 확인 구간 {windowLabel}` + newScopes 가 있으면 다음 줄에 `새로 추가한 {동들}은 이번에 기준선을 저장했습니다`
- BASELINE: `아침 보고를 시작합니다. 기준선을 저장했고 다음 확인부터 새로 확인된 거래를 보냅니다. ({areas})`
- FAILED: `아침 보고 확인 실패: {error}`
- 블록은 `section`(mrkdwn)과 `context` 만. text 필드에도 같은 내용을 줄바꿈으로. 모든 글은 `slackEscape`.

## F5. 설정 파일

`config/report.json`:
```json
{ "version": 1, "areas": [{ "lawdCd": "11680", "dong": "신사동" }, { "lawdCd": "11680", "dong": "압구정동" }], "sendWhenEmpty": true, "rules": "결론을 먼저 쓴다.\n목록에 있는 거래를 다시 나열하지 않는다.\n한 문장은 한 줄을 넘기지 않는다." }
```
```ts
export function parseReportConfig(text: string): ReportConfig; // areas 1~5, lawdCd 5자리 숫자, dong 비지 않음. 틀리면 어느 칸인지 한국어 Error
```
- 키트에는 이 파일이 없다. 0단계에서 위 예시로 만든다.
- 화면 "설정 파일 만들기": 이 JSON(2칸 들여쓰기) + 복사 버튼 + **넣어야 할 Secrets 표**. `LLM_PROVIDER`·`LLM_MODEL` 은 화면에서 고른 값을 그대로 보여 주고, 키 값은 "화면에 넣은 키(여기에는 표시하지 않음)"라고만 쓴다.

## F6. 매일 실행 `scripts/daily.ts` (120줄 이하, lib 함수 조합만)

```
0. loadLocalEnv().  requireEnv(['MOLIT_API_KEY', 'SLACK_WEBHOOK_URL']) 실패 → 이름을 출력하고 exitCode 1 (기록 없음).
1. config = parseReportConfig(config/report.json).
2. 감시 동의 lawdCd 마다 monthsBack(currentYm(), 12) 를 fetchMonth (달 사이 0.3초).
   하나라도 실패 → FAILED 기록 저장, FAILED 메시지 보내기 시도(실패해도 무시), exitCode 1. 스냅샷 저장 안 함. 끝.
3. history12 = 감시 동의 거래만.
4. r = diffSnapshot(readSnapshot('state/report-snapshot.json'), history12,
       { scopeOf: dealAreaKey, scopes: config.areas.map(areaKey), newWindow: watchMonths(currentYm()) }).
5. 기록(entry) 만들기:
   - r.baseline → kind BASELINE (facts·text 없음).
   - 그 밖에는 **먼저** facts = buildReportFacts({ areas: config.areas, added: r.added, newlyCancelled: r.newlyCancelled, history: history12, checkedAt: now, previousAt: r.previousAt, newScopes: r.newScopes }).
     - facts.newCount 0 이고 facts.cancelled 0건 → kind EMPTY (text 는 규칙 제목만 든 finalizeText(facts, null)).
     - 그 밖 → facts.newCount > 0 이고 LLM_PROVIDER·LLM_MODEL·LLM_API_KEY 가 모두 있으면 chat() (실패하면 null). text = finalizeText(facts, …). kind NEW.
6. 보낼지 정하기: BASELINE·NEW 는 보낸다. EMPTY 는 sendWhenEmpty 가 true 이거나 **facts.newScopes 가 있으면** 보낸다(새 동 기준선 안내가 빠지지 않게). 보낼 것이 있으면 postSlack(buildReportMessage(entry)).
   실패 → entry 를 kind FAILED(error 에 이유)로 바꿔 기록 저장, exitCode 1. **스냅샷 저장 안 함**(다음 실행이 다시 보낸다). 끝.
7. writeSnapshot('state/report-snapshot.json', r.next). 기록 저장. 콘솔에 한 줄 요약.
```

`state/report-history.json` (배열, 새 것이 앞, 최근 60개):
```ts
export type ReportHistory = {
  at: string;                  // 확인 시각 ISO
  kind: ReportKind;
  facts: ReportFacts | null;   // NEW·EMPTY 일 때 (EMPTY 는 deals 빈 배열). BASELINE·FAILED 는 null
  text: FinalText | null;      // NEW·EMPTY 일 때
  areas: string[];
  error?: string;              // FAILED 일 때
};
```
```ts
// lib/report-history.ts (따로 만든다. node:fs 를 쓰므로 scripts 와 라우트 전용. lib/report.ts 는 화면에서도 import 하므로 node 모듈을 넣지 않는다)
export function readHistory(path: string): ReportHistory[];   // 없으면 []
export function appendHistory(path: string, entry: ReportHistory, keep = 60): void;
```
화면의 기록 보기와 슬랙 메시지는 모두 이 구조에서 다시 그린다(역파싱하지 않는다).

## F7. 웹 화면

### 왼쪽: 최근 7일

- `GET /api/report-history`(새로 만든다): `state/report-history.json` 을 읽어 최근 7개. 파일 없으면 빈 배열. `next.config.mjs` 에 `outputFileTracingIncludes: { '/api/report-history': ['./state/**'] }` 를 더한다. 화면 위에 작게 "기록 기준: 마지막 배포 또는 git pull 시점".
- 행: 날짜 `10.20` (고정폭) · 상태(`NEW` → `{newCount}건 보냄` `--ok` / `EMPTY` → `0건` `--muted` / `BASELINE` → `기준선` `--muted` / `FAILED` → `실패` `--bad`) · 요일 · 첫 줄(text.title 또는 안내 문장). 고른 행은 호박색 테두리.
- 기록이 없으면: "아직 보낸 보고가 없습니다. 오른쪽 '미리보기'로 모양을 먼저 보세요."

### 가운데: 메시지와 그림

- 고른 기록(또는 미리보기 결과)을 슬랙 메시지 모양으로 그린다: 채널 이름 `#우리동네-거래`(고정 글), 제목 20/700, summary, 거래 목록(1년 최고는 호박색 왼쪽 선), 해제 줄, 아래 작은 줄(확인 구간 · 요약 모델).
- **계약일과 확인일 그림**(SVG, 기록의 facts.deals 로): 거래마다 한 줄(최대 6). 왼쪽 점 = 계약일, 오른쪽 호박색 점 = 확인한 날, 둘을 잇는 회색 선, 위에 "{apt} · {M.D} 계약, {n}일 뒤 확인". 오른쪽 끝에 세로 점선과 "이번 확인". x 축은 가장 이른 계약일 3일 전 ~ 확인일+1일, 아래 날짜 3개. 제목 "새로 확인된 거래의 계약은 한참 전입니다"(가장 긴 간격이 14일 미만이면 "새로 확인된 거래의 계약일"). 설명 한 줄: "실거래는 계약 후 30일 안에 신고합니다. 그래서 이 보고는 계약일이 아니라 새로 확인된 날을 기준으로 보냅니다."
- 미리보기 결과에는 위에 "미리보기 · 최근 7일 계약분" 꼬리표.

### 오른쪽: 연결과 설정

- 안내 한 줄: "자동 실행은 GitHub Secrets 에 둔 키를 씁니다. 여기 넣은 키는 미리보기용이며 이 브라우저에만 저장됩니다."
- 연결 1: 공공데이터포털 인증키(STACK 6절) + `MOLIT_API_KEY` 이름 표시.
- 연결 2: 분석 모델(API_LLM.md 2절을 접힌 형태로: 제공사·모델 select 두 칸 나란히, 키 칸, 연결 확인) + `LLM_PROVIDER · LLM_MODEL · LLM_API_KEY` 이름 표시.
- 연결 3: 슬랙 Webhook(localStorage `realdeal.slackWebhook`, `isSlackWebhookUrl`) + `SLACK_WEBHOOK_URL` 이름 표시 + "시험 메시지 보내기"(`/api/run-now` 를 send: true 로).
- 지켜보는 동: 칩(최대 5) + "+ 추가"(시도·시군구·동 고르는 작은 판). localStorage `realdeal.morning.areas`.
- 작성 규칙 textarea(접힘, 기본 DEFAULT_RULES).
- 버튼: **미리보기**(채움) · 지금 한 번 보내보기 · 설정 파일 만들기.

### `/api/run-now` (새로 만든다)

- 요청 `POST { areas, sample, send, rules, llm: { provider, model } | null }`, 헤더 `x-molit-key`, `x-llm-key`, `x-slack-webhook`(send 일 때).
- 감시 동 lawdCd 마다 12개월(예시 모드는 `sampleMonth` 로 13개월, 강남구 동만 허용).
- 기준 시각 = 키 모드는 지금, 예시 모드는 예시 데이터의 가장 늦은 계약일 다음 날 08:00 KST. **기준 시각 전 7일 안에 계약된 정상 거래**를 added, 그 기간 계약분 중 해제를 newlyCancelled 로 본다. previousAt 은 기준 시각 7일 전. 스냅샷은 읽지도 쓰지도 않는다.
- buildReportFacts → (llm 이 있고 facts.newCount > 0 이면) 모델 → finalizeText → ReportHistory 하나(새 거래·해제가 모두 0건이면 kind EMPTY, 아니면 NEW) 만들기.
- 응답 `{ ok: true, history: ReportHistory }`. send 면 postSlack(buildReportMessage(history)) 도. 오류는 `{ ok: false, code, message }`.
- 서버가 한 번에 다 받고 나서 답하므로, 화면은 월별 진행률 대신 "만드는 중 · {경과 초}초"와 중지 버튼만 보여 준다.

## 테스트 (tests/report.test.ts)

- `buildReportFacts`: 금액 내림차순, 10건 초과 시 moreCount, 거래 0건인 감시 동도 byArea 에 count 0
- checkedAfterDays: 계약 2026-09-21, 확인 2026-10-19T23:03Z(= 10월 20일 08:03 KST) → 29
- yearHigh: 이번 added 끼리는 비교하지 않는다, 해제된 이전 최고가는 무시, **다른 시군구의 같은 이름·지번 단지는 섞이지 않는다**
- `finalizeText`: 모델 없음 → fallback / 자료 밖 숫자 → summary null + note / 정상 → 모델 문장
- `buildReportMessage`: NEW 메시지 text 에 금액과 "1년 최고", "확인 구간"이 들어가고 `<`·`&` 가 escape 된다
- `parseReportConfig`: areas 6곳 → 오류, lawdCd 4자리 → 오류
- `parseReportText`: 코드 블록 감싼 답
