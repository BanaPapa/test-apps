# FSD · 4. 카드 스튜디오

계산·프롬프트·검사는 `lib/cards.ts`(새로 만든다, 순수 함수), 카드 그리기는 `lib/card-canvas.ts`(브라우저 Canvas 2D), 테스트는 `tests/cards.test.ts`.

## F1. 입력

- 도구줄: 지역(시도·시군구·동 한 묶음 select 3개, 동 필수) · 기준 달 · 공공데이터포털 인증키 · 카드 비율(1:1 / 4:5, 기본 4:5).
- 기준 달 규칙과 예시 모드 고정은 3번 시나리오와 같다: 끝 달의 지난달부터 12개, 기본 지난달. 예시 모드는 `202609` 고정.
- 받는 범위: 기준 달로 끝나는 12개월.
- 오른쪽: 계정 이름(`@` 없이 입력해도 붙여서 보여 줌), 해시태그 칸(기본 `#{동} #{동}아파트 #실거래가`), 카드 색 테마.
- 모두 localStorage `realdeal.studio.settings`.

## F2. 카드 숫자

```ts
// lib/cards.ts
import type { Deal } from './molit';

export type CardFacts = {
  dong: string;
  monthLabel: string;             // "9월"
  monthTitle: string;             // "대치동 9월 실거래"
  count: number;                  // 기준 달 정상 거래
  countNote: string;              // F2-1 규칙
  perPyeong: { value: number | null; text: string | null; basis: '이달' | '최근 3개월' };
  perPyeongNote: string | null;   // F2-2 규칙
  perPyeongChangePct: number | null; // "1년 전보다 ±x.x%" 일 때 그 값(부호 있음, 반올림 전). 최고·최저 문구일 때도 계산되면 넣는다
  spark: (number | null)[];       // 12개월 달별 중위 평당가
  top: { apt: string; area: string; areaValue: number; price: string; priceValue: number }[]; // 기준 달 금액 상위 2
};
export function buildCardFacts(deals: Deal[], dong: string, endYm: string): CardFacts;
```

- F2-1 countNote: 직전 3개월 월평균 a 와 비교. count ≥ a×1.2 → "최근 석 달 평균보다 많음", ≤ a×0.8 → "최근 석 달 평균보다 적음", 그 밖 "최근 석 달 평균과 비슷". a 가 0 이면 "".
- F2-2 perPyeong: 기준 달 거래 3건 이상이면 이달 중위값(basis '이달'), 아니면 최근 3개월 구간 값(basis '최근 3개월'), 그것도 없으면 null. perPyeongNote: 12개월 달별 값 중 최고면 "1년 중 가장 높음", 최저면 "1년 중 가장 낮음", 아니면 "1년 전보다 {±x.x%}"(처음 3개월 구간 값 대비). 계산 불가면 null.
- top: 기준 달 정상 거래 금액 상위 2. area 는 `Math.floor(㎡)㎡`.
- 거래 0건이면 카드를 만들지 않고 "이달 신고된 거래가 없습니다" 상태.

## F3. 모델이 쓰는 것

```ts
export type CardCopy = {
  headline: string;   // 카드 1 제목. 줄바꿈 \n 으로 최대 3줄, 줄마다 8자 이내
  drafts: { tone: '숫자 위주' | '동네 이야기체' | '질문형'; text: string }[]; // 정확히 3개, 각 300자 이내, 해시태그 없음
};
export function buildCopyPrompt(facts: CardFacts, banned: string[]): { system: string; user: string };
export function parseCardCopy(modelText: string): CardCopy; // 형식 틀리면 Error
export function fallbackHeadline(facts: CardFacts): string; // 모델 없을 때: "{M}월\n거래\n{n}건"
```

system:
```
너는 동네 부동산 소식을 SNS 카드로 만드는 편집자다.
- '자료' JSON 의 숫자만 쓴다. 숫자는 자료의 표기 그대로 옮긴다.
- headline 은 카드에 크게 들어갈 제목이다. 세 줄, 줄마다 8자 이내, 숫자를 넣지 않는다.
- drafts 는 게시글 본문 세 가지다. 어조는 '숫자 위주', '동네 이야기체', '질문형' 순서.
  각 300자 이내, 두세 문장, 해시태그와 이모지를 넣지 않는다.
- 다음 표현을 쓰지 않는다: {banned 를 쉼표로}
- 매수·매도를 권하지 않는다.
- 답은 JSON 하나로만: {"headline":"…","drafts":[{"tone":"숫자 위주","text":"…"},{"tone":"동네 이야기체","text":"…"},{"tone":"질문형","text":"…"}]}
```
user: `자료:\n` + JSON(facts 중 표기 문자열과 숫자, spark 는 빼고).

parseCardCopy: 첫 `{`~마지막 `}`, headline 줄 수 ≤ 3 이 아니면 앞 3줄만, drafts 가 3개가 아니면 Error. 실패 시 한 번 다시 묻는다(3번 시나리오 F4 와 같음).

## F4. 검사

```ts
export const DEFAULT_BANNED = ['폭등', '폭락', '역대급', '무조건', '지금 사세요', '지금 파세요', '대박', '투자 추천'];
export type DraftCheck = { bannedHits: string[]; unknownNumbers: NumberToken[] };
export function checkDraft(text: string, facts: CardFacts, banned: string[]): DraftCheck;
export function allowedFromFacts(facts: CardFacts): AllowedNumbers;

export type HeadlineCheck = { ok: boolean; reasons: string[] }; // reasons 예: "숫자가 있음", "2번째 줄이 8자를 넘음", "금지어: 역대급"
export function checkHeadline(headline: string, banned: string[]): HeadlineCheck;
```

- checkHeadline: 줄 수 1~3, 줄마다 공백 뺀 글자 수 8 이하, 숫자(0-9) 없음, 금지어 없음(checkDraft 와 같은 방식).
- **카드 1 에 쓰는 제목** = 모델 headline 이 checkHeadline 을 통과하면 그것, 아니면 `fallbackHeadline(facts)`. 대체했으면 카드 미리보기 아래에 작은 글 "모델 제목이 규칙에 맞지 않아 기본 제목을 썼습니다 ({reasons})". PNG 에는 언제나 통과한 제목만 들어간다.
- bannedHits: 공백을 무시하고 포함 여부(대소문자 무관).
- allowedFromFacts: money = perPyeong.value(반올림 전·후 둘 다)·top.priceValue. percent = perPyeongChangePct. plain = count·top.areaValue 와 고정 숫자 `1, 3, 12`("1년", "석 달"은 글자라 상관없음), `3.3`. names = top 의 apt 와 동 이름. 테스트에 "facts 표기를 그대로 옮긴 정상 본문은 unknown 0개"를 넣고, 숫자 든 단지명(예: 개포주공5단지)으로도 확인한다.
- 표시: 금지어는 본문 안에서 취소선 + 주황 바탕, 자료 밖 숫자는 빨간 물결 밑줄. 후보 카드 위에 "금지어 1 · 확인 안 된 숫자 1" 꼬리표.
- 금지어 칩: 오른쪽 "모델이 쓰지 않을 말"에서 추가(입력 + Enter)·삭제(칩의 × 버튼). 바뀌면 모든 후보를 다시 검사(모델은 다시 부르지 않음).

## F5. 카드 그리기 (`lib/card-canvas.ts`)

```ts
export type CardTheme = 'lime' | 'ink' | 'paper' | 'orange';
export type CardSize = { w: 1080; h: 1080 | 1350 };
export async function ensureFonts(): Promise<void>; // document.fonts.load 로 'Black Han Sans' 와 'Noto Sans KR' 400·700 을 기다린다
export function drawCard(ctx: CanvasRenderingContext2D, index: 1 | 2 | 3, facts: CardFacts, headline: string, opts: { size: CardSize; theme: CardTheme; handle: string }): void;
```

- **미리보기와 내보내기가 같은 함수**를 쓴다. 미리보기는 `<canvas width=1080 height=1350>` 을 CSS 로 줄여 보여 준다(폭 272). 그래서 둘이 어긋나지 않는다.
- 여백 96px(1080 기준). 글꼴: 큰 글 Black Han Sans, 작은 글 Noto Sans KR 700.
- 카드 1: 위 "{monthTitle}"(40px), 가운데 headline(132px, 줄간격 1.12, 줄마다 왼쪽 정렬), 아래 왼쪽 "@{handle}"(40px), 아래 오른쪽 "{count}건 · {countNote}"(36px).
- 카드 2: 위 "3.3㎡당 중위가" + basis 가 '최근 3개월'이면 " (최근 3개월)"(40px), 가운데 큰 숫자(perPyeong.text, 168px; '만' 은 76px), 그 아래 perPyeongNote(52px, 테마 강조색), 맨 아래 spark 선(높이 180, 굵기 9, null 은 끊김).
  - **표본 부족**(perPyeong.value 가 null): 큰 숫자 자리에 "표본 부족"(132px), 그 아래 "이달 {count}건, 가격을 말하기엔 거래가 적습니다"(44px, 강조색 아님). perPyeongNote 는 그리지 않는다. spark 는 값이 2개 이상일 때만 그린다.
- 카드 3: 위 "이달 가장 비싼 거래"(40px), top 두 줄(가격 96px / 단지·면적 40px), 맨 아래 "출처 국토교통부 실거래가"(32px).
- 글이 칸을 넘으면 `measureText` 로 줄여서 맞춘다(최소 70%). 그래도 넘치면 말줄임.
- 테마 색:

| 테마 | 카드1 바탕/글 | 카드2 바탕/글/강조 | 카드3 바탕/글/테두리 |
|---|---|---|---|
| lime | `#C8F03C` / `#111111` | `#111111` / `#FCFCFB` / `#C8F03C` | `#FFFFFF` / `#111111` / `#111111` 6px |
| ink | `#111111` / `#FCFCFB` | `#1F1F1D` / `#FCFCFB` / `#C8F03C` | `#FCFCFB` / `#111111` / 없음 |
| paper | `#F3F1EA` / `#111111` | `#FFFFFF` / `#111111` / `#2346D5` | `#F3F1EA` / `#111111` / 없음 |
| orange | `#FF6A2B` / `#111111` | `#111111` / `#FCFCFB` / `#FF6A2B` | `#FFFFFF` / `#111111` / `#111111` 6px |

모서리: 내보내는 PNG 는 직각(SNS 가 알아서 자른다). 미리보기 canvas 는 CSS `border-radius: 20px`.

## F6. 내보내기

- "이미지 3장 받기": 카드마다 `canvas.toBlob('image/png')` → `<a download>` 로 차례로 내려받기. 파일명 `{동}-{YYYYMM}-{1|2|3}.png`. 브라우저가 여러 파일 받기를 막으면 "브라우저 위쪽에서 여러 파일 받기를 허용하세요" 안내.
- "본문 복사": `navigator.clipboard.writeText(고른 본문 + "\n\n" + 해시태그 + "\n출처: 국토교통부 실거래가")`. 성공 시 버튼 글이 2초 동안 "복사했습니다". 실패하면 본문을 고를 수 있는 textarea 로 보여 준다.
- 글자 수 표시: 복사될 글 전체 길이, "스레드 500자 기준" 넘으면 빨간 글.

## F7. 모델 연결

`docs/API_LLM.md` 2절. 오른쪽 위 검은 판 안에. "본문 쓰기" 버튼은 본문 후보 영역 제목 옆("다시 쓰기"). 결과는 localStorage `realdeal.studio.copy.{lawdCd}.{dong}.{ym}` 에 `{ copy, model, at, factsKey }` 로 저장하고, 다시 열면 API_LLM.md 3절 "저장한 결과를 다시 열 때"대로 factsKey 를 비교한 뒤 검사(checkDraft·checkHeadline)를 지금 facts 로 다시 한다. `export function factsKey(facts: CardFacts): string` 를 `lib/cards.ts` 에 만든다.

## 테스트 (tests/cards.test.ts)

- `buildCardFacts`: 예시 데이터 대치동 202609 → count 가 직접 센 값, top 2개 이하·금액 내림차순, spark 길이 12
- perPyeong basis: 가짜 Deal 로 이달 2건 → '최근 3개월'
- `parseCardCopy`: 코드 블록 감싼 답 OK, drafts 2개면 Error, headline 4줄 → 3줄
- `checkDraft`: "역 대 급" 같은 띄어쓰기 변형도 잡는다, facts 숫자만 쓴 글은 unknown 0
- `fallbackHeadline`: "9월\n거래\n9건" 형식
