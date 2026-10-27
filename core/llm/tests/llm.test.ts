import { describe, expect, it } from 'vitest';
import { chat, listModels, LlmError } from '@/lib/llm';
import { extractNumbers, findUnknownNumbers } from '@/lib/number-check';

type Seen = { url: string; init?: RequestInit };
const fakeFetch = (status: number, body: unknown, seen: Seen[]) => async (url: string, init?: RequestInit) => {
  seen.push({ url, init });
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
};
const headerOf = (s: Seen, name: string) => new Headers(s.init?.headers).get(name);
const bodyOf = (s: Seen) => JSON.parse(String(s.init?.body)) as Record<string, unknown>;
const base = { apiKey: 'k1', model: 'm1', system: 'sys', user: 'hi' };

describe('chat 요청 모양', () => {
  it('Anthropic', async () => {
    const seen: Seen[] = [];
    const r = await chat({ ...base, provider: 'anthropic' }, { fetchImpl: fakeFetch(200, { content: [{ type: 'text', text: '답' }], usage: { input_tokens: 3, output_tokens: 1 } }, seen) });
    expect(seen[0].url).toBe('https://api.anthropic.com/v1/messages');
    expect(headerOf(seen[0], 'x-api-key')).toBe('k1');
    expect(headerOf(seen[0], 'anthropic-version')).toBe('2023-06-01');
    expect(bodyOf(seen[0]).system).toBe('sys');
    expect(r).toEqual({ text: '답', inputTokens: 3, outputTokens: 1 });
  });
  it('OpenAI 는 max_completion_tokens', async () => {
    const seen: Seen[] = [];
    await chat({ ...base, provider: 'openai' }, { fetchImpl: fakeFetch(200, { choices: [{ message: { content: '답' } }] }, seen) });
    expect(seen[0].url).toBe('https://api.openai.com/v1/chat/completions');
    expect(headerOf(seen[0], 'authorization')).toBe('Bearer k1');
    expect(bodyOf(seen[0]).max_completion_tokens).toBe(4000);
  });
  it('OpenRouter 는 max_tokens', async () => {
    const seen: Seen[] = [];
    await chat({ ...base, provider: 'openrouter' }, { fetchImpl: fakeFetch(200, { choices: [{ message: { content: '답' } }] }, seen) });
    expect(seen[0].url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(bodyOf(seen[0]).max_tokens).toBe(4000);
  });
  it('Gemini 는 키를 헤더로', async () => {
    const seen: Seen[] = [];
    await chat({ ...base, provider: 'gemini' }, { fetchImpl: fakeFetch(200, { candidates: [{ content: { parts: [{ text: '답' }] } }] }, seen) });
    expect(seen[0].url).toBe('https://generativelanguage.googleapis.com/v1beta/models/m1:generateContent');
    expect(headerOf(seen[0], 'x-goog-api-key')).toBe('k1');
    expect(seen[0].url).not.toContain('k1');
  });
});

describe('오류 분류', () => {
  it('401 → KEY_INVALID', async () => {
    await expect(chat({ ...base, provider: 'openai' }, { fetchImpl: fakeFetch(401, '{}', []) })).rejects.toMatchObject({ code: 'KEY_INVALID' });
  });
  it('Gemini 400 API_KEY_INVALID → KEY_INVALID', async () => {
    await expect(chat({ ...base, provider: 'gemini' }, { fetchImpl: fakeFetch(400, '{"error":{"status":"INVALID_ARGUMENT","details":[{"reason":"API_KEY_INVALID"}]}}', []) })).rejects.toMatchObject({ code: 'KEY_INVALID' });
  });
  it('429 → RATE_LIMITED', async () => {
    await expect(chat({ ...base, provider: 'anthropic' }, { fetchImpl: fakeFetch(429, '{}', []) })).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  });
  it('빈 답 → EMPTY', async () => {
    await expect(chat({ ...base, provider: 'openai' }, { fetchImpl: fakeFetch(200, { choices: [{ message: { content: ' ' } }] }, []) })).rejects.toBeInstanceOf(LlmError);
  });
  it('키 없으면 부르지 않는다', async () => {
    const seen: Seen[] = [];
    await expect(chat({ ...base, apiKey: '', provider: 'openai' }, { fetchImpl: fakeFetch(200, {}, seen) })).rejects.toMatchObject({ code: 'NO_KEY' });
    expect(seen).toHaveLength(0);
  });
});

describe('모델 목록', () => {
  it('OpenRouter 는 키 없이도, 무료 표시', async () => {
    const seen: Seen[] = [];
    const list = await listModels('openrouter', '', { fetchImpl: fakeFetch(200, { data: [{ id: 'a/b:free', name: 'B', pricing: { prompt: '0', completion: '0' } }, { id: 'c/d', pricing: { prompt: '0.000001', completion: '0.000002' } }] }, seen) });
    expect(list.map((m) => m.free)).toEqual([true, false]);
    expect(headerOf(seen[0], 'authorization')).toBeNull();
  });
  it('OpenAI 는 대화용이 아닌 모델을 뺀다', async () => {
    const list = await listModels('openai', 'k', { fetchImpl: fakeFetch(200, { data: [{ id: 'gpt-x' }, { id: 'text-embedding-3-small' }, { id: 'whisper-1' }] }, []) });
    expect(list.map((m) => m.id)).toEqual(['gpt-x']);
  });
  it('Gemini 는 generateContent 되는 것만', async () => {
    const list = await listModels('gemini', 'k', { fetchImpl: fakeFetch(200, { models: [{ name: 'models/g1', supportedGenerationMethods: ['generateContent'] }, { name: 'models/e1', supportedGenerationMethods: ['embedContent'] }] }, []) });
    expect(list.map((m) => m.id)).toEqual(['g1']);
  });
});

describe('잘림·지원 안 함', () => {
  it('OpenAI finish_reason length → TRUNCATED', async () => {
    await expect(chat({ ...base, provider: 'openai' }, { fetchImpl: fakeFetch(200, { choices: [{ message: { content: '{"a":' }, finish_reason: 'length' }] }, []) })).rejects.toMatchObject({ code: 'TRUNCATED' });
  });
  it('Anthropic stop_reason max_tokens → TRUNCATED', async () => {
    await expect(chat({ ...base, provider: 'anthropic' }, { fetchImpl: fakeFetch(200, { content: [{ type: 'text', text: '{' }], stop_reason: 'max_tokens' }, []) })).rejects.toMatchObject({ code: 'TRUNCATED' });
  });
  it('Gemini MAX_TOKENS → TRUNCATED, 생각 조각은 답에서 뺀다', async () => {
    await expect(chat({ ...base, provider: 'gemini' }, { fetchImpl: fakeFetch(200, { candidates: [{ content: { parts: [] }, finishReason: 'MAX_TOKENS' }] }, []) })).rejects.toMatchObject({ code: 'TRUNCATED' });
    const r = await chat({ ...base, provider: 'gemini' }, { fetchImpl: fakeFetch(200, { candidates: [{ content: { parts: [{ text: '생각', thought: true }, { text: '답' }] }, finishReason: 'STOP' }] }, []) });
    expect(r.text).toBe('답');
  });
  it('Responses 전용 모델 → MODEL_UNSUPPORTED', async () => {
    await expect(chat({ ...base, provider: 'openai' }, { fetchImpl: fakeFetch(404, '{"error":{"message":"This model is only supported in v1/responses and not in v1/chat/completions."}}', []) })).rejects.toMatchObject({ code: 'MODEL_UNSUPPORTED' });
  });
  it('기본 답 길이 상한은 4000', async () => {
    const seen: Seen[] = [];
    await chat({ ...base, provider: 'openrouter' }, { fetchImpl: fakeFetch(200, { choices: [{ message: { content: '답' } }] }, seen) });
    expect(bodyOf(seen[0]).max_tokens).toBe(4000);
  });
  it('본문을 읽다 끊기면 UPSTREAM', async () => {
    const fake = async () => ({ ok: true, status: 200, text: async () => { throw new TypeError('terminated'); } }) as unknown as Response;
    await expect(chat({ ...base, provider: 'openai' }, { fetchImpl: fake })).rejects.toMatchObject({ code: 'UPSTREAM' });
  });
});

describe('숫자 대조', () => {
  it('금액·퍼센트·건수를 읽고 날짜는 건너뛴다', () => {
    const t = extractNumbers('9월 거래 9건, 3.3㎡당 9,980만, 1년 새 +8.6% 올라 최고가 23억 5,000');
    expect(t.map((x) => [x.kind, x.value])).toEqual([
      ['plain', 9],
      ['plain', 3.3],
      ['money', 9980],
      ['plain', 1],
      ['percent', 8.6],
      ['money', 235000],
    ]);
  });
  it('자료에 없는 숫자를 찾아낸다', () => {
    const text = '9월 거래 9건, 중위가 9,980만, 최고가 24억.';
    const bad = findUnknownNumbers(text, { money: [9980.4, 235000], plain: [9] });
    expect(bad.map((b) => b.raw)).toEqual(['24억']);
  });
  it('부호가 뒤집힌 퍼센트는 잡는다', () => {
    expect(findUnknownNumbers('-8.6% 내렸다', { percent: [8.6] }).map((b) => b.raw)).toEqual(['-8.6%']);
    expect(findUnknownNumbers('+8.6% 올랐다', { percent: [8.6] })).toEqual([]);
    expect(findUnknownNumbers('8.6% 올랐다', { percent: [8.6] })).toEqual([]);
    expect(findUnknownNumbers('2.3% 내렸다', { percent: [-2.3] })).toEqual([]);
  });
  it('날짜·층은 검사하지 않지만 일수·개월 수는 검사한다', () => {
    expect(findUnknownNumbers('2026년 9월 21일 14층, 9.21 계약', {})).toEqual([]);
    expect(findUnknownNumbers('999일 뒤, 99개월', { plain: [28, 12] }).map((b) => b.raw)).toEqual(['999', '99']);
    expect(findUnknownNumbers('28일 뒤 신고', { plain: [28] })).toEqual([]);
  });
  it('금액은 만원 단위 반올림만 허용한다', () => {
    expect(findUnknownNumbers('23억 5,100', { money: [235000] }).map((b) => b.raw)).toEqual(['23억 5,100']);
    expect(findUnknownNumbers('9,980만', { money: [9980.4] })).toEqual([]);
    expect(findUnknownNumbers('1억 380만', { money: [10380.4] })).toEqual([]);
  });
  it('억 뒤의 건수는 금액에 흡수되지 않는다', () => {
    expect(extractNumbers('23억 99건').map((x) => [x.kind, x.value])).toEqual([['money', 230000], ['plain', 99]]);
    expect(findUnknownNumbers('23억 3건', { money: [230000], plain: [3] })).toEqual([]);
    expect(findUnknownNumbers('23억 99건', { money: [230000], plain: [3] }).map((b) => b.raw)).toEqual(['99']);
  });
  it('소수 금액·퍼센트를 날짜로 오인하지 않는다', () => {
    expect(findUnknownNumbers('평당 1234.5만', {}).map((b) => b.raw)).toEqual(['1234.5만']);
    expect(findUnknownNumbers('9999.9% 상승', {}).map((b) => b.raw)).toEqual(['9999.9%']);
    expect(findUnknownNumbers('2026.09 기준', {})).toEqual([]);
    expect(findUnknownNumbers('2026.13 기준', {}).map((b) => b.raw)).toEqual(['2026.13']);
    expect(findUnknownNumbers('집계 기간은 2025.10 ~ 2026.09.', {})).toEqual([]);
    expect(findUnknownNumbers('계약일은 2026.09.21.', {})).toEqual([]);
  });
  it('억 뒤의 소수는 금액에 붙지 않는다', () => {
    expect(extractNumbers('23억 3.3㎡당 9,980만').map((x) => [x.kind, x.value])).toEqual([['money', 230000], ['plain', 3.3], ['money', 9980]]);
    expect(extractNumbers('최고가 23억 5,000.').map((x) => x.value)).toEqual([235000]);
  });
  it('자료의 단지명 안 숫자는 검사하지 않는다', () => {
    const allowed = { money: [325000], plain: [24], names: ['개포주공5단지', '현대까르띠에710'] };
    expect(findUnknownNumbers('개포주공5단지가 32억 5,000, 이달 24건', allowed)).toEqual([]);
    expect(findUnknownNumbers('현대까르띠에710 거래', allowed)).toEqual([]);
    expect(findUnknownNumbers('개포주공6단지', allowed).map((b) => b.raw)).toEqual(['6']);
  });
  it('㎡ 숫자는 자료에 있어야 통과', () => {
    expect(findUnknownNumbers('84㎡가 절반', { plain: [84] })).toEqual([]);
    expect(findUnknownNumbers('84㎡가 절반', {}).map((b) => b.raw)).toEqual(['84']);
  });
});
