import test from 'node:test';
import assert from 'node:assert/strict';
import { readConfig, capabilityStatus } from '../server/config.ts';
import { chat, speak } from '../server/providers.ts';
const config = readConfig({ AI_PROVIDER: 'groq', AI_API_KEY: 'fake-text', AI_MODEL: 'test-model', TTS_PROVIDER: 'fish', TTS_API_KEY: 'fake-voice', TTS_MODEL: 's2.1-pro-free', TTS_VOICE_ID: 'test-voice' });
test('Groq uses chat completions and returns only assistant text', async () => {
  const result = await chat(config, 'Hello', AbortSignal.timeout(1000), async (url, options) => {
    assert.equal(String(url), 'https://api.groq.com/openai/v1/chat/completions');
    assert.equal(options.headers.Authorization, 'Bearer fake-text');
    assert.equal(JSON.parse(options.body).model, 'test-model');
    return Response.json({ choices: [{ message: { content: 'Hello.' } }], secret: 'fake-text' });
  });
  assert.deepEqual(result, { text: 'Hello.' });
  assert.equal(capabilityStatus(config).text.available, true);
});
test('Fish uses model header and voice reference ID', async () => {
  const audio = await speak(config, 'Hello', AbortSignal.timeout(1000), async (url, options) => {
    assert.equal(url, 'https://api.fish.audio/v1/tts');
    assert.equal(options.headers.model, 's2.1-pro-free');
    assert.equal(JSON.parse(options.body).reference_id, 'test-voice');
    assert.equal(options.headers.Authorization, 'Bearer fake-voice');
    return new Response(new Uint8Array([1, 2, 3]));
  });
  assert.equal(audio.length, 3);
});
test('provider authentication and rate errors never expose upstream bodies', async () => {
  for (const [status, code] of [[401, 'provider_authentication_failed'], [429, 'provider_rate_limited']]) {
    await assert.rejects(chat(config, 'Hello', AbortSignal.timeout(1000), async () => new Response('fake-text', { status })), error => error.code === code && !error.message.includes('fake-text'));
  }
});
test('missing configuration prevents network requests', async () => {
  await assert.rejects(chat(readConfig({}), 'Hello', AbortSignal.timeout(1000), async () => { throw new Error('must not call'); }), /text_configuration_required/);
});
test('cancellation signal reaches the provider', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(chat(config, 'Hello', controller.signal, async (_url, options) => { options.signal.throwIfAborted(); }), { name: 'AbortError' });
});
