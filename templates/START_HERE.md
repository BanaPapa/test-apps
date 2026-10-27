# {{TITLE}} · 여기서 시작하세요

> {{SUMMARY}}

![목표 화면](design/preview.png)

이 폴더는 **AI 에게 맡기면 앱이 만들어지도록 준비된 키트**입니다. 설계 문서, 화면 시안, 그리고 국토부 데이터를 받는 검증된 부품이 들어 있습니다.

## 1. 준비물

| 무엇 | 언제 필요 | 어디서 |
|---|---|---|
| Node.js {{NODE_MIN}} 이상 | 지금 | https://nodejs.org 에서 LTS 설치 |
| AI 코딩 도구 | 지금 | Claude Code, Codex, Cursor 등 아무거나 |
| 공공데이터포털 인증키 | 나중에 넣어도 됨 (없으면 예시 데이터로 먼저 봅니다) | https://www.data.go.kr/data/15126469/openapi.do → 활용신청 |
{{NEEDS_ROWS}}
## 2. 만들기 (한 번이면 됩니다)

1. 이 압축 파일을 풀어 생긴 폴더를 AI 코딩 도구에서 엽니다.
2. 이렇게 말합니다.

```
이 폴더의 START_HERE.md 와 CLAUDE.md 를 읽고, docs/BUILD_PLAN.md 대로 끝까지 만들어줘.
단계마다 확인하면서 진행해.
```

짧게 "이 폴더로 앱 만들어줘" 라고만 해도 됩니다. AI 는 `CLAUDE.md`(Codex 는 `AGENTS.md`)를 먼저 읽도록 되어 있습니다.

3. AI 가 단계별로 만들고, 끝나면 무엇을 확인했는지와 내가 할 일을 알려 줍니다. 보통 30분~1시간 걸립니다.

## 3. 실행해 보기

```
npm run dev
```

브라우저에서 http://localhost:3000 을 엽니다. 인증키 칸에 키를 넣으면 전국 어디든 조회됩니다. 키가 없으면 "예시 데이터로 먼저 보기"를 누르세요(서울 강남구 실제 데이터).
{{AUTOMATION_SECTION}}
## 4. 웹사이트로 올리기 (선택)

1. https://github.com 에 새 저장소를 만들고 이 폴더를 올립니다. AI 에게 "GitHub 저장소에 올려줘"라고 해도 됩니다.
2. https://vercel.com 에 GitHub 로 가입 → Add New → Project → 그 저장소 Import → Deploy.
3. 주소가 나오면 끝입니다. 방문자는 각자 자기 인증키를 화면에 넣어 씁니다.

주의: Vercel 환경변수에 내 키(`MOLIT_API_KEY`{{VERCEL_EXTRA_KEYS}})를 넣으면, 주소를 아는 누구나 내 키로 조회할 수 있습니다. 혼자 쓰는 주소일 때만 넣으세요.

## 5. 막혔을 때

| 증상 | 해결 |
|---|---|
| "인증키가 맞지 않습니다" | 발급 직후면 1~2시간 기다립니다. 활용신청한 데이터가 "국토교통부_아파트 매매 실거래가 자료"인지 확인합니다 |
| 조회가 10초 넘게 걸리다 실패 | 국토부 서버 문제일 때가 많습니다. 잠시 뒤 다시 합니다 |
| `npm` 을 찾을 수 없다 | Node.js 를 설치한 뒤 터미널을 새로 엽니다 |
| 화면이 시안과 다르다 | AI 에게 "design/mockup.html 과 비교해서 다른 곳을 맞춰줘"라고 합니다 |
{{TROUBLE_ROWS}}
## 폴더 안내

- `docs/`: 설계 문서 (PRD 무엇을 · FSD 어떻게 · DESIGN 어떤 모습 · BUILD_PLAN 순서)
- `design/`: 목표 화면 (`mockup.html` 을 브라우저로 열 수 있습니다)
- `lib/`, `app/api/`, `data/`, `tests/`: 미리 만들어 둔 검증된 부품
