// 예시 데이터: 서울 강남구(11680) 2025년 10월 ~ 2026년 10월의 실제 국토부 응답 원본.
// 인증키가 아직 없는 사람도 화면을 끝까지 만들어 볼 수 있게 넣어 둔 것이다.
// 서버 전용. 화면 코드는 lib/constants.ts 의 SAMPLE_* 값을 쓴다.
import sample from '../data/sample/gangnam-11680.json';
import { parseMolitBody, toDeal, uniqueIds, type Deal } from './molit';

export { SAMPLE_LAWD_CD, SAMPLE_LATEST_YM } from './constants';

const months = (sample as { months: Record<string, unknown> }).months;

/** 예시 데이터에 들어 있는 달 목록(YYYYMM, 오래된 순) */
export const SAMPLE_MONTHS: string[] = Object.keys(months).sort();

export function sampleMonth(ym: string): Deal[] {
  const raw = months[ym];
  if (!raw) return [];
  const { items } = parseMolitBody(JSON.stringify(raw));
  return uniqueIds(items.map(toDeal));
}
