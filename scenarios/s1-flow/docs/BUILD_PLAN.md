# BUILD_PLAN · 1. 동네 흐름

단계마다 **확인**을 통과해야 다음 단계로 간다. 확인이 안 되면 고치고 다시 확인한다.

## 0단계. 준비

- `npm install`
- `npm test` → 제공된 테스트가 모두 통과하는지 확인
- `.env.example` 을 복사해 `.env.local` 을 만든다(값은 비워 둬도 된다)

확인: `npm test` 통과.

## 1단계. 토큰과 뼈대

- DESIGN.md 2·3절의 토큰과 글꼴을 `app/globals.css`, `app/layout.tsx` 에 옮긴다. `<title>` 은 "동네 흐름".
- `app/page.tsx` 에 머리줄과 빈 본문 그리드(DESIGN 4절)를 만든다. 아직 데이터는 없다.
- `components/` 에 `RegionPicker`, `PeriodSegment`, `KeyField` 를 만든다(FSD F1, F8).

확인: `npm run dev` → http://localhost:3000 에서 머리줄이 mockup 과 같은 배치로 보이고, 시도→시군구→동이 이어서 채워진다.

## 2단계. 데이터 받기

- 조회 버튼, 진행 표시, 중지(FSD F2).
- 상태 5가지(처음/받는 중/0건/오류/결과)를 하나의 `status` 상태값으로 관리한다.
- "예시 데이터로 먼저 보기" 버튼(F8).

확인: 예시 데이터 버튼을 누르면 `1 / 12개월` 부터 `12 / 12개월` 까지 진행 표시가 바뀐 뒤 결과 상태가 된다(아직 화면은 빈칸이어도 됨). 받은 건수를 임시로 화면에 찍어 확인한 뒤 지운다.

## 3단계. 계산 함수와 테스트

- `lib/flow.ts`: `buildHeadline`, `pricePoints`, `bandCards`, `toCsv` (FSD F3, F4, F6, F7).
- `tests/flow.test.ts`: FSD 마지막 절의 테스트.

확인: `npm test` 통과.

## 4단계. 결론과 차트

- 결론 문장(F3), 가격 차트(F4), 거래량 차트(F5), 면적대 4칸(F6).
- 차트는 `components/PriceChart.tsx`, `VolumeChart.tsx`, `BandGrid.tsx` 로 나눈다.

확인: 예시 데이터로 강남구 · 신사동 · 1년, 강남구 · 전체 · 1년, 강남구 · 대치동 · 6개월을 차례로 보고, 각각 결론 문장이 바뀌고 차트가 깨지지 않는다. 거래가 적은 동(신사동)에서 점선·"표본 부족"이 보인다.

## 5단계. 표와 CSV

- "표로 보기" 펼치기, 정렬, 더 보기, 엑셀로 받기(F7).

확인: 받은 CSV 를 엑셀로 열어 한글이 깨지지 않는다. 해제 거래가 표에서 취소선으로 보인다.

## 6단계. 다듬기

- `design/mockup.html` 을 옆에 띄워 놓고 간격·글자 크기·색을 맞춘다.
- 좁은 화면(DESIGN 7절): 브라우저 폭을 390px 로 줄여 확인.
- 키보드만으로 조회까지 할 수 있는지(Tab 순서).

## 7단계. 마무리 확인

- [ ] PRD 의 완료 기준을 하나씩 확인
- [ ] `npm test` 통과
- [ ] `npm run build` 통과
- [ ] 화면 문구에 긴 줄표(—)와 이모지가 없다
- [ ] 코드에 인증키가 없다 (`grep -r "serviceKey=" app components lib` 결과가 lib/molit.ts 뿐)

끝나면 사용자에게 알린다: 실행 방법(`npm run dev`), 주소, 실제 인증키로 보는 법, Vercel 에 올리는 법(START_HERE.md 4절).
