// 거래 목록 → 화면에 쓰는 숫자. 계산 규칙은 docs/PRD.md 의 "숫자 규칙" 과 같다.
import type { Deal } from './molit';

/** 1평 = 400/121 ㎡ (약 3.3058㎡) */
export const M2_PER_PYEONG = 400 / 121;

export type AreaBand = '60이하' | '60~85' | '85~135' | '135초과';
export const AREA_BANDS: readonly AreaBand[] = ['60이하', '60~85', '85~135', '135초과'];
export const AREA_BAND_LABEL: Record<AreaBand, string> = {
  '60이하': '60㎡ 이하',
  '60~85': '60~85㎡',
  '85~135': '85~135㎡',
  '135초과': '135㎡ 초과',
};

/** 전용면적 구간. 85㎡ 이하가 국민주택규모라 경계는 '이하'로 자른다. */
export function areaBand(areaM2: number): AreaBand {
  if (areaM2 <= 60) return '60이하';
  if (areaM2 <= 85) return '60~85';
  if (areaM2 <= 135) return '85~135';
  return '135초과';
}

export function toPyeong(areaM2: number): number {
  return areaM2 / M2_PER_PYEONG;
}

/** 3.3㎡(1평)당 가격, 만원. 전용면적 기준. */
export function pricePerPyeong(deal: Pick<Deal, 'priceManwon' | 'areaM2'>): number {
  return deal.priceManwon / toPyeong(deal.areaM2);
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** 해제된 거래를 뺀다. 가격 통계는 항상 이것을 거친 목록으로 계산한다. */
export function validDeals(deals: readonly Deal[]): Deal[] {
  return deals.filter((d) => !d.cancelled && d.priceManwon > 0 && d.areaM2 > 0);
}

export type MonthStat = {
  /** YYYYMM */
  ym: string;
  /** 해제 제외 거래 건수 */
  count: number;
  /** 해제 건수 */
  cancelled: number;
  /** 3.3㎡당 중위 가격(만원), 거래가 없으면 null */
  medianPerPyeong: number | null;
};

const ymOf = (d: Deal): string => d.contractDate.slice(0, 7).replace('-', '');

/** 달별 건수와 중위 평당가. months 순서를 그대로 지키고, 거래 없는 달도 0 으로 넣는다. */
export function monthlyStats(deals: readonly Deal[], months: readonly string[]): MonthStat[] {
  return months.map((ym) => {
    const inMonth = deals.filter((d) => ymOf(d) === ym);
    const ok = validDeals(inMonth);
    return {
      ym,
      count: ok.length,
      cancelled: inMonth.length - ok.length,
      medianPerPyeong: median(ok.map(pricePerPyeong)),
    };
  });
}

/** a → b 변화율(%). 어느 한쪽이 없으면 null. */
export function changePct(from: number | null, to: number | null): number | null {
  if (from == null || to == null || from === 0) return null;
  return ((to - from) / from) * 100;
}

/** 거래가 이 수보다 적은 구간·달은 '표본 부족'으로 표시한다. */
export const MIN_SAMPLE = 3;

// ── 표기 ─────────────────────────────────────────────

/** 235000 → "23억 5,000", 230000 → "23억", 8500 → "8,500만" */
export function formatManwon(manwon: number): string {
  const n = Math.round(manwon);
  if (n >= 10000) {
    const eok = Math.floor(n / 10000);
    const rest = n % 10000;
    return rest === 0 ? `${eok}억` : `${eok}억 ${rest.toLocaleString('ko-KR')}`;
  }
  return `${n.toLocaleString('ko-KR')}만`;
}

/** 평당가 표기. 9980.4 → "9,980만", 10380 → "1억 380만" */
export function formatPerPyeong(manwon: number): string {
  const n = Math.round(manwon);
  if (n >= 10000) {
    const eok = Math.floor(n / 10000);
    const rest = n % 10000;
    return rest === 0 ? `${eok}억` : `${eok}억 ${rest.toLocaleString('ko-KR')}만`;
  }
  return `${n.toLocaleString('ko-KR')}만`;
}

/** 84.97 → "84.97㎡ (25.7평)" */
export function formatArea(areaM2: number): string {
  return `${areaM2.toFixed(2)}㎡ (${toPyeong(areaM2).toFixed(1)}평)`;
}

/** 8.63 → "+8.6%", -1.04 → "-1.0%" */
export function formatPct(pct: number): string {
  const r = Math.round(pct * 10) / 10;
  return `${r > 0 ? '+' : ''}${r.toFixed(1)}%`;
}

/** "2026-09-21" → "2026.09.21" */
export function formatDate(iso: string): string {
  return iso.replace(/-/g, '.');
}

/** "202609" → "2026.09" */
export function formatYm(ym: string): string {
  return `${ym.slice(0, 4)}.${ym.slice(4, 6)}`;
}
