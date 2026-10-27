// 분석 모델(LLM) 연결. 서버(app/api/llm 라우트, scripts)에서만 쓴다.
// 제공사 4곳: Anthropic · OpenAI · Google Gemini · OpenRouter. 모두 사용자가 넣은 API 키로만 부른다.
// 자세한 규칙은 docs/API_LLM.md.

export type ProviderId = 'anthropic' | 'openai' | 'gemini' | 'openrouter';

export type ProviderInfo = {
  id: ProviderId;
  label: string;
  /** 키 발급 페이지 */
  keyUrl: string;
  /** 키 입력칸 안내 문구 */
  keyHint: string;
};

export const PROVIDERS: readonly ProviderInfo[] = [
  { id: 'anthropic', label: 'Anthropic', keyUrl: 'https://console.anthropic.com/settings/keys', keyHint: 'sk-ant-...' },
  { id: 'openai', label: 'OpenAI', keyUrl: 'https://platform.openai.com/api-keys', keyHint: 'sk-...' },
  { id: 'gemini', label: 'Google Gemini', keyUrl: 'https://aistudio.google.com/apikey', keyHint: 'AIza...' },
  { id: 'openrouter', label: 'OpenRouter', keyUrl: 'https://openrouter.ai/keys', keyHint: 'sk-or-...' },
];

export function isProviderId(v: unknown): v is ProviderId {
  return v === 'anthropic' || v === 'openai' || v === 'gemini' || v === 'openrouter';
}

export type ModelInfo = { id: string; label: string; free: boolean };

export type ChatResult = { text: string; inputTokens: number | null; outputTokens: number | null };

export type LlmErrorCode =
  | 'NO_KEY'
  | 'KEY_INVALID'
  | 'RATE_LIMITED'
  | 'MODEL_NOT_FOUND'
  | 'MODEL_UNSUPPORTED'
  | 'TRUNCATED'
  | 'EMPTY'
  | 'TIMEOUT'
  | 'UPSTREAM';

/** /api/llm 라우트가 받는 요청 */
export type LlmApiRequest =
  | { action: 'models'; provider: string }
  | { action: 'chat'; provider: string; model: string; system: string; user: string; maxTokens?: number };

/** /api/llm 라우트의 응답 */
export type LlmApiResponse =
  | { ok: true; models: ModelInfo[] }
  | { ok: true; result: ChatResult }
  | { ok: false; code: LlmErrorCode | 'BAD_INPUT'; message: string };

export class LlmError extends Error {
  constructor(public code: LlmErrorCode, message: string) {
    super(message);
    this.name = 'LlmError';
  }
}

export function llmErrorMessage(code: LlmErrorCode): string {
  switch (code) {
    case 'NO_KEY':
      return '분석 모델 API 키가 없습니다. 모델 연결 칸에 키를 넣으세요.';
    case 'KEY_INVALID':
      return 'API 키가 맞지 않거나 이 모델을 쓸 권한이 없습니다. 제공사와 키를 다시 확인하세요.';
    case 'RATE_LIMITED':
      return '요청이 너무 많거나 잔액이 부족합니다. 잠시 뒤 다시 하거나 제공사 결제 상태를 확인하세요.';
    case 'MODEL_NOT_FOUND':
      return '고른 모델을 찾지 못했습니다. 모델 목록을 다시 불러와 고르세요.';
    case 'MODEL_UNSUPPORTED':
      return '이 모델은 이 앱의 호출 방식(대화형)을 지원하지 않습니다. 다른 모델을 고르세요.';
    case 'TRUNCATED':
      return '모델 답이 길이 제한에 걸려 잘렸습니다. 생각을 오래 하는 모델이면 다른 모델을 고르거나 다시 시도하세요.';
    case 'EMPTY':
      return '모델이 빈 답을 보냈습니다. 다시 시도하거나 다른 모델을 고르세요.';
    case 'TIMEOUT':
      return '모델 응답이 60초 안에 오지 않았습니다. 더 빠른 모델을 고르거나 다시 시도하세요.';
    default:
      return '분석 모델 제공사에서 오류가 났습니다. 잠시 뒤 다시 시도하세요.';
  }
}

const TIMEOUT_MS = 60_000;
type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

type CallOptions = { fetchImpl?: FetchLike; signal?: AbortSignal };

async function call(url: string, init: RequestInit, opts: CallOptions): Promise<unknown> {
  const doFetch = opts.fetchImpl ?? fetch;
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;
  let res: Response;
  let bodyText: string;
  try {
    // 본문을 다 읽을 때까지 같은 try 안에 둔다.
    res = await doFetch(url, { ...init, signal, cache: 'no-store' });
    bodyText = await res.text();
  } catch (e) {
    const name = (e as Error)?.name;
    if (name === 'TimeoutError' || (name === 'AbortError' && timeout.aborted)) throw new LlmError('TIMEOUT', 'timeout');
    if (name === 'AbortError') throw e; // 사용자가 중지
    throw new LlmError('UPSTREAM', (e as Error)?.message ?? 'network');
  }
  if (!res.ok) {
    const detail = bodyText.slice(0, 300);
    if (res.status === 401 || res.status === 403) throw new LlmError('KEY_INVALID', detail);
    if (res.status === 429 || res.status === 402) throw new LlmError('RATE_LIMITED', detail);
    // OpenAI: Responses API 전용 모델을 chat/completions 로 부른 경우
    if (/v1\/responses|not supported in the v1\/chat\/completions|not a chat model|only supported in v1\/responses/i.test(bodyText)) {
      throw new LlmError('MODEL_UNSUPPORTED', detail);
    }
    if (res.status === 404) throw new LlmError('MODEL_NOT_FOUND', detail);
    // Gemini 는 잘못된 키를 400 API_KEY_INVALID 로 돌려준다.
    if (res.status === 400 && /API_KEY_INVALID|API key not valid/i.test(bodyText)) {
      throw new LlmError('KEY_INVALID', detail);
    }
    if (res.status === 400 && /model/i.test(bodyText) && /not found|does not exist|invalid model/i.test(bodyText)) {
      throw new LlmError('MODEL_NOT_FOUND', detail);
    }
    throw new LlmError('UPSTREAM', `HTTP ${res.status} ${detail}`);
  }
  try {
    return JSON.parse(bodyText) as unknown;
  } catch {
    throw new LlmError('UPSTREAM', '응답 해석 실패');
  }
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export type ChatInput = {
  provider: ProviderId;
  apiKey: string;
  model: string;
  /** 역할·작성 규칙 */
  system: string;
  /** 이번에 쓸 내용과 숫자 자료 */
  user: string;
  /** 답 길이 상한(토큰). 기본 4000. 생각을 오래 하는 모델은 이 안에 생각 토큰도 들어가므로 넉넉히 둔다 */
  maxTokens?: number;
};

/** 모델에게 한 번 묻고 글을 받는다. */
export async function chat(input: ChatInput, opts: CallOptions = {}): Promise<ChatResult> {
  const key = input.apiKey.trim();
  if (!key) throw new LlmError('NO_KEY', 'no key');
  if (!input.model.trim()) throw new LlmError('MODEL_NOT_FOUND', 'no model');
  const maxTokens = input.maxTokens ?? 4000;
  let result: ChatResult;
  let truncated = false;

  if (input.provider === 'anthropic') {
    const j = (await call(
      'https://api.anthropic.com/v1/messages',
      {
        method: 'POST',
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({
          model: input.model,
          max_tokens: maxTokens,
          system: input.system,
          messages: [{ role: 'user', content: input.user }],
        }),
      },
      opts,
    )) as {
      content?: { type?: string; text?: string }[];
      stop_reason?: string;
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    truncated = j.stop_reason === 'max_tokens';
    result = {
      text: (j.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join(''),
      inputTokens: num(j.usage?.input_tokens),
      outputTokens: num(j.usage?.output_tokens),
    };
  } else if (input.provider === 'gemini') {
    const j = (await call(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(input.model)}:generateContent`,
      {
        method: 'POST',
        headers: { 'x-goog-api-key': key, 'content-type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: input.system }] },
          contents: [{ role: 'user', parts: [{ text: input.user }] }],
          generationConfig: { maxOutputTokens: maxTokens },
        }),
      },
      opts,
    )) as {
      candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    };
    truncated = j.candidates?.[0]?.finishReason === 'MAX_TOKENS';
    result = {
      text: (j.candidates?.[0]?.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? '').join(''),
      inputTokens: num(j.usageMetadata?.promptTokenCount),
      outputTokens: num(j.usageMetadata?.candidatesTokenCount),
    };
  } else {
    // OpenAI 와 OpenRouter 는 같은 chat/completions 형식이다.
    const base = input.provider === 'openai' ? 'https://api.openai.com/v1' : 'https://openrouter.ai/api/v1';
    const tokenField = input.provider === 'openai' ? 'max_completion_tokens' : 'max_tokens';
    const j = (await call(
      `${base}/chat/completions`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model: input.model,
          [tokenField]: maxTokens,
          messages: [
            { role: 'system', content: input.system },
            { role: 'user', content: input.user },
          ],
        }),
      },
      opts,
    )) as {
      choices?: { message?: { content?: string | null }; finish_reason?: string }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    truncated = j.choices?.[0]?.finish_reason === 'length';
    result = {
      text: j.choices?.[0]?.message?.content ?? '',
      inputTokens: num(j.usage?.prompt_tokens),
      outputTokens: num(j.usage?.completion_tokens),
    };
  }

  // 길이 제한에 걸린 답은 JSON 이 깨져 있으므로 쓰지 않는다.
  if (truncated) throw new LlmError('TRUNCATED', 'max tokens');
  if (!result.text.trim()) throw new LlmError('EMPTY', 'empty');
  return { ...result, text: result.text.trim() };
}

// OpenAI 목록은 대화형(chat/completions)으로 부를 수 있는 계열만 남긴다.
// -pro, codex, deep-research 등은 Responses API 전용이라 이 앱의 호출 방식으로 부를 수 없다.
const OPENAI_CHAT = /^(gpt-|o\d|chatgpt-)/i;
const OPENAI_EXCLUDE = /-pro\b|codex|deep-research|embedding|whisper|tts|dall-e|moderation|image|audio|realtime|transcribe|search|computer-use|instruct/i;

/** 이 키로 쓸 수 있는 모델 목록. OpenRouter 는 키 없이도 목록을 준다. */
export async function listModels(provider: ProviderId, apiKey: string, opts: CallOptions = {}): Promise<ModelInfo[]> {
  const key = apiKey.trim();
  if (!key && provider !== 'openrouter') throw new LlmError('NO_KEY', 'no key');

  if (provider === 'anthropic') {
    const j = (await call(
      'https://api.anthropic.com/v1/models?limit=100',
      { headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' } },
      opts,
    )) as { data?: { id: string; display_name?: string }[] };
    return (j.data ?? []).map((m) => ({ id: m.id, label: m.display_name ?? m.id, free: false }));
  }
  if (provider === 'gemini') {
    const j = (await call(
      'https://generativelanguage.googleapis.com/v1beta/models?pageSize=200',
      { headers: { 'x-goog-api-key': key } },
      opts,
    )) as { models?: { name: string; displayName?: string; supportedGenerationMethods?: string[] }[] };
    return (j.models ?? [])
      .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
      .map((m) => {
        const id = m.name.replace(/^models\//, '');
        return { id, label: m.displayName ?? id, free: false };
      });
  }
  if (provider === 'openai') {
    const j = (await call('https://api.openai.com/v1/models', { headers: { authorization: `Bearer ${key}` } }, opts)) as {
      data?: { id: string }[];
    };
    return (j.data ?? [])
      .filter((m) => OPENAI_CHAT.test(m.id) && !OPENAI_EXCLUDE.test(m.id))
      .map((m) => ({ id: m.id, label: m.id, free: false }))
      .sort((a, b) => a.id.localeCompare(b.id));
  }
  const headers: Record<string, string> = key ? { authorization: `Bearer ${key}` } : {};
  const j = (await call('https://openrouter.ai/api/v1/models', { headers }, opts)) as {
    data?: { id: string; name?: string; pricing?: { prompt?: string; completion?: string } }[];
  };
  return (j.data ?? []).map((m) => ({
    id: m.id,
    label: m.name ?? m.id,
    free: m.id.endsWith(':free') || (Number(m.pricing?.prompt) === 0 && Number(m.pricing?.completion) === 0),
  }));
}
