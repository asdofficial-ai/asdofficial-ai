import test from 'node:test';
import assert from 'node:assert/strict';
import { streamChat } from '../server/providers.ts';
import { readConfig } from '../server/config.ts';
const config = readConfig({ AI_PROVIDER: 'groq', AI_API_KEY: 'fake-key', AI_MODEL: 'test' });
const transport = values => async () => new Response(values.map(content => 'data: ' + JSON.stringify({ choices: [{ delta: { content } }] }) + '\n\n').join('') + 'data: [DONE]\n\n');
test('Groq SSE parser yields complete text', async () => {
  let result = ''; for await (const delta of streamChat(config, [], AbortSignal.timeout(1000), transport(['Hello ', 'world']))) result += delta;
  assert.equal(result, 'Hello world');
});
test('credentials split across deltas cannot be emitted', async () => {
  await assert.rejects(async () => { for await (const delta of streamChat(config, [], AbortSignal.timeout(1000), transport(['fake-', 'key']))) assert.ok(!delta.includes('fake-key')); }, /unsafe_provider_response/);
});
test('truncated streams fail explicitly', async () => {
  await assert.rejects(async () => { for await (const delta of streamChat(config, [], AbortSignal.timeout(1000), async () => new Response('data: {}\n\n'))) void delta; }, /incomplete_provider_response/);
});
