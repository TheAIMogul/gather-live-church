import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRealtimeSession, interpretPhrase, OpenAIError, summarize } from '../worker/openai';

const env = { OPENAI_API_KEY: 'test-only-placeholder' };
const phrase = { text: 'No tenemos que caminar solos.', sourceLanguage: 'es' as const, targetLanguage: 'en' as const };
const interpretation = { translation: "We don't have to walk alone.", kind: 'speech', reference: null };

function structuredOutput(value: unknown): Response {
  return Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(value) }] }] });
}

afterEach(() => vi.unstubAllGlobals());

describe('server-side OpenAI integration', () => {
  it('mints a short-lived translation token with source transcription and only returns client fields', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ value: 'ephemeral-example', expires_at: 1_900_000_000, session: { sensitiveExtra: 'not-forwarded' } }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await createRealtimeSession(env, { sourceLanguage: 'es', targetLanguage: 'en' });
    expect(result).toEqual({ value: 'ephemeral-example', expires_at: 1_900_000_000, model: 'gpt-realtime-translate', callUrl: 'https://api.openai.com/v1/realtime/translations/calls' });
    const [url, request] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/realtime/translations/client_secrets');
    expect(JSON.parse(request.body)).toEqual({ expires_after: { anchor: 'created_at', seconds: 120 }, session: { model: 'gpt-realtime-translate', audio: { input: { transcription: { model: 'gpt-realtime-whisper' }, noise_reduction: { type: 'near_field' } }, output: { language: 'en' } } } });
    expect(JSON.stringify(result)).not.toContain(env.OPENAI_API_KEY);
  });

  it('does not contact OpenAI when the server key is missing or input is invalid', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(interpretPhrase({}, phrase)).rejects.toMatchObject({ status: 503, code: 'openai_not_configured' });
    await expect(interpretPhrase(env, { ...phrase, text: ' ' })).rejects.toMatchObject({ status: 400 });
    await expect(interpretPhrase(env, { ...phrase, text: 'a'.repeat(4001) })).rejects.toMatchObject({ status: 400 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses bounded recent phrase context and strict structured output with storage disabled', async () => {
    const fetchMock = vi.fn().mockResolvedValue(structuredOutput(interpretation));
    vi.stubGlobal('fetch', fetchMock);
    const context = Array.from({ length: 20 }, (_, index) => ({ source: `source ${index}`, translation: `target ${index}` }));
    expect(await interpretPhrase(env, { ...phrase, context })).toEqual({ ...interpretation, verified: false });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.model).toBe('gpt-6-luna');
    expect(body.store).toBe(false);
    expect(body.text.format.strict).toBe(true);
    const input = JSON.parse(body.input[0].content);
    expect(input.priorContext).toHaveLength(12);
    expect(input.priorContext[0].source).toBe('source 8');
    expect(input.text).toBe(phrase.text);
  });

  it('never labels a model-detected scripture quote as verified', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(structuredOutput({ translation: 'The Lord is my shepherd.', kind: 'scripture', reference: 'Psalm 23:1', verified: true })));
    expect(await interpretPhrase(env, phrase)).toMatchObject({ kind: 'scripture', reference: 'Psalm 23:1', verified: false });
  });

  it('downgrades unsupported scripture references instead of inventing certainty', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(structuredOutput({ translation: 'Have courage.', kind: 'scripture', reference: 'somewhere in the Psalms' })));
    expect(await interpretPhrase(env, phrase)).toEqual({ translation: 'Have courage.', kind: 'speech', reference: null, verified: false });
  });

  it('rejects incomplete or refused output instead of projecting partial JSON', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ status: 'incomplete', output: [] }))
      .mockResolvedValueOnce(Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'example' }] }] }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(interpretPhrase(env, phrase)).rejects.toMatchObject({ code: 'openai_incomplete' });
    await expect(interpretPhrase(env, phrase)).rejects.toMatchObject({ code: 'openai_refusal' });
  });

  it('sanitizes provider errors, retaining actionable rate-limit status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: { message: `echoed secret ${env.OPENAI_API_KEY}` } }, { status: 429 })));
    try {
      await interpretPhrase(env, phrase);
      throw new Error('Expected provider error');
    } catch (error) {
      expect(error).toBeInstanceOf(OpenAIError);
      expect(error).toMatchObject({ code: 'openai_rate_limited', status: 429, retryable: true });
      expect(String(error)).not.toContain(env.OPENAI_API_KEY);
    }
  });

  it('skips empty summaries and summarizes only the recent supplied window', async () => {
    const fetchMock = vi.fn().mockResolvedValue(structuredOutput({ summary: 'Care for one another.' }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await summarize(env, { segments: [], language: 'en' })).toEqual({ summary: '' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await summarize(env, { segments: [{ source: 'Cuídense unos a otros.', translation: 'Care for one another.' }], language: 'en' })).toEqual({ summary: 'Care for one another.' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
