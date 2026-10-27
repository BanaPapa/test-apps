# BUILD_PLAN · 3. 브리핑 데스크

단계마다 **확인**을 통과해야 다음 단계로 간다.

## 0단계. 준비

- `npm install` → `npm test` 통과 확인. `.env.example` 을 `.env.local` 로 복사.

## 1단계. 사실 자료와 프롬프트 (화면보다 먼저)

- `lib/briefing.ts`: `buildFacts`, `allowedNumbers`, `DEFAULT_RULES`, `buildPrompt`, `parseBriefing`, `markNumbers`.
- `tests/briefing.test.ts`: FSD 마지막 절.

확인: `npm test` 통과.

## 2단계. 토큰과 세 덩어리 뼈대

- DESIGN 2·3절 → `app/globals.css`, `app/layout.tsx`(`<title>` "브리핑 데스크").
- `components/SettingsRail.tsx`, `components/Paper.tsx`, `components/ModelPanel.tsx`.

확인: mockup 과 같은 세 덩어리 배치.

## 3단계. 데이터와 숫자 부분

- 지역·기준 달·사무소 입력(F1), 받기, 예시 데이터 버튼.
- 문서의 머리·표·눈여겨볼 거래·해제 줄·바닥(F6 1, 4~7). 판단 자리는 안내 문구.

확인: 예시 데이터로 대치동 2026년 9월 → 표와 거래 목록이 채워진다. 동을 바꾸면 다시 받지 않고 바뀐다.

## 4단계. 모델 연결 판

- API_LLM.md 2절: 제공사, 키, 모델 불러오기(OpenRouter 무료 위로), 연결 확인, 저장.
- 작성 규칙 textarea.

확인: OpenRouter 를 고르고 키 없이 "모델 불러오기" → 목록이 뜨고 무료가 위에 있다. 틀린 키로 연결 확인 → 한국어 오류.

## 5단계. 브리핑 쓰기

- F4 흐름, F5 숫자 표시와 경고 띠, 결과 저장과 되살리기.

확인: 실제 키(무료 모델도 됨)로 쓰기 → 제목·단기·중장기가 채워지고 숫자에 점선 밑줄. 규칙 칸에 "숫자 하나를 지어내라"를 넣고 다시 쓰기 → 물결 밑줄과 경고 띠. 새로고침 → 마지막 브리핑이 그대로.

키가 없어 이 단계를 실제로 확인할 수 없으면, 사용자에게 OpenRouter 키 발급(무료)을 안내하고 나머지 단계를 먼저 진행한다.

## 6단계. 인쇄와 다듬기

- F7 인쇄 CSS. mockup 과 나란히 맞춤. 좁은 화면.

확인: 인쇄 미리보기에 종이 한 장만 A4 로 나온다.

## 7단계. 마무리 확인

- [ ] PRD 완료 기준 전부
- [ ] `npm test`, `npm run build` 통과
- [ ] 코드·커밋 파일에 키 없음
- [ ] 화면 문구에 긴 줄표(—)·이모지 없음

끝나면 사용자에게: 실행 방법, 모델 키 받는 곳(API_LLM.md 1절), 인쇄/PDF 방법, Vercel 배포 시 주의(API_LLM.md 6절)를 알린다.
