// 슬랙 Incoming Webhook 으로 메시지를 보낸다. 서버·스크립트에서만 쓴다.

export class SlackError extends Error {
  constructor(public code: 'BAD_URL' | 'REJECTED' | 'NETWORK', message: string) {
    super(message);
    this.name = 'SlackError';
  }
}

export function isSlackWebhookUrl(url: string): boolean {
  return /^https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/_-]+$/.test(url.trim());
}

export type SlackMessage = {
  /** 알림 미리보기와 블록을 못 그리는 곳에 쓰는 글 */
  text: string;
  /** Block Kit 블록. 없으면 text 만 보낸다. */
  blocks?: unknown[];
};

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export async function postSlack(webhookUrl: string, msg: SlackMessage, fetchImpl: FetchLike = fetch): Promise<void> {
  const url = webhookUrl.trim();
  if (!isSlackWebhookUrl(url)) {
    throw new SlackError('BAD_URL', '슬랙 Webhook 주소는 https://hooks.slack.com/services/ 로 시작해야 합니다.');
  }
  let res: Response;
  let body: string;
  try {
    res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(msg),
      signal: AbortSignal.timeout(15_000),
    });
    body = await res.text();
  } catch (e) {
    throw new SlackError('NETWORK', (e as Error)?.message ?? '연결 실패');
  }
  if (!res.ok || body.trim() !== 'ok') {
    throw new SlackError('REJECTED', `슬랙이 거절했습니다 (HTTP ${res.status} ${body.slice(0, 120)}). Webhook 주소가 살아 있는지 확인하세요.`);
  }
}

/** Block Kit 에 넣을 글에서 슬랙 특수문자를 막는다. */
export function slackEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
