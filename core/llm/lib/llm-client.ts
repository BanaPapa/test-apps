// 브라우저에서 쓰는 분석 모델 도우미. 연결 설정 보관과 /api/llm 호출을 맡는다.
// 'use client' 컴포넌트에서만 import 할 것.
import type { ChatResult, LlmApiResponse, ModelInfo, ProviderId } from './llm';

export type LlmSettings = { provider: ProviderId; apiKey: string; model: string };

const STORAGE = 'realdeal.llm';

export function loadLlmSettings(): LlmSettings | null {
  try {
    const raw = localStorage.getItem(STORAGE);
    return raw ? (JSON.parse(raw) as LlmSettings) : null;
  } catch {
    return null;
  }
}

export function saveLlmSettings(s: LlmSettings | null): void {
  try {
    if (s) localStorage.setItem(STORAGE, JSON.stringify(s));
    else localStorage.removeItem(STORAGE);
  } catch {
    // 저장이 안 되는 환경이면 이번 화면에서만 쓴다.
  }
}

export class LlmClientError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'LlmClientError';
  }
}

async function post(apiKey: string, body: unknown, signal?: AbortSignal): Promise<LlmApiResponse> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (apiKey.trim()) headers['x-llm-key'] = apiKey.trim();
  const res = await fetch('/api/llm', { method: 'POST', headers, body: JSON.stringify(body), signal });
  const json = (await res.json()) as LlmApiResponse;
  if (!json.ok) throw new LlmClientError(json.code, json.message);
  return json;
}

export async function fetchModels(provider: ProviderId, apiKey: string, signal?: AbortSignal): Promise<ModelInfo[]> {
  const r = await post(apiKey, { action: 'models', provider }, signal);
  return 'models' in r ? r.models : [];
}

export async function askModel(
  s: LlmSettings,
  prompt: { system: string; user: string; maxTokens?: number },
  signal?: AbortSignal,
): Promise<ChatResult> {
  const r = await post(s.apiKey, { action: 'chat', provider: s.provider, model: s.model, ...prompt }, signal);
  if (!('result' in r)) throw new LlmClientError('UPSTREAM', '모델 응답이 비었습니다.');
  return r.result;
}
