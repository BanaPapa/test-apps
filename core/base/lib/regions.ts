// 시도 → 시군구 → 법정동 목록. data/regions.json 은 2026년 행정구역 개편(광주·전남 통합,
// 인천 구 개편 등)이 반영된 코드다. 국토부 API 의 LAWD_CD 는 시군구 code(5자리)를 그대로 쓴다.
import regionsJson from '../data/regions.json';

export type Sigungu = { code: string; name: string; dongs: string[] };
export type Sido = { code: string; name: string; sigungu: Sigungu[] };

const data = regionsJson as { fetchedAt: string; sido: Sido[] };

export const REGIONS_FETCHED_AT = data.fetchedAt;

export function listSido(): Sido[] {
  return data.sido;
}

export function listSigungu(sidoCode: string): Sigungu[] {
  return data.sido.find((s) => s.code === sidoCode)?.sigungu ?? [];
}

export function findSigungu(lawdCd: string): { sido: Sido; sigungu: Sigungu } | null {
  for (const sido of data.sido) {
    const sigungu = sido.sigungu.find((g) => g.code === lawdCd);
    if (sigungu) return { sido, sigungu };
  }
  return null;
}

export function listDongs(lawdCd: string): string[] {
  return findSigungu(lawdCd)?.sigungu.dongs ?? [];
}

/** "서울특별시 강남구 신사동" 형태의 이름 */
export function regionLabel(lawdCd: string, dong?: string): string {
  const found = findSigungu(lawdCd);
  if (!found) return lawdCd;
  return [found.sido.name, found.sigungu.name, dong].filter(Boolean).join(' ');
}
