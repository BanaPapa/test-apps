// "지난 확인 이후 새로 확인된 거래"를 찾는 장치.
// 국토부 API 에는 신고일 필드가 없다. 그래서 매번 받은 거래 목록을 요약해 저장해 두고(스냅샷),
// 다음 확인 때 목록과 비교해 새로 나타난 것을 '새 거래', 해제 표시가 새로 붙은 것을 '새 해제'로 본다.
//
// 설계 규칙 (docs/AUTOMATION.md 2절):
// 1. 같은 날·같은 층·같은 면적·같은 금액 거래는 구별할 방법이 없다. 그래서 거래 하나하나가 아니라
//    '같은 모양 묶음(group)'의 전체 건수와 해제 건수를 저장하고, 늘어난 만큼만 새 것으로 본다.
//    응답 순서가 바뀌어도 결과가 같다.
// 2. 새 거래는 newWindow(최근 몇 달) 안의 계약만 센다. 해제는 받은 기간 전체에서 센다
//    (해제는 계약 몇 달 뒤에도 일어난다).
// 3. 감시 대상(scope: 동, 단지 등)이 새로 추가되면 그 대상은 이번에 기준선만 만들고 알리지 않는다.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Deal } from './molit';

export type Snapshot = {
  version: 2;
  /** 저장 시각 ISO */
  savedAt: string;
  /** 이 스냅샷이 기준선을 가진 감시 대상들 */
  scopes: string[];
  /** 묶음 열쇠 → [전체 건수, 해제 건수] */
  groups: Record<string, [number, number]>;
};

export type DiffOptions = {
  /** 거래가 어느 감시 대상에 속하는지 (예: d => `${d.sggCd}|${d.dong}`) */
  scopeOf: (d: Deal) => string;
  /** 이번에 감시하는 대상 전체. 거래가 0건인 대상도 넣는다 */
  scopes: string[];
  /** 새 거래로 셀 계약월 YYYYMM 목록 (보통 watchMonths(currentYm())) */
  newWindow: string[];
  now?: Date;
};

export type DiffResult = {
  /** 스냅샷이 처음이라 전체 기준선만 만든 경우 true. 이때 added/newlyCancelled 는 비어 있다 */
  baseline: boolean;
  /** 이번에 처음 들어온 감시 대상(기준선만 만들고 알리지 않음) */
  newScopes: string[];
  /** 새로 확인된 정상 거래 (newWindow 안의 계약만, 해제 상태인 거래는 들어가지 않는다) */
  added: Deal[];
  /** 새로 확인된 해제: 기존 거래에 해제 표시가 붙었거나, 해제 상태로 처음 확인된 거래 (받은 기간 전체) */
  newlyCancelled: Deal[];
  /** 지난 스냅샷 저장 시각. 처음이면 null */
  previousAt: string | null;
  /** 저장할 새 스냅샷 */
  next: Snapshot;
};

/** 같은 모양 묶음 열쇠: uniqueIds 가 붙인 #2, #3 을 뗀 id */
export const groupKeyOf = (d: Deal): string => d.id.replace(/#\d+$/, '');

const ymOf = (d: Deal): string => d.contractDate.slice(0, 7).replace('-', '');

export function diffSnapshot(prev: Snapshot | null, deals: readonly Deal[], opts: DiffOptions): DiffResult {
  const groups = new Map<string, Deal[]>();
  for (const d of deals) {
    const k = groupKeyOf(d);
    groups.set(k, [...(groups.get(k) ?? []), d]);
  }
  const next: Snapshot = {
    version: 2,
    savedAt: (opts.now ?? new Date()).toISOString(),
    scopes: [...new Set(opts.scopes)].sort(),
    groups: Object.fromEntries(
      [...groups].map(([k, list]) => [k, [list.length, list.filter((d) => d.cancelled).length] as [number, number]]),
    ),
  };
  if (!prev) {
    return { baseline: true, newScopes: next.scopes, added: [], newlyCancelled: [], previousAt: null, next };
  }

  const known = new Set(prev.scopes);
  const newScopes = next.scopes.filter((s) => !known.has(s));
  const fresh = new Set(newScopes);
  const window = new Set(opts.newWindow);
  const added: Deal[] = [];
  const newlyCancelled: Deal[] = [];

  for (const [k, list] of groups) {
    if (fresh.has(opts.scopeOf(list[0]))) continue;
    const [prevTotal, prevCancelled] = prev.groups[k] ?? [0, 0];
    const normalsNow = list.filter((d) => !d.cancelled);
    const cancelledNow = list.filter((d) => d.cancelled);
    // 새 정상 거래: 정상 건수가 늘어난 만큼만 센다(보수적).
    // 같은 묶음에서 "기존 거래가 해제됨"과 "새 정상 거래가 들어옴"이 동시에 일어나면 건수만으로는 구별할 수 없어
    // 새 정상 거래를 놓칠 수 있다. 대신 기존 거래를 새 거래로 잘못 알리지는 않는다.
    const newNormals = normalsNow.length - (prevTotal - prevCancelled);
    if (newNormals > 0 && window.has(ymOf(list[0]))) added.push(...normalsNow.slice(0, newNormals));
    // 새 해제: 해제 건수가 늘어난 만큼. 기존 거래가 해제된 것과, 처음부터 해제 상태로 처음 확인된 것을 함께 센다
    // ("새로 확인된 해제"). 해제는 계약 몇 달 뒤에도 나오므로 newWindow 와 상관없이 받은 기간 전체에서 센다.
    const moreCancelled = cancelledNow.length - prevCancelled;
    if (moreCancelled > 0) newlyCancelled.push(...cancelledNow.slice(0, moreCancelled));
  }
  return { baseline: false, newScopes, added, newlyCancelled, previousAt: prev.savedAt, next };
}

export function readSnapshot(path: string): Snapshot | null {
  if (!existsSync(path)) return null;
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as Snapshot;
  if (parsed?.version !== 2 || typeof parsed.groups !== 'object' || !Array.isArray(parsed.scopes)) {
    throw new Error(`스냅샷 형식이 다릅니다: ${path}. 파일을 지우면 다음 실행에서 기준선을 다시 만듭니다.`);
  }
  return parsed;
}

export function writeSnapshot(path: string, snap: Snapshot): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(snap)}\n`, 'utf8');
}

/**
 * 새 거래로 셀 달. 실거래 신고 기한은 계약 후 30일이므로 '이번 달 + 지난달'이면 새 신고를 놓치지 않는다.
 * 늦은 정정 신고를 위해 기본으로 한 달을 더 본다.
 */
export function watchMonths(nowYm: string, extra = 1): string[] {
  const y = Number(nowYm.slice(0, 4));
  const m = Number(nowYm.slice(4, 6));
  const out: string[] = [];
  for (let i = 1 + extra; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push(`${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

/** 두 시각 사이를 "10월 19일 08:04 ~ 10월 20일 08:03" 처럼 한국 시간으로 */
export function windowLabel(fromIso: string | null, to: Date): string {
  const fmt = (d: Date) => {
    const k = new Date(d.getTime() + 9 * 3600_000);
    const hh = String(k.getUTCHours()).padStart(2, '0');
    const mm = String(k.getUTCMinutes()).padStart(2, '0');
    return `${k.getUTCMonth() + 1}월 ${k.getUTCDate()}일 ${hh}:${mm}`;
  };
  return fromIso ? `${fmt(new Date(fromIso))} ~ ${fmt(to)}` : `~ ${fmt(to)}`;
}
