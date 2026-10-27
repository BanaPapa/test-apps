// 국토교통부 아파트 매매 실거래가 API 클라이언트.
// 서버(app/api 라우트, scripts)에서만 쓴다. 브라우저에서 직접 부르면 CORS 로 막힌다.
//
// 이 파일은 실제 응답으로 검증된 부품이다. 고치기 전에 docs/API_MOLIT.md 를 먼저 읽을 것.
import dns from 'node:dns';

// 일부 PC·회선에서 Node 가 IPv6 로 apis.data.go.kr 에 붙으려다 10초 뒤 끊긴다(실측).
// IPv4 를 먼저 쓰게 하면 해결된다.
dns.setDefaultResultOrder('ipv4first');

const ENDPOINT = 'https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade';
const PAGE_SIZE = 1000;
const TIMEOUT_MS = 15_000;

export type Deal = {
  /** 같은 거래를 날마다 비교할 때 쓰는 열쇠. 해제 여부는 열쇠에 넣지 않는다. */
  id: string;
  sggCd: string;
  /** 법정동 이름 (예: 신사동) */
  dong: string;
  aptName: string;
  /** 동 번호. 대부분 비어 있다. */
  aptDong: string;
  jibun: string;
  /** 전용면적 ㎡ */
  areaM2: number;
  floor: number;
  /** 거래금액, 만원 */
  priceManwon: number;
  /** 계약일 YYYY-MM-DD */
  contractDate: string;
  buildYear: number | null;
  /** 중개거래 · 직거래 */
  dealType: string;
  /** 계약이 해제(취소)됐으면 true */
  cancelled: boolean;
  /** 해제 사유 발생일 YYYY-MM-DD, 없으면 null */
  cancelDate: string | null;
};

export type MolitErrorCode =
  | 'NO_KEY'
  | 'KEY_INVALID'
  | 'QUOTA_EXCEEDED'
  | 'BAD_INPUT'
  | 'UPSTREAM'
  | 'TIMEOUT'
  | 'NETWORK';

/** /api/molit 라우트의 응답 모양 */
export type MolitApiResponse =
  | { ok: true; deals: Deal[]; sample: boolean }
  | { ok: false; code: MolitErrorCode | 'SAMPLE_ONLY'; message: string };

export class MolitError extends Error {
  constructor(public code: MolitErrorCode, message: string) {
    super(message);
    this.name = 'MolitError';
  }
}

/** 화면에 그대로 보여줄 수 있는 한국어 안내 */
export function molitErrorMessage(code: MolitErrorCode): string {
  switch (code) {
    case 'NO_KEY':
      return '공공데이터포털 인증키가 없습니다. 화면 위쪽 인증키 칸에 붙여 넣으세요.';
    case 'KEY_INVALID':
      return '인증키가 맞지 않습니다. 발급 직후라면 1~2시간 뒤에 다시 해 보세요. 그래도 안 되면 "국토교통부_아파트 매매 실거래가 자료" 활용신청이 승인됐는지 확인하세요.';
    case 'QUOTA_EXCEEDED':
      return '오늘 쓸 수 있는 조회 횟수를 다 썼습니다. 내일 다시 하거나 공공데이터포털에서 트래픽 증가를 신청하세요.';
    case 'BAD_INPUT':
      return '지역 코드나 계약년월 형식이 잘못됐습니다.';
    case 'TIMEOUT':
      return '국토부 서버가 응답하지 않습니다. 잠시 뒤 다시 시도하세요.';
    case 'NETWORK':
      return '국토부 서버에 연결하지 못했습니다. 인터넷 연결을 확인하세요.';
    default:
      return '국토부 서버에서 오류가 났습니다. 잠시 뒤 다시 시도하세요.';
  }
}

/** 디코딩 키(+, / 포함)와 인코딩 키(%2B 등 포함) 둘 다 받는다. */
export function normalizeKey(raw: string): string {
  const key = raw.trim();
  if (!key.includes('%')) return key;
  try {
    return decodeURIComponent(key);
  } catch {
    return key;
  }
}

const text = (v: unknown): string => String(v ?? '').trim();
const pad2 = (v: unknown): string => text(v).padStart(2, '0');

/** 해제일은 "26.10.03" 처럼 두 자리 연도로 온다. */
function toCancelDate(raw: string): string | null {
  const m = raw.match(/^(\d{2,4})\.(\d{1,2})\.(\d{1,2})$/);
  if (!m) return raw ? raw : null;
  const year = m[1].length === 2 ? `20${m[1]}` : m[1];
  return `${year}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
}

type RawItem = Record<string, unknown>;

export function toDeal(item: RawItem): Deal {
  const cancelRaw = text(item.cdealDay);
  const base = {
    sggCd: text(item.sggCd),
    dong: text(item.umdNm),
    aptName: text(item.aptNm),
    aptDong: text(item.aptDong),
    jibun: text(item.jibun),
    areaM2: Number(item.excluUseAr),
    floor: Number(item.floor),
    priceManwon: Number(text(item.dealAmount).replace(/,/g, '')),
    contractDate: `${text(item.dealYear)}-${pad2(item.dealMonth)}-${pad2(item.dealDay)}`,
    buildYear: text(item.buildYear) ? Number(item.buildYear) : null,
    dealType: text(item.dealingGbn),
    cancelled: cancelRaw !== '',
    cancelDate: cancelRaw ? toCancelDate(cancelRaw) : null,
  };
  const id = [
    base.sggCd,
    base.dong,
    base.jibun,
    base.aptName,
    base.aptDong,
    base.floor,
    base.areaM2,
    base.contractDate,
    base.priceManwon,
  ].join('|');
  return { id, ...base };
}

/** 같은 날 같은 층·면적·금액 거래가 둘 이상이면 id 뒤에 #2, #3 을 붙여 구분한다. */
export function uniqueIds(deals: Deal[]): Deal[] {
  const seen = new Map<string, number>();
  return deals.map((d) => {
    const n = (seen.get(d.id) ?? 0) + 1;
    seen.set(d.id, n);
    return n === 1 ? d : { ...d, id: `${d.id}#${n}` };
  });
}

type Parsed = { items: RawItem[]; totalCount: number };

type MolitJson = {
  OpenAPI_ServiceResponse?: { cmmMsgHeader?: { errMsg?: unknown; returnAuthMsg?: unknown } };
  response?: {
    header?: { resultCode?: unknown; resultMsg?: unknown };
    body?: { items?: unknown; totalCount?: unknown };
  };
};

/** 응답 본문(JSON 또는 XML 오류 문서)을 해석한다. 오류면 MolitError 를 던진다. */
export function parseMolitBody(body: string, httpStatus = 200): Parsed {
  const trimmed = body.trim();
  if (trimmed.startsWith('<')) {
    const errMsg = trimmed.match(/<errMsg>([^<]*)<\/errMsg>/)?.[1] ?? '';
    const auth = trimmed.match(/<returnAuthMsg>([^<]*)<\/returnAuthMsg>/)?.[1] ?? '';
    throw classify(`${errMsg} ${auth}`.trim() || `HTTP ${httpStatus}`);
  }
  let json: MolitJson;
  try {
    json = JSON.parse(trimmed) as MolitJson;
  } catch {
    throw new MolitError('UPSTREAM', `응답을 해석하지 못했습니다 (HTTP ${httpStatus})`);
  }
  const svc = json?.OpenAPI_ServiceResponse?.cmmMsgHeader;
  if (svc) throw classify(`${text(svc.errMsg)} ${text(svc.returnAuthMsg)}`);

  const header = json?.response?.header;
  const code = text(header?.resultCode);
  if (code !== '00' && code !== '000') {
    throw classify(`${code} ${text(header?.resultMsg)}`);
  }
  const b = json.response?.body ?? {};
  // 거래가 없으면 items 가 빈 문자열 "" 로 온다. 1건이면 item 이 배열이 아니라 객체로 온다.
  const raw = b.items && typeof b.items === 'object' ? (b.items as { item?: unknown }).item : undefined;
  const items = (Array.isArray(raw) ? raw : raw ? [raw] : []) as RawItem[];
  return { items, totalCount: Number(b.totalCount ?? items.length) };
}

function classify(msg: string): MolitError {
  if (/SERVICE_KEY|SERVICE KEY|등록되지 않은|인증/.test(msg)) return new MolitError('KEY_INVALID', msg);
  if (/LIMITED_NUMBER|EXCEEDS|초과/.test(msg)) return new MolitError('QUOTA_EXCEEDED', msg);
  if (/INVALID_REQUEST_PARAMETER|파라미터|NO_MANDATORY/.test(msg)) return new MolitError('BAD_INPUT', msg);
  return new MolitError('UPSTREAM', msg);
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type FetchMonthOptions = {
  key: string;
  /** 시군구 5자리 (예: 11680 강남구) */
  lawdCd: string;
  /** 계약년월 6자리 (예: 202609) */
  ym: string;
  fetchImpl?: FetchLike;
  signal?: AbortSignal;
};

async function getPage(opts: FetchMonthOptions, pageNo: number): Promise<Parsed> {
  const params = new URLSearchParams({
    serviceKey: normalizeKey(opts.key),
    LAWD_CD: opts.lawdCd,
    DEAL_YMD: opts.ym,
    pageNo: String(pageNo),
    numOfRows: String(PAGE_SIZE),
    _type: 'json',
  });
  const doFetch = opts.fetchImpl ?? fetch;
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;
  let status: number;
  let body: string;
  try {
    // 본문을 다 읽을 때까지 같은 try 안에 둔다. 머리만 오고 본문이 끊겨도 TIMEOUT/NETWORK 로 분류된다.
    const res = await doFetch(`${ENDPOINT}?${params}`, { signal, cache: 'no-store' });
    status = res.status;
    body = await res.text();
  } catch (e) {
    const name = (e as Error)?.name;
    if (name === 'TimeoutError' || (name === 'AbortError' && timeout.aborted)) {
      throw new MolitError('TIMEOUT', '응답 시간 초과');
    }
    if (name === 'AbortError') throw e; // 사용자가 중지
    throw new MolitError('NETWORK', (e as Error)?.message ?? '연결 실패');
  }
  return parseMolitBody(body, status);
}

/** 한 시군구의 한 달 치 거래를 전부 받는다(1000건씩 나눠 받음). */
export async function fetchMonth(opts: FetchMonthOptions): Promise<Deal[]> {
  if (!opts.key?.trim()) throw new MolitError('NO_KEY', '인증키 없음');
  if (!/^\d{5}$/.test(opts.lawdCd) || !/^\d{6}$/.test(opts.ym)) {
    throw new MolitError('BAD_INPUT', `lawdCd=${opts.lawdCd} ym=${opts.ym}`);
  }
  const first = await getPage(opts, 1);
  const items = [...first.items];
  const pages = Math.ceil(first.totalCount / PAGE_SIZE);
  for (let p = 2; p <= pages; p++) {
    const next = await getPage(opts, p);
    items.push(...next.items);
  }
  return uniqueIds(items.map(toDeal));
}

// 서버 코드가 한 곳에서 import 할 수 있게 다시 내보낸다. 화면 코드는 lib/months.ts 를 직접 쓴다.
export { monthsBack, currentYm, monthsBetween } from './months';
