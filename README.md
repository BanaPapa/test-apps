# test-apps · 실거래 키트

국토교통부 아파트 실거래가로 만드는 6가지 앱의 **바이브코딩 키트**와, 그것을 내려받는 **배포 사이트**입니다. 사이트에서 zip 을 받아 AI 코딩 도구(Claude Code, Codex, Cursor 등)에 "이 폴더대로 만들어줘"라고 하면 앱이 만들어집니다.

| # | 키트 | 하는 일 | 필요한 것 |
|---|---|---|---|
| 1 | 동네 흐름 | 동네 1년 시세 흐름을 결론 한 문장과 차트로 | 공공데이터포털 인증키 |
| 2 | 단지 서랍 | 별표한 단지들의 거래만 모아 보기 | 인증키 |
| 3 | 브리핑 데스크 | 한 장짜리 시장 브리핑 문서(인쇄·PDF) | 인증키, 분석 모델 키 |
| 4 | 카드 스튜디오 | 인스타·스레드 카드 3장과 본문 | 인증키, 분석 모델 키 |
| 5 | 아침 보고 | 새로 확인된 거래를 매일 아침 슬랙으로 | 인증키, 분석 모델 키, 슬랙, GitHub |
| 6 | 단지 알림 | 조건에 맞는 거래만 매일 슬랙으로 | 인증키, 슬랙, GitHub |

키트 어디에도 실제 키는 들어 있지 않습니다. 키 없이도 서울 강남구 예시 데이터(2025.10 ~ 2026.10 실제 공개 자료)로 먼저 볼 수 있습니다.

## 배포 (Vercel)

1. Vercel → Add New → Project → 이 저장소 Import
2. 설정은 건드리지 않고 Deploy. 루트의 `vercel.json` 이 `site/` 를 그대로 내보냅니다(빌드·환경변수 없음).

## 폴더

| 폴더 | 내용 |
|---|---|
| `site/` | 배포되는 정적 사이트. `index.html`, `downloads/*.zip`, 시안 `mockups/`, 그림 `previews/` |
| `core/base/` | 모든 키트에 들어가는 검증된 코드 (Next.js 16 뼈대, 국토부 API, 통계, 지역 코드, 예시 데이터, 테스트) |
| `core/llm/` | 3·4·5번에 더하는 분석 모델 연결 코드 |
| `core/automation/` | 5·6번에 더하는 매일 실행 코드 (스냅샷 비교, 슬랙, GitHub Actions) |
| `shared-docs/` | 키트 공통 문서 (STACK, API_MOLIT, API_LLM, AUTOMATION) |
| `scenarios/` | `scenarios.json`(목록·조합) + 시나리오별 PRD·FSD·DESIGN·BUILD_PLAN |
| `templates/` | 키트의 CLAUDE.md(=AGENTS.md), START_HERE.md 틀 |
| `design-src/` | 시안 원본 |
| `site-src/` | 사이트 틀 |
| `scripts/` | 시안 렌더, 키트 조립·zip |
| `build/mockups`, `build/previews` | 렌더된 시안 HTML·PNG |

## 키트를 고친 뒤 다시 만들기

Node.js 22 이상에서:

```bash
node scripts/render-mockups.mjs   # design-src → build/mockups (시안을 바꿨을 때)
# 시안을 바꿨다면 build/previews/<slug>.png 도 다시 찍는다 (1280×1000)
node scripts/build-kits.mjs       # build/kits 조립 → site/ 의 zip·index.html·그림 갱신
```

`core/` 코드를 바꿨으면 `core/base` 에 `core/llm`, `core/automation` 을 겹쳐 복사한 곳에서 `npm install && npm test && npx tsc --noEmit && npm run build` 로 확인한 뒤 키트를 다시 만듭니다. `build-kits.mjs` 는 `.env*`(`.env.example` 제외)나 실제 키처럼 보이는 값이 들어가면 zip 을 만들지 않고 멈춥니다.

## 데이터

- 실거래 데이터는 국토교통부가 공공데이터포털로 공개한 자료입니다.
- 지역 코드표(`core/base/data/regions.json`)는 2026년 행정구역 개편(광주·전남 통합 등)이 반영된 코드입니다.
