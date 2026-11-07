import { mockAsk } from './mock';
import type { AskResponse, ChatTurn } from './types';

const API_URL = (process.env.NEXT_PUBLIC_RAG_API_URL || '').trim().replace(/\/$/, '');

/** No API URL in .env.local -> demo mode with mock answers (no RAG, no LLM). */
export const isDemo = !API_URL;

export const BUSY_TEXT = 'النظام عليه ضغط هلأ، جرّب كمان شوي';

/**
 * POST {API_URL}/ask  body: { question, history }  ->  AskResponse
 * history = the last turns, so the backend can answer follow-up questions.
 */
export async function ask(question: string, history: ChatTurn[]): Promise<AskResponse> {
  if (isDemo) return mockAsk(question, history);

  const t0 = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  try {
    const res = await fetch(`${API_URL}/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, history: history.slice(-6) }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as AskResponse;
    return { ...data, latencyMs: data.latencyMs ?? Math.round(performance.now() - t0) };
  } finally {
    clearTimeout(timer);
  }
}
