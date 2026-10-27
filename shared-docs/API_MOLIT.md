# API_MOLIT.md · 국토교통부 아파트 매매 실거래가 API

이 앱이 쓰는 유일한 부동산 데이터 출처다. 호출 코드는 `lib/molit.ts` 에 이미 있고 실제 응답으로 검증됐다. 이 문서는 그 코드가 **왜 그렇게 짜여 있는지**와 화면 코드가 알아야 할 것을 적는다.

## 1. 인증키 받기 (사람이 하는 일)

1. https://www.data.go.kr 회원가입
2. https://www.data.go.kr/data/15126469/openapi.do 접속 → **활용신청** (개발계정, 자동 승인)
3. 마이페이지 → 개발계정 → 일반 인증키(Decoding) 복사
4. 발급 직후 1~2시간은 "등록되지 않은 서비스키" 오류가 날 수 있다. 정상이다.

키는 Decoding 과 Encoding 두 가지가 보인다. **어느 쪽을 넣어도 된다.** `normalizeKey` 가 `%` 가 들어 있으면 한 번 풀어 준다.

## 2. 호출 규격

| 항목 | 값 |
|---|---|
| 주소 | `https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade` |
| serviceKey | 인증키 |
| LAWD_CD | 시군구 코드 5자리. `data/regions.json` 의 sigungu `code` |
| DEAL_YMD | 계약년월 6자리 `202609` |
| pageNo / numOfRows | 1부터 / 1000 (한 달 치가 1000건을 넘으면 다음 쪽) |
| _type | `json` (안 붙이면 XML 로 온다) |

**단위는 시군구 + 계약월이다.** 동 하나만 받는 방법은 없다. 동 필터는 받은 뒤에 `deal.dong` 으로 거른다.

## 3. 앱 안에서 부르는 법

화면(브라우저)에서는 `lib/client.ts` 의 `fetchDeals` 만 쓴다.

```ts
import { fetchDeals, loadMolitKey, DealsError } from '@/lib/client';
import { monthsBack, currentYm } from '@/lib/months';

const deals = await fetchDeals({
  lawdCd: '11680',
  months: monthsBack(currentYm(), 12),   // 오래된 달 → 최근 달
  key: loadMolitKey(),                  // 비면 서버 .env.local 의 키
  sample: false,                        // true 면 예시 데이터
  onProgress: (done, total) => setProgress({ done, total }),
  signal: abortController.signal,       // 중지 버튼
});
const inDong = deals.filter((d) => d.dong === '신사동');
```

예시 모드에서는 `currentYm()` 대신 `lib/constants.ts` 의 `SAMPLE_LATEST_YM`(`'202610'`)을 끝 달로 쓴다. 그래야 예시 데이터가 들어 있는 달을 고른다.

`monthsBack`, `currentYm` 은 `lib/molit.ts` 에 있지만 node 모듈(`node:dns`)을 함께 불러오므로 **화면 코드에서는 `lib/months.ts` 의 같은 이름 함수를 쓴다.** `lib/sample.ts` 도 서버 전용이다. 화면 코드가 import 해도 되는 제공 파일은 `lib/client.ts`, `lib/constants.ts`, `lib/months.ts`, `lib/stats.ts`, `lib/regions.ts`, `lib/llm-client.ts`, `lib/number-check.ts` 이다. `lib/stats.ts` 는 `import type` 만 하므로 괜찮다.

서버 코드(라우트, scripts)에서는 `fetchMonth` 를 직접 쓴다.

## 4. Deal 형식 (화면이 받는 한 건)

| 필드 | 예 | 뜻 |
|---|---|---|
| `id` | `11680\|신사동\|...` | 같은 거래를 날마다 비교하는 열쇠. 해제돼도 바뀌지 않는다 |
| `dong` | `신사동` | 법정동 |
| `aptName` | `가로수힐` | 단지명 |
| `jibun` | `532` | 지번. 같은 이름의 다른 단지를 가를 때 쓴다 |
| `areaM2` | `84.97` | 전용면적 ㎡ |
| `floor` | `14` | 층 (지하는 음수) |
| `priceManwon` | `235000` | 거래금액 만원 |
| `contractDate` | `2026-09-21` | 계약일 |
| `buildYear` | `2004` | 건축년도 (없으면 null) |
| `dealType` | `중개거래` / `직거래` | |
| `cancelled` | `false` | 계약 해제 여부 |
| `cancelDate` | `2026-10-03` 또는 null | 해제 사유 발생일 |

단지를 구별하는 열쇠는 `aptName + '|' + jibun` 이다(이름만으로는 겹칠 수 있다).

## 5. 함정 (코드가 이미 처리함, 화면 코드도 알고 있을 것)

1. **0건이면 `items` 가 빈 문자열 `""`** 이다. 1건이면 `item` 이 배열이 아니라 객체 하나다.
2. **금액은 `"235,000"` 처럼 쉼표 섞인 문자열**, 나머지 숫자(층·면적·년월일)는 숫자로 온다.
3. **빈 값은 공백 한 칸 `" "`** 으로 온다(aptDong, cdealDay 등).
4. **해제일은 `"26.10.03"` 처럼 두 자리 연도**로 온다.
5. **신고일 필드는 없다.** 실거래는 계약 후 30일 안에 신고하므로, 이번 달 데이터는 다음 달 말까지 계속 늘어난다. 그래서 신고일은 알 수 없고, 앞선 확인 때 받은 목록과 비교해 "새로 확인된 거래"만 알 수 있다(`lib/snapshot.ts`). 화면·메시지에서 "어제 신고"라고 단정하지 않는다. `rgstDate` 는 소유권 이전 등기일이지 신고일이 아니다.
6. **키가 틀리면 HTTP 403 과 함께 `OpenAPI_ServiceResponse`** 문서가 온다. `KEY_INVALID` 로 분류된다.
7. **일부 PC 에서 Node 가 IPv6 로 붙다가 10초 뒤 끊긴다.** `lib/molit.ts` 맨 위의 `dns.setDefaultResultOrder('ipv4first')` 가 이것을 막는다. 지우지 말 것.
8. **브라우저에서 국토부를 직접 부르면 CORS 로 막힌다.** 그래서 `/api/molit` 를 거친다.
9. **2026년 행정구역 개편** 뒤에는 새 코드만 받는다. 광주·전남은 `12xxx`(예: 광산구 12330), 인천은 개편된 구 코드. 옛 코드(29200 등)는 0건이 나온다. `data/regions.json` 은 새 코드다.
10. 개발계정은 하루 호출 수 제한이 있다(포털 마이페이지에서 확인). 12개월 조회 = 12회 이상 호출이다.

## 6. 오류 코드와 화면 행동

| code | HTTP | 화면 행동 |
|---|---|---|
| `NO_KEY` | 400 | 인증키 칸에 초점, "예시 데이터로 먼저 보기" 버튼 |
| `KEY_INVALID` | 401 | 인증키 상태를 `키 오류` 로, 키 발급 안내 링크 |
| `QUOTA_EXCEEDED` | 429 | 안내만. 다시 시도 버튼 없음 |
| `BAD_INPUT` | 400 | 지역·기간을 다시 고르라는 안내 |
| `TIMEOUT`, `NETWORK`, `UPSTREAM` | 5xx | "다시 시도" 버튼 |
| `SAMPLE_ONLY` | 400 | 예시 모드에서 강남구 외 지역을 고른 경우. 지역을 강남구로 되돌리거나 키를 넣으라고 안내 |

메시지 문구는 서버가 이미 한국어로 만들어 준다(`body.message`). 화면은 그대로 보여 준다.

## 7. 예시 데이터

`data/sample/gangnam-11680.json` 은 2026-10-27 에 받은 **실제 응답 원본**이다. 서울 강남구, 2025년 10월 ~ 2026년 10월, 13개월. 단지명·금액은 진짜 공개 데이터다. 예시 모드에서는 강남구만 고를 수 있게 지역 선택을 잠근다.
