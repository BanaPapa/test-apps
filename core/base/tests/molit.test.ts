import { describe, expect, it } from 'vitest';
import {
  fetchMonth,
  MolitError,
  monthsBack,
  monthsBetween,
  currentYm,
  normalizeKey,
  parseMolitBody,
  toDeal,
} from '@/lib/molit';
import { sampleMonth, SAMPLE_MONTHS } from '@/lib/sample';

const item = {
  aptDong: ' ',
  aptNm: '개포우성3차',
  buildYear: 1984,
  cdealDay: ' ',
  dealAmount: '295,000',
  dealDay: 22,
  dealMonth: 9,
  dealYear: 2026,
  dealingGbn: '중개거래',
  excluUseAr: 104.43,
  floor: 7,
  jibun: 652,
  sggCd: 11680,
  umdNm: '개포동',
};
const ok = (items: unknown, total: number) =>
  JSON.stringify({ response: { header: { resultCode: '000', resultMsg: 'OK' }, body: { items, numOfRows: 1000, pageNo: 1, totalCount: total } } });

describe('parseMolitBody', () => {
  it('여러 건은 배열로', () => {
    expect(parseMolitBody(ok({ item: [item, item] }, 2)).items).toHaveLength(2);
  });
  it('1건이면 객체로 와도 배열로 바꾼다', () => {
    expect(parseMolitBody(ok({ item }, 1)).items).toHaveLength(1);
  });
  it('0건이면 items 가 빈 문자열이다', () => {
    expect(parseMolitBody(ok('', 0)).items).toEqual([]);
  });
  it('등록되지 않은 키 → KEY_INVALID', () => {
    const body = JSON.stringify({ OpenAPI_ServiceResponse: { cmmMsgHeader: { errMsg: 'SERVICE_KEY_IS_NOT_REGISTERED_ERROR', returnAuthMsg: '등록되지 않은 서비스키' } } });
    expect(() => parseMolitBody(body, 403)).toThrow(MolitError);
    try { parseMolitBody(body, 403); } catch (e) { expect((e as MolitError).code).toBe('KEY_INVALID'); }
  });
  it('XML 오류 문서도 해석한다', () => {
    const xml = '<OpenAPI_ServiceResponse><cmmMsgHeader><errMsg>SERVICE ERROR</errMsg><returnAuthMsg>LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR</returnAuthMsg></cmmMsgHeader></OpenAPI_ServiceResponse>';
    try { parseMolitBody(xml, 200); expect.fail(); } catch (e) { expect((e as MolitError).code).toBe('QUOTA_EXCEEDED'); }
  });
});

describe('toDeal', () => {
  it('금액·날짜·면적을 바꾼다', () => {
    const d = toDeal(item);
    expect(d.priceManwon).toBe(295000);
    expect(d.contractDate).toBe('2026-09-22');
    expect(d.areaM2).toBe(104.43);
    expect(d.dong).toBe('개포동');
    expect(d.aptDong).toBe('');
    expect(d.cancelled).toBe(false);
    expect(d.cancelDate).toBeNull();
  });
  it('해제일 "26.10.03" → 2026-10-03', () => {
    const d = toDeal({ ...item, cdealDay: '26.10.03', cdealType: 'O' });
    expect(d.cancelled).toBe(true);
    expect(d.cancelDate).toBe('2026-10-03');
  });
  it('해제돼도 id 는 같다(날마다 비교할 수 있게)', () => {
    expect(toDeal({ ...item, cdealDay: '26.10.03' }).id).toBe(toDeal(item).id);
  });
});

describe('fetchMonth', () => {
  it('1000건이 넘으면 다음 쪽까지 받는다', async () => {
    const pages: string[] = [];
    const many = Array.from({ length: 1000 }, (_, i) => ({ ...item, floor: i + 1 }));
    const fake = async (url: string) => {
      pages.push(new URL(url).searchParams.get('pageNo')!);
      const p = new URL(url).searchParams.get('pageNo');
      return new Response(p === '1' ? ok({ item: many }, 1001) : ok({ item }, 1001));
    };
    const deals = await fetchMonth({ key: 'k', lawdCd: '11680', ym: '202609', fetchImpl: fake });
    expect(pages).toEqual(['1', '2']);
    expect(deals).toHaveLength(1001);
    expect(new Set(deals.map((d) => d.id)).size).toBe(1001);
  });
  it('본문을 읽다 시간이 초과되면 TIMEOUT', async () => {
    const fake = async () => ({
      status: 200,
      text: async () => { throw new DOMException('timed out', 'TimeoutError'); },
    }) as unknown as Response;
    await expect(fetchMonth({ key: 'k', lawdCd: '11680', ym: '202609', fetchImpl: fake })).rejects.toMatchObject({ code: 'TIMEOUT' });
  });
  it('본문을 읽다 끊기면 NETWORK', async () => {
    const fake = async () => ({ status: 200, text: async () => { throw new TypeError('terminated'); } }) as unknown as Response;
    await expect(fetchMonth({ key: 'k', lawdCd: '11680', ym: '202609', fetchImpl: fake })).rejects.toMatchObject({ code: 'NETWORK' });
  });
  it('키가 없으면 부르지 않고 NO_KEY', async () => {
    await expect(fetchMonth({ key: ' ', lawdCd: '11680', ym: '202609' })).rejects.toMatchObject({ code: 'NO_KEY' });
  });
  it('인코딩 키는 한 번만 인코딩돼 나간다', async () => {
    let sent = '';
    const fake = async (url: string) => { sent = url; return new Response(ok('', 0)); };
    await fetchMonth({ key: 'ab%2Bcd%3D%3D', lawdCd: '11680', ym: '202609', fetchImpl: fake });
    expect(sent).toContain('serviceKey=ab%2Bcd%3D%3D');
    expect(normalizeKey('ab%2Bcd%3D%3D')).toBe('ab+cd==');
  });
});

describe('달 계산', () => {
  it('monthsBack 은 해를 넘긴다', () => {
    expect(monthsBack('202602', 4)).toEqual(['202511', '202512', '202601', '202602']);
  });
  it('currentYm 은 한국 시간 기준', () => {
    expect(currentYm(new Date('2026-09-30T16:00:00Z'))).toBe('202610');
  });
  it('monthsBetween', () => {
    expect(monthsBetween('202511', '202602')).toEqual(['202511', '202512', '202601', '202602']);
    expect(monthsBetween('202603', '202602')).toEqual([]);
  });
});

describe('예시 데이터', () => {
  it('13개월이 들어 있고 해석된다', () => {
    expect(SAMPLE_MONTHS).toHaveLength(13);
    const deals = sampleMonth('202609');
    expect(deals.length).toBeGreaterThan(100);
    expect(deals.every((d) => d.sggCd === '11680')).toBe(true);
  });
  it('없는 달은 빈 배열', () => {
    expect(sampleMonth('201001')).toEqual([]);
  });
});
