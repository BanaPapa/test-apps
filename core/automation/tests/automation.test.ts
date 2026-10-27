import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { uniqueIds, type Deal } from '@/lib/molit';
import { diffSnapshot, readSnapshot, watchMonths, windowLabel, writeSnapshot, type DiffOptions } from '@/lib/snapshot';
import { isSlackWebhookUrl, postSlack, slackEscape } from '@/lib/slack';
import { optionalEnv, requireEnv } from '@/lib/env';

let seq = 0;
const deal = (over: Partial<Deal> = {}): Deal => {
  const base: Deal = {
    id: '', sggCd: '11680', dong: '신사동', aptName: 'A', aptDong: '', jibun: '1', areaM2: 84.9, floor: 3,
    priceManwon: 200000 + seq++, contractDate: '2026-10-05', buildYear: 2004, dealType: '중개거래', cancelled: false, cancelDate: null,
    ...over,
  };
  const id = over.id ?? [base.sggCd, base.dong, base.jibun, base.aptName, base.aptDong, base.floor, base.areaM2, base.contractDate, base.priceManwon].join('|');
  return { ...base, id };
};
const opts = (over: Partial<DiffOptions> = {}): DiffOptions => ({
  scopeOf: (d) => `${d.sggCd}|${d.dong}`,
  scopes: ['11680|신사동'],
  newWindow: ['202608', '202609', '202610'],
  ...over,
});

describe('스냅샷 비교', () => {
  it('처음 실행은 기준선만 만든다', () => {
    const r = diffSnapshot(null, [deal(), deal()], opts());
    expect(r.baseline).toBe(true);
    expect(r.added).toEqual([]);
    expect(r.previousAt).toBeNull();
    expect(Object.keys(r.next.groups)).toHaveLength(2);
  });
  it('새로 나타난 거래와 새 해제를 찾는다', () => {
    const a = deal();
    const b = deal();
    const prev = diffSnapshot(null, [a, b], opts()).next;
    const c = deal();
    const r = diffSnapshot(prev, [{ ...a, cancelled: true }, b, c], opts());
    expect(r.baseline).toBe(false);
    // a 가 해제되고 c 가 새로 들어왔다
    expect(r.added.map((d) => d.id)).toEqual([c.id]);
    expect(r.newlyCancelled.map((d) => d.id)).toEqual([a.id]);
    expect(r.previousAt).toBe(prev.savedAt);
  });
  it('이미 해제였던 것은 다시 알리지 않는다', () => {
    const a = deal({ cancelled: true });
    const prev = diffSnapshot(null, [a], opts()).next;
    expect(diffSnapshot(prev, [a], opts()).newlyCancelled).toEqual([]);
  });
  it('같은 모양 거래 두 건의 응답 순서가 바뀌어도 거짓 해제가 없다', () => {
    const same = { contractDate: '2026-10-05', priceManwon: 150000, floor: 5 };
    const [n1, c1] = uniqueIds([deal(same), deal({ ...same, cancelled: true })]);
    const prev = diffSnapshot(null, [n1, c1], opts()).next;
    const swapped = uniqueIds([deal({ ...same, cancelled: true }), deal(same)]);
    const r = diffSnapshot(prev, swapped, opts());
    expect(r.newlyCancelled).toEqual([]);
    expect(r.added).toEqual([]);
  });
  it('같은 모양 거래가 한 건 더 들어오면 한 건만 새 거래', () => {
    const same = { contractDate: '2026-10-05', priceManwon: 150000, floor: 5 };
    const prev = diffSnapshot(null, uniqueIds([deal(same)]), opts()).next;
    const r = diffSnapshot(prev, uniqueIds([deal(same), deal(same)]), opts());
    expect(r.added).toHaveLength(1);
  });
  it('몇 달 전 계약의 해제도 잡는다', () => {
    const old = deal({ contractDate: '2026-06-19' });
    const prev = diffSnapshot(null, [old], opts()).next;
    const r = diffSnapshot(prev, [{ ...old, cancelled: true, cancelDate: '2026-10-08' }], opts());
    expect(r.newlyCancelled).toHaveLength(1);
  });
  it('새 거래는 newWindow 안의 계약만 센다', () => {
    const prev = diffSnapshot(null, [], opts()).next;
    const r = diffSnapshot(prev, [deal({ contractDate: '2026-05-02' }), deal({ contractDate: '2026-10-02' })], opts());
    expect(r.added.map((d) => d.contractDate)).toEqual(['2026-10-02']);
  });
  it('감시 대상을 새로 더하면 그 대상은 기준선만 만들고 알리지 않는다', () => {
    const prev = diffSnapshot(null, [deal()], opts()).next;
    const r = diffSnapshot(
      prev,
      [deal(), deal({ dong: '압구정동' }), deal({ dong: '압구정동' })],
      opts({ scopes: ['11680|신사동', '11680|압구정동'] }),
    );
    expect(r.newScopes).toEqual(['11680|압구정동']);
    expect(r.added.filter((d) => d.dong === '압구정동')).toEqual([]);
    expect(r.next.scopes).toContain('11680|압구정동');
  });
  it('기존 정상 1건 + 같은 묶음의 해제 1건이 새로 보이면, 기존 거래를 새 거래로 알리지 않는다', () => {
    const same = { contractDate: '2026-10-05', priceManwon: 150000, floor: 5 };
    const prev = diffSnapshot(null, uniqueIds([deal(same)]), opts()).next;
    const r = diffSnapshot(prev, uniqueIds([deal(same), deal({ ...same, cancelled: true })]), opts());
    expect(r.added).toEqual([]);
    expect(r.newlyCancelled).toHaveLength(1);
  });
  it('해제 상태로 처음 확인된 거래도 새 해제로 알린다(오래된 계약이어도)', () => {
    const a = deal();
    const prev = diffSnapshot(null, [a], opts()).next;
    const r = diffSnapshot(prev, [a, deal({ contractDate: '2026-04-11', cancelled: true })], opts());
    expect(r.added).toEqual([]);
    expect(r.newlyCancelled.map((d) => d.contractDate)).toEqual(['2026-04-11']);
  });
  it('파일로 저장하고 다시 읽는다', () => {
    const dir = mkdtempSync(join(tmpdir(), 'snap-'));
    const path = join(dir, 'state', 's.json');
    expect(readSnapshot(path)).toBeNull();
    writeSnapshot(path, diffSnapshot(null, [deal()], opts()).next);
    expect(readSnapshot(path)?.version).toBe(2);
  });
  it('비교할 달은 이번 달 포함 3개월(해를 넘김)', () => {
    expect(watchMonths('202601')).toEqual(['202511', '202512', '202601']);
    expect(watchMonths('202610', 0)).toEqual(['202609', '202610']);
  });
  it('확인 구간 표기(한국 시간)', () => {
    expect(windowLabel('2026-10-18T23:04:00Z', new Date('2026-10-19T23:03:00Z'))).toBe('10월 19일 08:04 ~ 10월 20일 08:03');
  });
});

describe('슬랙', () => {
  it('Webhook 주소 모양 검사', () => {
    expect(isSlackWebhookUrl('https://hooks.slack.com/services/T0/B0/xyz')).toBe(true);
    expect(isSlackWebhookUrl('http://hooks.slack.com/services/T0')).toBe(false);
    expect(isSlackWebhookUrl('https://example.com/services/T0')).toBe(false);
  });
  it('ok 가 아니면 실패로 본다', async () => {
    const fake = async () => new Response('invalid_token', { status: 403 });
    await expect(postSlack('https://hooks.slack.com/services/T0/B0/x', { text: 'hi' }, fake)).rejects.toMatchObject({ code: 'REJECTED' });
  });
  it('보내는 모양', async () => {
    let sent: RequestInit | undefined;
    const fake = async (_u: string, init?: RequestInit) => { sent = init; return new Response('ok'); };
    await postSlack('https://hooks.slack.com/services/T0/B0/x', { text: 'hi' }, fake);
    expect(JSON.parse(String(sent?.body))).toEqual({ text: 'hi' });
  });
  it('본문을 읽다 끊겨도 정해진 오류로', async () => {
    const fake = async () => ({ ok: true, status: 200, text: async () => { throw new TypeError('terminated'); } }) as unknown as Response;
    await expect(postSlack('https://hooks.slack.com/services/T0/B0/x', { text: 'hi' }, fake)).rejects.toMatchObject({ code: 'NETWORK' });
  });
  it('특수문자 막기', () => {
    expect(slackEscape('<a&b>')).toBe('&lt;a&amp;b&gt;');
  });
});

describe('환경변수', () => {
  it('빠진 이름을 모두 알려 준다', () => {
    delete process.env.NOPE_A;
    delete process.env.NOPE_B;
    expect(() => requireEnv(['NOPE_A', 'NOPE_B'] as const)).toThrow(/NOPE_A, NOPE_B/);
    expect(optionalEnv('NOPE_A')).toBeNull();
  });
});
