# API_LLM.md · 분석 모델 연결

3·4·5번 시나리오는 **숫자는 앱이 계산하고, 문장은 분석 모델이 쓴다.** 모델 연결 코드는 `lib/llm.ts`(서버), `lib/llm-client.ts`(화면), `app/api/llm/route.ts`(중계)에 이미 있고 테스트돼 있다.

## 1. 지원하는 제공사

| id | 이름 | 키 받는 곳 | 비고 |
|---|---|---|---|
| `anthropic` | Anthropic | https://console.anthropic.com/settings/keys | 결제 수단 등록 필요 |
| `openai` | OpenAI | https://platform.openai.com/api-keys | 결제 수단 등록 필요 |
| `gemini` | Google Gemini | https://aistudio.google.com/apikey | 무료 사용량이 있다 |
| `openrouter` | OpenRouter | https://openrouter.ai/keys | 이름이 `:free` 로 끝나는 무료 모델을 고를 수 있다. 실습에 권장 |

ChatGPT·Claude 구독 계정으로 로그인하는 방식은 지원하지 않는다. API 키만 쓴다.

## 2. 모델 연결 칸 (화면)

모든 LLM 시나리오가 같은 순서로 그린다. 모양은 시나리오 DESIGN.md 를 따른다.

1. **제공사** 4개 중 하나 (선택 버튼 또는 select). 기본값 `openrouter`.
2. **API 키** `<input type="password">`. 아래에 "키 받는 곳" 링크(위 표).
3. **모델** select. 키를 넣고 "모델 불러오기"를 누르면 `fetchModels(provider, key)` 결과로 채운다.
   - OpenRouter 는 키 없이도 목록이 온다. 무료 모델(`free: true`)을 맨 위에 두고 "무료" 표시를 붙인다.
   - 목록이 너무 길면(100개 이상) 위에 검색 칸을 둔다.
4. **연결 확인** 버튼 → `askModel(settings, { system: '한 단어로만 답한다.', user: '확인', maxTokens: 1000 })`. 생각을 오래 하는 모델은 생각에도 토큰을 쓰므로 상한을 너무 낮게 잡지 않는다. 성공하면 `연결됨`, 실패하면 서버가 준 한국어 메시지.
5. 저장은 `saveLlmSettings`(이 브라우저 localStorage). 화면에 "키는 이 브라우저에만 저장됩니다" 문구.

상태 표시: `연결 안 됨` / `모델 고르는 중` / `연결됨` / `오류: (메시지)`.

## 3. 글을 쓰게 하는 순서 (반드시 이 순서)

```
① 앱이 거래 목록에서 숫자를 계산한다 (lib/stats.ts)
② 그 숫자를 '사실 자료(facts)' JSON 으로 만든다 (표기 문자열까지 미리 만들어 넣는다)
③ 모델에게 facts 와 작성 규칙을 주고 글을 받는다 (askModel)
④ findUnknownNumbers(글, 허용 숫자) 로 자료에 없는 숫자를 찾는다
⑤ 이상한 숫자가 없으면 화면에 낸다. 있으면 그 숫자를 빨간 밑줄로 표시하고 "다시 쓰기"를 권한다
```

- **모델에게 원본 거래 목록을 통째로 주지 않는다.** 계산이 끝난 facts 만 준다. 토큰을 아끼고, 모델이 숫자를 새로 계산하지 못하게 하기 위해서다.
- facts 에는 **값(value)과 표기(text)를 함께** 둔다. 허용 숫자 목록은 value 들로 만든다(표기 문자열을 되돌려 계산하지 않는다). 퍼센트는 부호를 지켜 넣는다(-2.3). "3.3㎡당"의 3.3, "12개월"의 12 처럼 문장에 자주 나오는 고정 숫자도 plain 에 넣는다.
- 날짜("2026년", "9월 21일", "9.21 계약")와 층·순서는 검사하지 않는다. 건수·일수·개월 수는 검사한다(`lib/number-check.ts` 맨 위 설명).
- **단지명·동 이름에 든 숫자**("개포주공5단지", "성수동1가")는 허용 목록의 `names` 에 그 이름들을 넣어 검사에서 뺀다. 이름과 글자가 똑같을 때만 빠진다.

### facts 예시

```json
{
  "region": "서울특별시 강남구 신사동",
  "period": "2025.10 ~ 2026.09",
  "deals": { "count": 73, "lastMonthCount": 9, "avgMonthlyCount": 6.1 },
  "pricePerPyeong": { "latest": 9980.4, "latestText": "9,980만", "changePct": 8.63, "changePctText": "+8.6%" },
  "topDeals": [{ "apt": "가로수힐", "area": "84㎡", "areaValue": 84, "floor": 14, "price": "23억 5,000", "priceValue": 235000, "date": "9월 21일" }]
}
```

### 시스템 프롬프트 뼈대 (시나리오 FSD 가 내용을 더한다)

```
너는 부동산 중개사무소의 시장 브리핑을 쓰는 사람이다.
- 아래 '자료' JSON 에 있는 숫자만 쓴다. 계산하거나 새 숫자를 만들지 않는다.
- 숫자는 자료의 표기 문자열을 그대로 옮긴다 (예: "23억 5,000", "+8.6%").
- 결론을 먼저, 숫자는 근거로 쓴다.
- 한 문장은 한 줄을 넘기지 않는다.
- 매수·매도를 권하지 않는다. "폭등", "역대급", "무조건" 같은 과장 표현을 쓰지 않는다.
- 답은 지정한 JSON 형식으로만 한다.
```

### 답 형식은 JSON 으로 받는다

모델에게 "다음 JSON 형식으로만 답하라"고 하고, 받은 글에서 첫 `{` 부터 마지막 `}` 까지 잘라 `JSON.parse` 한다. 실패하면 한 번만 다시 묻고, 그래도 실패하면 오류로 보여 준다. 형식은 시나리오 FSD 가 정한다. 답 길이 상한은 따로 정하지 않으면 `chat()` 기본값 4000 을 쓴다.

### 저장한 결과를 다시 열 때

모델 결과를 localStorage 에 저장할 때는 그때의 facts 를 `factsKey(facts)`(facts 를 `JSON.stringify` 한 문자열의 FNV-1a 해시 16진수, 시나리오 lib 에 만든다)와 함께 저장한다. 다시 열 때 지금 facts 의 키와 다르면 그 결과를 "자료가 바뀌었습니다. 다시 쓰기를 누르세요" 표시와 함께 흐리게 보여 주고 인쇄·내보내기를 막는다. 같아도 숫자 대조(`findUnknownNumbers`)는 **지금 facts 로 다시** 한다(저장한 판정을 믿지 않는다).

## 4. 모델이 실패했을 때

- 연결이 안 돼도 **숫자 화면은 그대로 보여야 한다.** 모델이 쓰는 부분만 "모델 연결 후 문장이 채워집니다" 자리 표시로 둔다.
- 오류 code 와 화면 행동:

| code | 화면 행동 |
|---|---|
| `NO_KEY` | 모델 연결 칸 열기 |
| `KEY_INVALID` | 상태를 오류로, 키 받는 곳 링크 |
| `RATE_LIMITED` | 잠시 뒤 다시 / 결제 상태 확인 안내 |
| `MODEL_NOT_FOUND` | 모델 목록 다시 불러오기 |
| `MODEL_UNSUPPORTED` | 다른 모델을 고르라고 안내 (OpenAI 의 -pro 같은 Responses 전용 모델) |
| `TRUNCATED` | 같은 요청 한 번 다시, 그래도 잘리면 다른 모델을 고르라고 안내 |
| `EMPTY`, `TIMEOUT`, `UPSTREAM` | 다시 시도 버튼 |

## 5. 비용 표시

`askModel` 결과의 `inputTokens`, `outputTokens` 를 작은 글씨로 보여 준다("입력 1,240 · 출력 380 토큰"). 원화 금액은 모델마다 값이 달라 계산하지 않는다.

## 6. 안전

- 키는 브라우저 localStorage 와 요청 헤더 `x-llm-key` 로만 다닌다. 서버는 저장하지 않는다.
- 헤더가 비었을 때 서버는 `.env.local`(또는 Vercel 환경변수)의 `LLM_API_KEY` 를 쓰는데, **`LLM_PROVIDER` 가 화면에서 고른 제공사와 같을 때만** 쓴다. 한 제공사의 키가 다른 제공사로 새어 나가지 않게 하기 위해서다.
- 5번(매일 자동 실행)은 브라우저가 없으므로 키를 GitHub Secrets `LLM_PROVIDER`, `LLM_MODEL`, `LLM_API_KEY` 에 둔다. `docs/AUTOMATION.md` 참고.
- Vercel 에 올려 남에게 주소를 공개할 때 환경변수 `LLM_API_KEY` 를 넣으면, 주소를 아는 누구나 내 키로 모델을 부를 수 있다. 공개 배포에서는 환경변수를 비워 두고 각자 키를 넣게 한다.
