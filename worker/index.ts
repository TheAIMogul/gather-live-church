import type { Room } from './room';
export { Room } from './room';

export interface Env {
  ROOM: DurableObjectNamespace<Room>;
  ASSETS: Fetcher;
  OPENAI_API_KEY?: string;
  OPENAI_TEXT_MODEL?: string;
  OPENAI_REALTIME_MODEL?: string;
  OPENAI_TRANSCRIPTION_MODEL?: string;
  DEV_MODE?: string;
}

const cookieName = 'gather_browser';
export const json = (value: unknown, status = 200, headers: Record<string, string> = {}) => Response.json(value, {
  status, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', ...headers },
});
export function localDevelopment(request: Request, env: Env): boolean {
  return env.DEV_MODE === 'true' && ['localhost', '127.0.0.1', '[::1]'].includes(new URL(request.url).hostname);
}
function browserSession(request: Request): string | undefined {
  const value = request.headers.get('Cookie')?.split(';').map(part => part.trim()).find(part => part.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
  return value && /^[a-f0-9]{64}$/.test(value) ? value : undefined;
}
function newSession(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('');
}
async function ownerHash(value: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}
function cookie(value: string, request: Request, maxAge = 365 * 24 * 3600): string {
  return `${cookieName}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`;
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) {
      const response = await env.ASSETS.fetch(request);
      const headers = new Headers(response.headers);
      headers.set('Referrer-Policy', 'no-referrer');
      headers.set('X-Content-Type-Options', 'nosniff');
      headers.set('Permissions-Policy', 'microphone=(self), camera=()');
      return new Response(response.body, { status: response.status, headers });
    }
    const origin = request.headers.get('Origin');
    if ((origin && origin !== url.origin) || request.headers.get('Sec-Fetch-Site') === 'cross-site') return json({ error: 'Cross-origin requests are not allowed.' }, 403);
    const existingSession = browserSession(request);
    const development = localDevelopment(request, env);
    if (url.pathname === '/api/config' && request.method === 'GET') {
      const openaiConfigured = Boolean(env.OPENAI_API_KEY);
      return json({ configured: openaiConfigured, operatorConfigured: true, openaiConfigured, authenticated: true, development }, 200,
        existingSession ? {} : { 'Set-Cookie': cookie(newSession(), request) });
    }
    if (url.pathname === '/api/logout' && request.method === 'POST') return json({ ok: true }, 200, { 'Set-Cookie': cookie('', request, 0) });
    if (url.pathname === '/api/rooms' && request.method === 'POST') {
      const session = existingSession || newSession();
      const id = crypto.randomUUID();
      const headers = new Headers(request.headers);
      headers.delete('X-Gather-Operator');
      headers.set('X-Gather-Owner', await ownerHash(session));
      const response = await env.ROOM.get(env.ROOM.idFromName(id)).fetch(new Request(`https://internal/api/rooms/${id}/create`, { method: 'POST', headers, body: request.body }));
      if (existingSession) return response;
      const responseHeaders = new Headers(response.headers);
      responseHeaders.set('Set-Cookie', cookie(session, request));
      return new Response(response.body, { status: response.status, headers: responseHeaders });
    }
    const match = url.pathname.match(/^\/api\/rooms\/([a-f0-9-]{36})(?:\/(settings|control|ws|phrase|realtime|presence|rotate))?$/);
    if (!match) return json({ error: 'Not found.' }, 404);
    const headers = new Headers(request.headers);
    headers.delete('X-Gather-Operator');
    headers.delete('X-Gather-Owner');
    if (existingSession) headers.set('X-Gather-Owner', await ownerHash(existingSession));
    return env.ROOM.get(env.ROOM.idFromName(match[1])).fetch(new Request(request, { headers }));
  },
} satisfies ExportedHandler<Env>;
