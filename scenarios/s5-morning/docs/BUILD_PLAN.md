# BUILD_PLAN · 5. 아침 보고

단계마다 **확인**을 통과해야 다음 단계로 간다.

## 0단계. 준비

- `npm install` → `npm test` 통과 확인. `.env.example` 을 `.env.local` 로 복사.
- `config/report.json` 을 FSD F5 예시대로 만든다(강남구 신사동·압구정동).

## 1단계. 보고 로직과 테스트 (화면보다 먼저)

- `lib/report.ts`: 타입, `areaKey`, `dealAreaKey`, `complexAreaKey`, `buildReportFacts`, `DEFAULT_RULES`, `buildReportPrompt`, `parseReportText`, `allowedFromReport`, `finalizeText`, `buildReportMessage`, `parseReportConfig`. node 모듈을 import 하지 않는다(화면에서도 쓴다).
- `lib/report-history.ts`: `readHistory`, `appendHistory` (node:fs, 서버·스크립트 전용).
- `tests/report.test.ts`: FSD 마지막 절.

확인: `npm test` 통과.

## 2단계. 매일 실행 스크립트

- `scripts/daily.ts` (FSD F6).
- `.env.local` 에 `MOLIT_API_KEY`, `SLACK_WEBHOOK_URL`(있으면 `LLM_PROVIDER`, `LLM_MODEL`, `LLM_API_KEY` 도).

확인: `npm run daily` 첫 실행 → 기준선 메시지 + `state/report-snapshot.json`, `state/report-history.json`. 두 번째 → "새로 확인된 거래가 없습니다". 인증키를 틀리면 FAILED 기록이 생기고 스냅샷 파일의 수정 시각이 바뀌지 않는다. `config/report.json` 에 동을 하나 더하고 다시 실행하면 그 동은 기준선만 만들었다는 줄이 붙는다. (키가 없으면 이 단계 실행은 뒤로 미루고 3단계로.)

## 3단계. 토큰과 세 덩어리

- DESIGN 2·3절 → `app/globals.css`, `app/layout.tsx`(`<title>` "아침 보고").
- 머리줄, 세 덩어리 껍데기, 빈 상태.

확인: mockup 과 같은 배치.

## 4단계. 오른쪽 연결과 설정

- 연결 상자 3개(인증키, 분석 모델, 슬랙), 지켜보는 동 칩·추가 판, 작성 규칙, 설정 파일 만들기 판.

확인: 예시 모드에서 동 두 곳을 담고, 설정 파일 JSON 이 F5 형식과 같다. Secrets 표에 키 값이 나오지 않는다.

## 5단계. 미리보기와 보내기

- `app/api/run-now/route.ts`, 가운데 메시지 그리기, 계약일·확인일 그림.

확인: 예시 데이터로 미리보기 → 메시지와 계약일·확인일 그림이 그려진다. 모델 연결 후 다시 → 요약 제목·문장이 붙는다. 실제 Webhook 으로 "지금 한 번 보내보기" → 슬랙에 같은 내용.

## 6단계. 기록

- `app/api/report-history/route.ts`, `next.config.mjs` 의 `outputFileTracingIncludes`, 왼쪽 7일 목록, 고르면 가운데에 그날 메시지.

확인: 2단계에서 만든 `state/report-history.json` 이 왼쪽에 보인다.

## 7단계. GitHub 와 매일 실행

- 사용자에게 AUTOMATION.md 3·4절 안내. 원하면 `git init`·첫 커밋까지 돕는다(Secrets 입력은 사용자가 직접).

확인: Actions 탭에서 `daily` 수동 실행이 초록색, `state/` 커밋 생성, 슬랙에 기준선 메시지.

## 8단계. 마무리 확인

- [ ] PRD 완료 기준 전부
- [ ] `npm test`, `npm run build` 통과
- [ ] `config/`, `state/`, 코드에 키·Webhook 주소 없음
- [ ] 화면 문구에 긴 줄표(—)·이모지 없음

끝나면 사용자에게: 매일 오는 시각, 동을 바꾸는 법(화면 → 설정 파일 → GitHub), 모델을 바꾸는 법(Secrets `LLM_*`), 실패했을 때 보는 곳(Actions 탭 로그).
