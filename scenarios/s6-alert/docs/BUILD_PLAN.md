# BUILD_PLAN · 6. 단지 알림

단계마다 **확인**을 통과해야 다음 단계로 간다.

## 0단계. 준비

- `npm install` → `npm test` 통과 확인. `.env.example` 을 `.env.local` 로 복사.
- `config/alerts.json` 을 FSD F3 형식의 빈 설정(`"rules": []`)으로 만든다.

## 1단계. 판정 로직과 테스트 (화면보다 먼저)

- `lib/alerts.ts`: 타입, `CONDITION_LABEL`, `ruleComplexKey`, `dealComplexKey`, `evaluate`, `eventLine`, `buildSlackMessage`, `parseConfig`, `toHistoryItems`. node 모듈을 import 하지 않는다(화면에서도 쓴다).
- `lib/alerts-history.ts`: `readHistory`, `appendHistory` (node:fs, 서버·스크립트 전용).
- `tests/alerts.test.ts`: FSD 마지막 절 전부.

확인: `npm test` 통과.

## 2단계. 매일 실행 스크립트

- `scripts/daily.ts` (FSD F4).
- `.env.local` 에 `MOLIT_API_KEY`, `SLACK_WEBHOOK_URL` 을 넣고, `config/alerts.json` 에 시험 규칙 하나를 손으로 넣는다(키가 아직 없으면 이 단계의 실제 실행은 건너뛰고 5단계 뒤에 한다).

확인: `npm run daily` 첫 실행 → 슬랙에 기준선 메시지, `state/alerts-snapshot.json` 생성. 두 번째 실행 → 새로 확인된 거래가 없으면 메시지 없음. 인증키를 일부러 틀리면 → FAILED 기록, 스냅샷 파일의 수정 시각이 바뀌지 않음. 조건에 새 단지를 더하고 실행 → 기준선 줄만 온다.

## 3단계. 토큰과 뼈대

- DESIGN 2·3절 → `app/globals.css`, `app/layout.tsx`(`<title>` "단지 알림").
- 두 덩어리 배치, 휴대폰 화면 껍데기(`components/Phone.tsx`).

확인: mockup 과 같은 배치로 빈 화면이 보인다.

## 4단계. 조건 만들기

- 조건 문장 목록, 조건 추가 판(단계형), localStorage 저장, 인증키·Webhook 칸.
- 설정 파일 만들기 판.

확인: 예시 모드로 단지 하나에 조건 4종을 만들고 새로고침해도 남는다. 설정 파일 JSON 이 F3 형식과 같다.

## 5단계. 지금 확인과 알림함

- `app/api/check-now/route.ts`, `app/api/alerts-history/route.ts`, `next.config.mjs` 에 `outputFileTracingIncludes`.
- 알림함 카드들(최고가 어두운 카드, 옅은 카드, 지난 알림), 시험 결과 묶음.
- 예시 데이터로 먼저 보기(F6).

확인: 예시 데이터 버튼 → 규칙 2개가 생기고 시험 결과가 휴대폰에 뜬다. `state/alerts-history.json` 이 있으면 지난 알림이 보인다.

## 6단계. GitHub 와 매일 실행

- 사용자에게 AUTOMATION.md 3절(저장소 만들기, Secrets, 권한, 수동 실행)을 안내한다. 사용자가 원하면 `git init` 과 첫 커밋까지 해 준다(Secrets 입력은 사용자가 직접).

확인: Actions 탭에서 `daily` 수동 실행이 초록색, 저장소에 `state/` 커밋이 생긴다.

## 7단계. 마무리 확인

- [ ] PRD 완료 기준 전부
- [ ] `npm test`, `npm run build` 통과
- [ ] `config/`, `state/`, 코드 어디에도 키·Webhook 주소가 없다
- [ ] 화면 문구에 긴 줄표(—)·이모지 없음

끝나면 사용자에게: 실행 방법, 매일 알림이 오는 시각, 조건을 바꾸는 법(화면 → 설정 파일 → GitHub 에 붙여 넣기)을 알린다.
