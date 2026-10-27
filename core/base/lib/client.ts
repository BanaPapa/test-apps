// 브라우저에서 쓰는 도우미. 인증키 보관과 /api/molit 호출을 맡는다.
// 'use client' 컴포넌트에서만 import 할 것.
import type { Deal, MolitApiResponse } from './molit';

const KEY_STORAGE = 'realdeal.molitKey';

/** 이 브라우저에 저장한 인증키. 저장소를 못 쓰는 환경이면 빈 문자열. */
export function loadMolitKey(): string {
  try {
    return localStorage.getItem(KEY_STORAGE) ?? '';
  } catch {
    return '';
  }
}

export function saveMolitKey(key: string): void {
  try {
    if (key.trim()) localStorage.setItem(KEY_STORAGE, key.trim());
    else localStorage.removeItem(KEY_STORAGE);
  } catch {
    // 시크릿 창 등에서는 저장이 안 된다. 이번 화면에서만 쓰고 넘어간다.
  }
}

/** 화면에 키를 보여줄 때: 끝 4자리만 */
export function maskKey(key: string): string {
  return key ? `••••••••${key.slice(-4)}` : '';
}

export class DealsError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'DealsError';
  }
}

export type FetchDealsOptions = {
  lawdCd: string;
  /** YYYYMM 목록. 이 순서대로 한 달씩 받는다. */
  months: string[];
  /** 비우면 서버 환경변수 키를 쓴다 */
  key?: string;
  /** true 면 예시 데이터(강남구)로 받는다 */
  sample?: boolean;
  /** 한 달을 받을 때마다 불린다: (끝난 달 수, 전체 달 수) */
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
};

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 여러 달을 차례로 받아 하나로 합친다. 국토부 서버를 배려해 달 사이에 0.3초 쉰다. */
export async function fetchDeals(opts: FetchDealsOptions): Promise<Deal[]> {
  const all: Deal[] = [];
  for (let i = 0; i < opts.months.length; i++) {
    const qs = new URLSearchParams({ lawdCd: opts.lawdCd, ym: opts.months[i] });
    if (opts.sample) qs.set('sample', '1');
    const headers: Record<string, string> = {};
    if (opts.key?.trim()) headers['x-molit-key'] = opts.key.trim();
    const res = await fetch(`/api/molit?${qs}`, { headers, signal: opts.signal, cache: 'no-store' });
    const body = (await res.json()) as MolitApiResponse;
    if (!body.ok) throw new DealsError(body.code, body.message);
    all.push(...body.deals);
    opts.onProgress?.(i + 1, opts.months.length);
    if (!opts.sample && i < opts.months.length - 1) await pause(300);
  }
  return all;
}
