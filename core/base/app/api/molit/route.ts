// 브라우저 → 이 라우트 → 국토부. 인증키는 요청 헤더(x-molit-key)로 받고 어디에도 저장하지 않는다.
// 헤더가 없으면 서버 환경변수 MOLIT_API_KEY 를 쓴다(내 PC .env.local 또는 Vercel 환경변수).
import { NextResponse, type NextRequest } from 'next/server';
import {
  fetchMonth,
  MolitError,
  molitErrorMessage,
  type MolitApiResponse,
  type MolitErrorCode,
} from '@/lib/molit';
import { sampleMonth, SAMPLE_LAWD_CD } from '@/lib/sample';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATUS: Record<MolitErrorCode, number> = {
  NO_KEY: 400,
  BAD_INPUT: 400,
  KEY_INVALID: 401,
  QUOTA_EXCEEDED: 429,
  UPSTREAM: 502,
  TIMEOUT: 504,
  NETWORK: 502,
};

export async function GET(req: NextRequest): Promise<NextResponse<MolitApiResponse>> {
  const p = req.nextUrl.searchParams;
  const lawdCd = p.get('lawdCd') ?? '';
  const ym = p.get('ym') ?? '';

  if (p.get('sample') === '1') {
    if (lawdCd !== SAMPLE_LAWD_CD) {
      return NextResponse.json(
        { ok: false, code: 'SAMPLE_ONLY', message: '예시 데이터는 서울 강남구만 들어 있습니다.' },
        { status: 400 },
      );
    }
    return NextResponse.json({ ok: true, deals: sampleMonth(ym), sample: true });
  }

  const key = req.headers.get('x-molit-key')?.trim() || process.env.MOLIT_API_KEY?.trim() || '';
  try {
    const deals = await fetchMonth({ key, lawdCd, ym, signal: req.signal });
    return NextResponse.json({ ok: true, deals, sample: false });
  } catch (e) {
    if (e instanceof MolitError) {
      return NextResponse.json(
        { ok: false, code: e.code, message: molitErrorMessage(e.code) },
        { status: STATUS[e.code] },
      );
    }
    return NextResponse.json(
      { ok: false, code: 'UPSTREAM', message: molitErrorMessage('UPSTREAM') },
      { status: 500 },
    );
  }
}
