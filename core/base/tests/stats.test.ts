import { describe, expect, it } from 'vitest';
import type { Deal } from '@/lib/molit';
import {
  areaBand,
  changePct,
  formatArea,
  formatManwon,
  formatPct,
  formatPerPyeong,
  median,
  monthlyStats,
  pricePerPyeong,
} from '@/lib/stats';
import { findSigungu, listDongs, listSigungu } from '@/lib/regions';

const deal = (over: Partial<Deal>): Deal => ({
  id: 'x', sggCd: '11680', dong: '신사동', aptName: 'A', aptDong: '', jibun: '1',
  areaM2: 84.97, floor: 10, priceManwon: 235000, contractDate: '2026-09-21',
  buildYear: 2004, dealType: '중개거래', cancelled: false, cancelDate: null, ...over,
});

describe('계산', () => {
  it('평당가 = 금액 ÷ (전용㎡ ÷ 3.3058)', () => {
    expect(Math.round(pricePerPyeong(deal({})))).toBe(9143);
  });
  it('중위값', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBeNull();
  });
  it('면적 구간 경계', () => {
    expect(areaBand(60)).toBe('60이하');
    expect(areaBand(84.99)).toBe('60~85');
    expect(areaBand(85)).toBe('60~85');
    expect(areaBand(85.01)).toBe('85~135');
    expect(areaBand(135.5)).toBe('135초과');
  });
  it('달별 통계는 해제를 빼고 빈 달도 넣는다', () => {
    const s = monthlyStats(
      [deal({}), deal({ cancelled: true }), deal({ contractDate: '2026-08-02', priceManwon: 200000 })],
      ['202607', '202608', '202609'],
    );
    expect(s.map((m) => m.count)).toEqual([0, 1, 1]);
    expect(s[2].cancelled).toBe(1);
    expect(s[0].medianPerPyeong).toBeNull();
  });
  it('변화율', () => {
    expect(changePct(9190, 9980)!.toFixed(1)).toBe('8.6');
    expect(changePct(null, 1)).toBeNull();
  });
});

describe('표기', () => {
  it('금액', () => {
    expect(formatManwon(235000)).toBe('23억 5,000');
    expect(formatManwon(230000)).toBe('23억');
    expect(formatManwon(8500)).toBe('8,500만');
  });
  it('평당가', () => {
    expect(formatPerPyeong(9980.4)).toBe('9,980만');
    expect(formatPerPyeong(10380)).toBe('1억 380만');
  });
  it('면적·변화율', () => {
    expect(formatArea(84.97)).toBe('84.97㎡ (25.7평)');
    expect(formatPct(8.63)).toBe('+8.6%');
    expect(formatPct(-1.04)).toBe('-1.0%');
  });
});

describe('지역', () => {
  it('강남구와 신사동', () => {
    expect(findSigungu('11680')?.sigungu.name).toBe('강남구');
    expect(listDongs('11680')).toContain('신사동');
  });
  it('2026 통합 지역은 새 코드(12xxx)를 쓴다', () => {
    expect(listSigungu('12').some((g) => g.code === '12330')).toBe(true);
  });
});
