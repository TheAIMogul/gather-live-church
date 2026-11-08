import type { Room } from './room';
import { readJson } from './room';
export { Room } from './room';

export interface Env {
  ROOM: DurableObjectNamespace<Room>;
  ASSETS: Fetcher;
  ADMIN_PASSWORD?: string;
  OPENAI_API_KEY?: string;
  OPENAI_TEXT_MODEL?: string;
  OPENAI_REALTIME_MODEL?: string;
  OPENAI_TRANSCRIPTION_MODEL?: string;
  DEV_MODE?: string;
}

const cookieName = 'gather_operator';
const encoder = new TextEncoder();
export const json = (value: unknown, status = 200, headers: Record<string, string> = {}) => Response.json(value, {
  status, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', ...headers },
});
export function localDevelopment(request: Request, env: Env): boolean {
  return env.DEV_MODE === 'true' && ['localhost', '127.0.0.1', '[::1]'].includes(new URL(request.url).hostname);
}
async function signature(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}
export async function isOperator(request: Request, env: Env): Promise<boolean> {
  if (localDevelopment(request, env) && !env.ADMIN_PASSWORD) return true;
  if (!env.ADMIN_PASSWORD) return false;
  const cookie = request.headers.get('Cookie')?.split(';').map(value => value.trim()).find(value => value.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
  if (!cookie) return false;
  const [expires, supplied] = cookie.split('.');
  if (!/^\d+$/.test(expires || '') || Number(expires) < Date.now() || Number(expires) > Date.now() + 13 * 3600_000 || !supplied) return false;
  const expected = await signature(expires, env.ADMIN_PASSWORD);
  let mismatch = supplied.length ^ expected.length;
  for (let index = 0; index < expected.length; index++) mismatch |= expected.charCodeAt(index) ^ (supplied.charCodeAt(index) || 0);
  return mismatch === 0;
}
function cookie(value: string, request: Request, maxAge: number): string {
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
    if (origin && origin !== url.origin) return json({ error: 'Cross-origin requests are not allowed.' }, 403);
    const authenticated = await isOperator(request, env);
    const development = localDevelopment(request, env);
    if (url.pathname === '/api/config' && request.method === 'GET') {
      const operatorConfigured = Boolean(env.ADMIN_PASSWORD) || development;
      const openaiConfigured = Boolean(env.OPENAI_API_KEY);
      return json({ configured: operatorConfigured && openaiConfigured, operatorConfigured, openaiConfigured, authenticated, development });
    }
    if (url.pathname === '/api/logout' && request.method === 'POST') return json({ ok: true }, 200, { 'Set-Cookie': cookie('', request, 0) });
    if (url.pathname === '/api/login' && request.method === 'POST') {
      if (!env.ADMIN_PASSWORD) return development ? json({ ok: true }) : json({ error: 'Operator access is not configured.' }, 503);
      const ip = request.headers.get('CF-Connecting-IP') || 'local';
      const digest = await signature(ip, env.ADMIN_PASSWORD);
      const limiter = env.ROOM.get(env.ROOM.idFromName('login:' + digest));
      const rate = await limiter.fetch(new Request('https://internal/__login', { method: 'POST' }));
      if (!rate.ok) return json({ error: 'Too many sign-in attempts. Try again in 10 minutes.' }, 429);
      try {
        const body = await readJson(request);
        if (typeof body.password !== 'string' || await signature(body.password, env.ADMIN_PASSWORD) !== await signature(env.ADMIN_PASSWORD, env.ADMIN_PASSWORD)) return json({ error: 'That password is not correct.' }, 401);
      } catch { return json({ error: 'Enter a valid password.' }, 400); }
      const expires = String(Date.now() + 12 * 3600_000);
      await limiter.fetch(new Request('https://internal/__login/reset', { method: 'POST' }));
      return json({ ok: true }, 200, { 'Set-Cookie': cookie(`${expires}.${await signature(expires, env.ADMIN_PASSWORD)}`, request, 12 * 3600) });
    }
    if (url.pathname === '/api/rooms' && request.method === 'POST') {
      if (!authenticated) return json({ error: 'Sign in to create a service.' }, 401);
      const id = crypto.randomUUID();
      const headers = new Headers(request.headers);
      headers.set('X-Gather-Operator', 'true');
      return env.ROOM.get(env.ROOM.idFromName(id)).fetch(new Request(`https://internal/api/rooms/${id}/create`, { method: 'POST', headers, body: request.body }));
    }
    const match = url.pathname.match(/^\/api\/rooms\/([a-f0-9-]{36})(?:\/(settings|control|ws|phrase|realtime|presence|rotate))?$/);
    if (!match) return json({ error: 'Not found.' }, 404);
    const headers = new Headers(request.headers);
    headers.delete('X-Gather-Operator');
    if (authenticated) headers.set('X-Gather-Operator', 'true');
    return env.ROOM.get(env.ROOM.idFromName(match[1])).fetch(new Request(request, { headers }));
  },
} satisfies ExportedHandler<Env>;
