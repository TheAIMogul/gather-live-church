import { DurableObject } from 'cloudflare:workers';
import type { Env } from './index';
import { defaultSettings, type DisplaySettings, type RoomState } from '../shared/types';
import { createRealtimeSession, interpretPhrase, summarize } from './openai';

type Role = 'operator' | 'microphone' | 'display';
type StoredRoom = RoomState & { displayToken: string; micToken: string; revision: number; expiresAt: number; summaryAttemptAt?: number; inputLease?: { clientId: string; until: number; generation: string } };
const retention = 24 * 3600_000;
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
class HttpError extends Error { constructor(message: string, readonly status = 400) { super(message); } }

export async function readJson(request: Request, max = 4096): Promise<Record<string, unknown>> {
  if (Number(request.headers.get('Content-Length')) > max) throw new HttpError('Request is too large.', 413);
  const reader = request.body?.getReader();
  if (!reader) return {};
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    size += next.value.byteLength;
    if (size > max) { await reader.cancel(); throw new HttpError('Request is too large.', 413); }
    chunks.push(next.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let result: unknown;
  try { result = JSON.parse(new TextDecoder().decode(bytes) || '{}'); } catch { throw new HttpError('Invalid JSON.'); }
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw new HttpError('Expected a JSON object.');
  return result as Record<string, unknown>;
}

function settingsPatch(value: Record<string, unknown>): Partial<DisplaySettings> {
  const result: Partial<DisplaySettings> = {};
  for (const key of ['churchName', 'serviceName'] as const) if (key in value) {
    if (typeof value[key] !== 'string' || value[key].length > 100) throw new HttpError('Names must be at most 100 characters.');
    result[key] = value[key].trim();
  }
  for (const key of ['showOriginal', 'showSummary'] as const) if (key in value) {
    if (typeof value[key] !== 'boolean') throw new HttpError(`${key} must be true or false.`);
    result[key] = value[key];
  }
  if ('logo' in value) {
    if (value.logo !== null && (typeof value.logo !== 'string' || value.logo.length > 700_000 || !/^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/.test(value.logo))) throw new HttpError('Upload a PNG, JPEG or WebP logo under 500 KB.');
    result.logo = value.logo as string | null;
  }
  if ('logoPosition' in value) {
    if (!['left', 'center', 'right'].includes(String(value.logoPosition))) throw new HttpError('Invalid logo position.');
    result.logoPosition = value.logoPosition as DisplaySettings['logoPosition'];
  }
  for (const [key, min, max] of [['logoSize', 24, 160], ['textSize', 32, 120]] as const) if (key in value) {
    if (typeof value[key] !== 'number' || !Number.isFinite(value[key]) || value[key] < min || value[key] > max) throw new HttpError(`Invalid ${key}.`);
    result[key] = value[key];
  }
  if ('theme' in value) {
    if (!['frost', 'sage', 'night'].includes(String(value.theme))) throw new HttpError('Invalid theme.');
    result.theme = value.theme as DisplaySettings['theme'];
  }
  if ('motion' in value) {
    if (!['fluid', 'gentle', 'none'].includes(String(value.motion))) throw new HttpError('Invalid motion.');
    result.motion = value.motion as DisplaySettings['motion'];
  }
  if ('accentColor' in value) {
    if (typeof value.accentColor !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(value.accentColor)) throw new HttpError('Use a six-digit hex color.');
    result.accentColor = value.accentColor;
  }
  return result;
}

export class Room extends DurableObject<Env> {
  private room: StoredRoom | undefined;
  private pipeline: Promise<unknown> = Promise.resolve();
  private pending = 0;
  private summaryPending = false;
  private mintTimes: number[] = [];
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => { this.room = await ctx.storage.get<StoredRoom>('room'); });
  }
  private role(request: Request): Role | null {
    if (request.headers.get('X-Gather-Operator') === 'true') return 'operator';
    const token = new URL(request.url).searchParams.get('token');
    if (!token || !this.room) return null;
    if (token === this.room.micToken) return 'microphone';
    if (token === this.room.displayToken) return 'display';
    return null;
  }
  private snapshot(role: Role): RoomState {
    const { revision: _revision, expiresAt: _expiresAt, inputLease: _inputLease, summaryAttemptAt: _summaryAttemptAt, displayToken, micToken, ...state } = this.room!;
    return role === 'operator' ? { ...state, displayToken, micToken } : state;
  }
  private async save(): Promise<void> {
    await this.ctx.storage.put('room', this.room);
    if (this.room) await this.ctx.storage.setAlarm(Math.min(this.room.expiresAt, this.room.inputLease?.until ?? Infinity));
  }
  private broadcast(): void {
    let operatorMessage: string | undefined, viewerMessage: string | undefined;
    for (const socket of this.ctx.getWebSockets()) {
      try {
        const role = (socket.deserializeAttachment() as { role: Role }).role;
        if (role === 'operator') {
          operatorMessage ??= JSON.stringify({ type: 'state', state: this.snapshot('operator') });
          socket.send(operatorMessage);
        } else {
          viewerMessage ??= JSON.stringify({ type: 'state', state: this.snapshot('display') });
          socket.send(viewerMessage);
        }
      }
      catch { socket.close(1011, 'Connection unavailable'); }
    }
  }
  private async changed(): Promise<void> { await this.save(); this.broadcast(); }
  private async clearTranscript(): Promise<void> {
    if (!this.room) return;
    this.room.segments = []; this.room.summary = ''; this.room.summaryUpdatedAt = undefined; this.room.summaryAttemptAt = undefined; this.room.summaryStale = false;
    this.room.revision++; this.room.expiresAt = Date.now() + retention;
    await this.ctx.storage.setAlarm(this.room.expiresAt);
    await this.changed();
  }
  async fetch(request: Request): Promise<Response> {
    try { return await this.route(request); }
    catch (error) {
      const status = error instanceof HttpError ? error.status : (error as { status?: number }).status;
      const safeStatus = typeof status === 'number' && status >= 400 && status <= 599 ? status : 500;
      const message = error instanceof HttpError || error?.constructor?.name === 'OpenAIError' ? (error as Error).message : 'The service could not complete this request. Please try again.';
      return json({ error: message }, safeStatus);
    }
  }
  private async route(request: Request): Promise<Response> {
    const url = new URL(request.url);
    // These endpoints are reached only through the Worker binding, never a public route.
    if (url.pathname.startsWith('/__login')) {
      if (url.pathname.endsWith('/reset')) { await this.ctx.storage.deleteAll(); return json({ ok: true }); }
      const now = Date.now();
      const saved = await this.ctx.storage.get<{ count: number; until: number }>('attempts');
      const attempt = saved && saved.until > now ? saved : { count: 0, until: now + 600_000 };
      attempt.count++;
      await this.ctx.storage.put('attempts', attempt);
      await this.ctx.storage.setAlarm(attempt.until);
      return json({ ok: attempt.count <= 10 }, attempt.count <= 10 ? 200 : 429);
    }
    const parts = url.pathname.split('/');
    const id = parts[3], action = parts[4] || '';
    if (action === 'create' && request.method === 'POST') {
      if (request.headers.get('X-Gather-Operator') !== 'true') throw new HttpError('Sign in to create a service.', 401);
      const initial = await readJson(request);
      this.room = {
        id, status: 'idle', mode: 'live', sourceLanguage: initial.sourceLanguage === 'en' ? 'en' : 'es',
        targetLanguage: initial.sourceLanguage === 'en' ? 'es' : 'en', settings: { ...defaultSettings },
        segments: [], summary: '', blank: false, micConnected: false, micName: '',
        displayToken: crypto.randomUUID().replaceAll('-', ''), micToken: crypto.randomUUID().replaceAll('-', ''),
        revision: 0, expiresAt: Date.now() + retention,
      };
      await this.ctx.storage.setAlarm(this.room.expiresAt);
      await this.save();
      return json(this.snapshot('operator'), 201);
    }
    if (!this.room) throw new HttpError('This service was not found.', 404);
    const role = this.role(request);
    if (!role) throw new HttpError('This service link is invalid or has expired.', 401);
    if (this.room.expiresAt <= Date.now()) await this.clearTranscript();
    if (request.method === 'GET' && !action) return json(this.snapshot(role));
    if (action === 'ws' && request.method === 'GET') {
      if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') throw new HttpError('WebSocket upgrade required.', 426);
      if (this.ctx.getWebSockets().length >= 150) throw new HttpError('This service has reached its connection limit.', 429);
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment({ role });
      server.send(JSON.stringify({ type: 'state', state: this.snapshot(role) }));
      return new Response(null, { status: 101, webSocket: client });
    }
    if (role === 'display') throw new HttpError('This display link is read-only.', 403);
    if (action === 'presence' && request.method === 'POST') {
      const value = await readJson(request);
      const lease = this.room.inputLease;
      if (!lease || typeof value.clientId !== 'string' || lease.clientId !== value.clientId) throw new HttpError('This microphone is no longer the active input.', 409);
      if (value.connected === true && this.room.status !== 'live') throw new HttpError('The service is not listening.', 409);
      const wasConnected = this.room.micConnected, previousName = this.room.micName;
      this.room.micConnected = value.connected === true;
      if (this.room.micConnected) {
        lease.until = Date.now() + 60_000;
        this.room.micName = typeof value.name === 'string' ? value.name.slice(0, 80) : 'Microphone';
      } else { this.room.inputLease = undefined; this.room.status = 'paused'; this.room.revision++; }
      if (wasConnected === this.room.micConnected && previousName === this.room.micName && this.room.micConnected) await this.save();
      else await this.changed();
      return json(this.snapshot(role));
    }
    if (action === 'realtime' && request.method === 'POST') {
      const value = await readJson(request);
      if (typeof value.clientId !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(value.clientId)) throw new HttpError('A microphone client ID is required.');
      if (this.room.inputLease && this.room.inputLease.until > Date.now() && this.room.inputLease.clientId !== value.clientId) throw new HttpError('Another microphone is active. Stop it before switching input.', 409);
      this.mintTimes = this.mintTimes.filter(time => time > Date.now() - 60_000);
      if (this.mintTimes.length >= 6) throw new HttpError('Please wait before reconnecting the microphone.', 429);
      this.mintTimes.push(Date.now());
      if (this.room.status !== 'live') throw new HttpError('Start the service before connecting audio.', 409);
      const generation = crypto.randomUUID(), revision = this.room.revision;
      this.room.inputLease = { clientId: value.clientId, until: Date.now() + 60_000, generation };
      await this.save();
      try {
        const session = await createRealtimeSession(this.env, { sourceLanguage: this.room.sourceLanguage, targetLanguage: this.room.targetLanguage, safetyIdentifier: this.room.id });
        if (this.room.status !== 'live' || this.room.revision !== revision || this.room.inputLease?.generation !== generation) throw new HttpError('Microphone setup was cancelled.', 409);
        return json({ ...session, clientId: value.clientId });
      } catch (error) {
        if (this.room.inputLease?.generation === generation) { this.room.inputLease = undefined; await this.save(); }
        throw error;
      }
    }
    if (action === 'phrase' && request.method === 'POST') {
      if (this.room.status !== 'live') throw new HttpError('The service is not listening.', 409);
      const value = await readJson(request, 12_000);
      if ((role === 'microphone' || this.room.inputLease) && (!this.room.inputLease || this.room.inputLease.until < Date.now() || value.clientId !== this.room.inputLease.clientId)) throw new HttpError('This microphone is no longer the active input.', 409);
      if (typeof value.text !== 'string' || !value.text.trim() || value.text.length > 2400) throw new HttpError('Send a phrase between 1 and 2400 characters.');
      if (this.pending >= 6) throw new HttpError('Translation is catching up. Please wait.', 429);
      const text = value.text.trim(), revision = this.room.revision;
      this.pending++;
      const work = this.pipeline.catch(() => {}).then(() => this.translate(text, revision));
      this.pipeline = work;
      try { await work; } finally { this.pending--; }
      return json(this.snapshot(role));
    }
    if (role !== 'operator') throw new HttpError('Only the operator can change this service.', 403);
    if (action === 'settings' && request.method === 'PATCH') {
      const value = await readJson(request, 720_000);
      const patch = value.settings && typeof value.settings === 'object' && !Array.isArray(value.settings) ? value.settings as Record<string, unknown> : value;
      const nextSettings = { ...this.room.settings, ...settingsPatch(patch) };
      if ('sourceLanguage' in value || 'targetLanguage' in value) {
        const source = value.sourceLanguage ?? (value.targetLanguage === 'en' ? 'es' : 'en');
        if (source !== 'en' && source !== 'es') throw new HttpError('Choose English or Spanish.');
        if (value.targetLanguage !== undefined && value.targetLanguage !== (source === 'en' ? 'es' : 'en')) throw new HttpError('Source and target languages must differ.');
        if (source !== this.room.sourceLanguage) {
          this.room.sourceLanguage = source; this.room.targetLanguage = source === 'en' ? 'es' : 'en';
          this.room.revision++; this.room.status = 'paused'; this.room.micConnected = false; this.room.inputLease = undefined;
        }
      }
      this.room.settings = nextSettings;
      await this.changed(); return json(this.snapshot(role));
    }
    if (action === 'control' && request.method === 'POST') {
      const value = await readJson(request);
      switch (value.action) {
        case 'start': case 'resume': this.room.status = 'live'; this.room.startedAt ||= Date.now(); break;
        case 'pause': this.room.status = 'paused'; this.room.micConnected = false; this.room.inputLease = undefined; this.room.revision++; break;
        case 'stop': this.room.status = 'ended'; this.room.micConnected = false; this.room.inputLease = undefined; this.room.revision++; break;
        case 'blank': this.room.blank = true; break;
        case 'unblank': this.room.blank = false; break;
        case 'clear': await this.clearTranscript(); return json(this.snapshot(role));
        default: throw new HttpError('Unknown service action.');
      }
      await this.changed(); return json(this.snapshot(role));
    }
    if (action === 'rotate' && request.method === 'POST') {
      this.room.displayToken = crypto.randomUUID().replaceAll('-', ''); this.room.micToken = crypto.randomUUID().replaceAll('-', '');
      this.room.micConnected = false; this.room.inputLease = undefined; this.room.status = 'paused'; this.room.revision++;
      for (const socket of this.ctx.getWebSockets()) if ((socket.deserializeAttachment() as { role: Role }).role !== 'operator') socket.close(1008, 'Service links were rotated');
      await this.changed(); return json(this.snapshot(role));
    }
    throw new HttpError('Not found.', 404);
  }
  private async translate(text: string, revision: number): Promise<void> {
    if (!this.room || this.room.revision !== revision || this.room.status !== 'live') return;
    const result = await interpretPhrase(this.env, { text, sourceLanguage: this.room.sourceLanguage, targetLanguage: this.room.targetLanguage, context: this.room.segments.slice(-10) });
    if (this.room.revision !== revision || this.room.status !== 'live') return;
    this.room.segments.push({ id: crypto.randomUUID(), source: text, translation: result.translation, kind: result.kind, reference: result.reference, verified: result.verified, timestamp: Date.now() });
    this.room.segments = this.room.segments.slice(-100);
    this.room.expiresAt = Date.now() + retention;
    await this.ctx.storage.setAlarm(this.room.expiresAt);
    await this.changed();
    if (!this.summaryPending && this.room.settings.showSummary && this.room.segments.length >= 3 && (!this.room.summaryAttemptAt || Date.now() - this.room.summaryAttemptAt > 30_000)) {
      this.summaryPending = true;
      this.room.summaryAttemptAt = Date.now();
      await this.save();
      this.ctx.waitUntil(this.refreshSummary(revision).finally(() => { this.summaryPending = false; }));
    }
  }
  private async refreshSummary(revision: number): Promise<void> {
    if (!this.room) return;
    try {
      const result = await summarize(this.env, { segments: this.room.segments.slice(-60), language: this.room.targetLanguage });
      if (this.room.revision !== revision) return;
      this.room.summary = result.summary; this.room.summaryUpdatedAt = Date.now(); this.room.summaryStale = false;
    } catch { if (this.room.revision !== revision) return; this.room.summaryStale = true; }
    await this.changed();
  }
  webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): void {
    if (message === 'ping' || message === '{"type":"ping"}') { socket.send('{"type":"pong"}'); return; }
    socket.send(JSON.stringify({ type: 'error', message: 'Use the authenticated service controls to make changes.' }));
  }
  async webSocketClose(socket: WebSocket, code: number, reason: string): Promise<void> {
    socket.close(code, reason);
  }
  async webSocketError(socket: WebSocket): Promise<void> { await this.webSocketClose(socket, 1011, 'Connection interrupted'); }
  async alarm(): Promise<void> {
    if (!this.room) { await this.ctx.storage.deleteAll(); return; }
    if (this.room.expiresAt <= Date.now()) {
      this.room.status = 'ended'; this.room.micConnected = false; this.room.inputLease = undefined;
      await this.clearTranscript(); await this.ctx.storage.deleteAlarm(); return;
    }
    if (this.room.inputLease && this.room.inputLease.until <= Date.now()) {
      this.room.inputLease = undefined; this.room.micConnected = false; this.room.status = 'paused'; this.room.revision++;
      await this.changed(); return;
    }
    await this.save();
  }
}
