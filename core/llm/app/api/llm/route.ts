// 브라우저 → 이 라우트 → 분석 모델 제공사. API 키는 요청 헤더(x-llm-key)로 받고 저장하지 않는다.
// 헤더가 없으면 서버 환경변수 LLM_API_KEY 를 쓰되, LLM_PROVIDER 가 요청한 제공사와 같을 때만 쓴다
// (한 제공사의 키가 다른 제공사로 새어 나가지 않게).
import { NextResponse, type NextRequest } from 'next/server';
import {
  chat,
  isProviderId,
  listModels,
  LlmError,
  llmErrorMessage,
  type LlmApiRequest,
  type LlmApiResponse,
  type LlmErrorCode,
} from '@/lib/llm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const STATUS: Record<LlmErrorCode, number> = {
  NO_KEY: 400,
  KEY_INVALID: 401,
  RATE_LIMITED: 429,
  MODEL_NOT_FOUND: 404,
  MODEL_UNSUPPORTED: 400,
  TRUNCATED: 502,
  EMPTY: 502,
  TIMEOUT: 504,
  UPSTREAM: 502,
};

const bad = (message: string) =>
  NextResponse.json<LlmApiResponse>({ ok: false, code: 'BAD_INPUT', message }, { status: 400 });

export async function POST(req: NextRequest): Promise<NextResponse<LlmApiResponse>> {
  let body: LlmApiRequest;
  try {
    body = (await req.json()) as LlmApiRequest;
  } catch {
    return bad('요청 형식이 잘못됐습니다.');
  }
  if (!isProviderId(body.provider)) return bad('제공사를 고르세요.');
  const headerKey = req.headers.get('x-llm-key')?.trim() ?? '';
  const serverKey = process.env.LLM_PROVIDER?.trim() === body.provider ? process.env.LLM_API_KEY?.trim() ?? '' : '';
  const apiKey = headerKey || serverKey;

  try {
    if (body.action === 'models') {
      return NextResponse.json({ ok: true, models: await listModels(body.provider, apiKey, { signal: req.signal }) });
    }
    if (body.action === 'chat') {
      if (typeof body.system !== 'string' || typeof body.user !== 'string' || typeof body.model !== 'string') {
        return bad('system, user, model 이 필요합니다.');
      }
      if (body.user.length > 60_000) return bad('보내는 자료가 너무 깁니다.');
      const result = await chat(
        { provider: body.provider, apiKey, model: body.model, system: body.system, user: body.user, maxTokens: body.maxTokens },
        { signal: req.signal },
      );
      return NextResponse.json({ ok: true, result });
    }
    return bad('action 은 models 또는 chat 입니다.');
  } catch (e) {
    const code: LlmErrorCode = e instanceof LlmError ? e.code : 'UPSTREAM';
    return NextResponse.json({ ok: false, code, message: llmErrorMessage(code) }, { status: STATUS[code] });
  }
}
