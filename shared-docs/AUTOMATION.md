# AUTOMATION.md · 매일 자동 실행

5·6번 시나리오는 내 컴퓨터가 꺼져 있어도 매일 아침 돌아야 한다. 그래서 **GitHub Actions** 가 매일 08:00(한국 시간)에 `npm run daily`(= `scripts/daily.ts`)를 실행한다. 비용은 들지 않는다.

## 1. 구조

```
.github/workflows/daily.yml   제공됨. 매일 23:00 UTC(= 08:00 KST)에 실행, 끝나면 state/ 를 저장소에 다시 올린다
scripts/daily.ts              만든다(시나리오 FSD). 받기 → 비교 → 메시지 → 보내기
config/*.json                 만든다. 지켜볼 지역·단지·조건. 화면에서 만들어 복사해 넣는다
state/*.json                  자동 생성. 지난 확인 때의 거래 묶음 스냅샷과 실행 기록
```

`package.json` 에는 `"daily": "tsx scripts/daily.ts"` 스크립트와 `tsx` 가 이미 들어 있다. `tsx` 는 `@/lib/...` 경로를 그대로 이해한다.

`scripts/daily.ts` 는 이렇게 시작한다(제공된 `lib/env.ts`):

```ts
import { loadLocalEnv, requireEnv, optionalEnv } from '@/lib/env';

loadLocalEnv(); // 내 PC 에서는 .env.local 을 읽는다. GitHub 에서는 아무 일도 안 한다
const env = requireEnv(['MOLIT_API_KEY', 'SLACK_WEBHOOK_URL'] as const);
```

스크립트는 오류를 던지는 대신 `process.exitCode = 1` 로 끝내고, 마지막에 한 줄 요약을 `console.log` 로 남긴다(스크립트의 로그는 Actions 탭에서 보는 실행 기록이므로 이 경우만 console 출력을 쓴다).

## 2. "지난 확인 이후 새로 확인된 거래"를 찾는 법

국토부 API 에는 **신고일이 없다.** 그래서 신고일을 단정하지 않고 "지난 확인 이후 새로 확인된 거래"라고 부른다. 매일 08시에 돌면 보통 전날 08시 이후 반영된 것이지만, 실행이 실패했다가 복구되면 며칠 치가 섞일 수 있다. 메시지에는 확인 구간 `windowLabel(r.previousAt, now)` 을 함께 적는다.

`lib/snapshot.ts` 사용법:

```ts
import { diffSnapshot, readSnapshot, watchMonths, windowLabel, writeSnapshot } from '@/lib/snapshot';
import { currentYm } from '@/lib/months';

const prev = readSnapshot('state/report-snapshot.json');
const r = diffSnapshot(prev, dealsOfAllWatchedScopes, {
  scopeOf: (d) => `${d.sggCd}|${d.dong}`, // 감시 대상 열쇠 (5번: 동, 6번: 단지)
  scopes: watchedScopeKeys,               // 이번 설정의 감시 대상 전체 (거래 0건인 대상도)
  newWindow: watchMonths(currentYm()),    // 새 거래로 셀 계약월: 이번 달 포함 3개월
});
// r.baseline   첫 실행이면 true
// r.newScopes  이번에 새로 추가된 감시 대상 (기준선만 만들고 알리지 않음)
// r.added      새로 확인된 거래 (newWindow 안의 계약만)
// r.newlyCancelled  새로 확인된 해제
// r.previousAt 지난 확인 시각 (처음이면 null)
// r.next       저장할 새 스냅샷
```

규칙:

1. **받는 범위와 새 거래 범위는 다르다.** 받기는 시나리오가 정한 기간 전체(5번 12개월, 6번 24개월)를 받고 그 전체를 `diffSnapshot` 에 넣는다. 새 거래는 `newWindow`(최근 3개월 계약) 안에서만 세고, **해제는 받은 기간 전체에서 센다.** 해제 신고 기한은 계약일이 아니라 해제가 확정된 날부터 30일이라 계약 몇 달 뒤에도 해제가 나온다. 받은 기간보다 오래된 계약의 해제는 잡지 못한다(문서와 화면에 이 한계를 적는다).
2. **같은 모양 거래는 묶음으로 센다.** 같은 날·같은 층·같은 면적·같은 금액 거래는 구별할 수 없어서, 묶음마다 정상 건수와 해제 건수만 저장한다. 새 정상 거래 = 정상 건수가 늘어난 만큼, 새 해제 = 해제 건수가 늘어난 만큼(해제 상태로 처음 확인된 거래 포함). 응답 순서가 바뀌어도 결과가 같다. 한계: 같은 묶음에서 "기존 거래 해제"와 "새 정상 거래"가 한 번에 일어나면 새 정상 거래를 놓칠 수 있다(기존 거래를 새 거래로 잘못 알리지는 않는 쪽을 택했다).
3. **처음 실행(스냅샷 없음)은 기준선만 저장하고 알리지 않는다.** 대신 "기준선을 저장했습니다. 다음 확인부터 새로 확인된 거래를 보냅니다" 한 줄을 보낸다.
4. **감시 대상을 새로 더하면 그 대상은 이번에 기준선만 만든다**(`r.newScopes`). 메시지 끝에 "새로 추가한 {대상}은 이번에 기준선을 저장했습니다"를 붙인다. 대상을 빼면 다음 스냅샷에서 자연히 사라진다.
5. 스냅샷에는 거래 묶음 열쇠와 건수만 남는다. 개별 거래 목록은 저장하지 않는다.

### 실패했을 때 (반드시 이 표대로)

| 무엇이 실패 | 스냅샷 | 기록(history) | 종료 |
|---|---|---|---|
| 국토부 받기 (한 달이라도) | **저장 안 함** | FAILED 기록 저장 | exitCode 1, 가능하면 슬랙에 "확인 실패: 이유" |
| 슬랙 보내기 | **저장 안 함** (다음 실행이 같은 거래를 다시 잡아 다시 보낸다) | FAILED 기록 저장 | exitCode 1 |
| 분석 모델 (5번) | 저장함 | 정상 기록 (요약 없이 보냄) | 0 |

워크플로의 "스냅샷·기록 저장" 단계는 `if: ${{ !cancelled() }}` 라서 실행 단계가 실패해도 돈다. 그래서 FAILED 기록은 저장소에 남고, 스냅샷은 바뀌지 않은 채로 남는다.

## 3. GitHub 에 올리고 켜기 (사람이 하는 일, START_HERE 에도 있음)

1. GitHub 에서 새 저장소를 만든다(Private 권장).
2. 이 폴더를 그 저장소에 올린다. 클로드에게 "GitHub 저장소 ○○에 올려줘"라고 해도 된다.
3. 저장소 → Settings → Secrets and variables → Actions → **New repository secret** 으로 아래를 넣는다.

| 이름 | 값 | 필요한 시나리오 |
|---|---|---|
| `MOLIT_API_KEY` | 공공데이터포털 인증키 | 5, 6 |
| `SLACK_WEBHOOK_URL` | 슬랙 Incoming Webhook 주소 | 5, 6 |
| `LLM_PROVIDER` | `anthropic` / `openai` / `gemini` / `openrouter` | 5 |
| `LLM_MODEL` | 모델 id (화면 모델 목록에서 고른 값) | 5 |
| `LLM_API_KEY` | 분석 모델 API 키 | 5 |

4. 저장소 → Settings → Actions → General → Workflow permissions 가 **Read and write** 인지 확인한다(스냅샷을 다시 올리려면 필요).
5. Actions 탭 → `daily` → **Run workflow** 로 한 번 돌린다. 첫 실행은 기준선 메시지가 와야 정상이다.

`config/` 파일은 저장소에 올라가 있어야 자동 실행에 쓰인다. 화면에서 조건을 바꿨다면 설정 파일을 다시 만들어 저장소의 `config/` 에 붙여 넣는다.

## 4. 슬랙 Webhook 만들기

1. https://api.slack.com/apps → Create New App → From scratch → 이름과 워크스페이스
2. Incoming Webhooks → 켜기 → Add New Webhook to Workspace → 받을 채널 고르기
3. `https://hooks.slack.com/services/...` 주소를 복사해 화면의 Webhook 칸과 GitHub Secret 에 넣는다

## 5. 설정 파일(config) 흐름

화면에서 지역·단지·조건을 고르면 **설정 JSON 을 만들어 보여주고 복사 버튼**을 준다. 사용자는 그것을 저장소의 `config/` 파일에 붙여 넣는다(GitHub 웹에서 연필 버튼으로 고쳐도 된다). 화면이 저장소에 직접 쓰지는 않는다. 형식은 시나리오 FSD 가 정한다.

화면의 "지금 한 번 보내보기"는 같은 로직을 서버 라우트(`/api/run-now`)로 실행해 바로 슬랙에 보낸다. 이때는 스냅샷을 쓰지 않고 "최근 7일 계약분" 같은 시험용 범위를 쓴다(FSD 참고).

## 6. 알아 둘 것

- GitHub 예약 실행은 몇 분에서 수십 분 늦게 시작될 수 있다.
- 공개(Public) 저장소는 60일 동안 활동이 없으면 예약 실행이 멈춘다. 스냅샷 커밋이 매일 생기므로 보통은 괜찮지만, 멈췄다면 Actions 탭에서 다시 켠다.
- 국토부 서버가 느린 날은 실패할 수 있다. 실패한 날은 스냅샷을 쓰지 않았으므로 다음 실행이 그 사이 거래를 모두 잡는다. 메시지의 확인 구간이 이틀로 늘어난다.
- 내 PC 에서 시험: `.env.local` 에 위 표의 값을 넣고 `npm run daily`. `state/` 가 생기면 성공이다.
