# BUILD_PLAN · 4. 카드 스튜디오

단계마다 **확인**을 통과해야 다음 단계로 간다.

## 0단계. 준비

- `npm install` → `npm test` 통과 확인. `.env.example` 을 `.env.local` 로 복사.

## 1단계. 카드 숫자·프롬프트·검사 (화면보다 먼저)

- `lib/cards.ts`: `buildCardFacts`, `buildCopyPrompt`, `parseCardCopy`, `fallbackHeadline`, `DEFAULT_BANNED`, `checkDraft`, `allowedFromFacts`, `checkHeadline`.
- `tests/cards.test.ts`: FSD 마지막 절.

확인: `npm test` 통과.

## 2단계. 토큰과 뼈대

- DESIGN 2·3절 → `app/globals.css`, `app/layout.tsx`(`<title>` "카드 스튜디오").
- 도구줄, 두 덩어리, 빈 상태(DESIGN 6절).

확인: mockup 과 같은 배치.

## 3단계. 카드 그리기

- `lib/card-canvas.ts`: `ensureFonts`, `drawCard`, 글 맞춤 도우미.
- `components/CardPreview.tsx`: canvas 를 그려 줄여 보여 준다. 비율·테마가 바뀌면 다시 그린다.
- 데이터 받기, 예시 데이터 버튼.

확인: 예시 데이터로 대치동 2026년 9월 → 카드 3장이 숫자와 함께 그려지고, 테마 4가지와 1:1·4:5 가 모두 바뀐다. 글꼴이 늦게 와도 기본 글꼴로 그려지지 않는다(ensureFonts 후 그림).

## 4단계. 모델과 본문

- 검은 판의 모델 연결(API_LLM.md 2절), 본문 쓰기·다시 쓰기, 후보 고르기, 검사 표시, 금지어 칩 편집, 결과 저장·되살리기.

확인: 실제 키로 쓰기 → 카드 1 제목과 후보 3개. 금지어에 후보 속 낱말 하나를 더하면 즉시 표시가 붙는다.

## 5단계. 내보내기

- 이미지 3장 받기, 본문 복사, 글자 수.

확인: 받은 PNG 3장을 열어 미리보기와 같은지 본다. 복사한 글을 메모장에 붙여 해시태그와 출처 줄을 확인.

## 6단계. 다듬기

- mockup 과 나란히 맞춤, 좁은 화면, 키보드 이동.

## 7단계. 마무리 확인

- [ ] PRD 완료 기준 전부
- [ ] `npm test`, `npm run build` 통과
- [ ] 코드에 키 없음, 화면 문구에 긴 줄표(—)·이모지 없음

끝나면 사용자에게: 실행 방법, 모델 키 받는 곳, 카드 받는 법, Vercel 배포 시 주의(API_LLM.md 6절).
