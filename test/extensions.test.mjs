import test from 'node:test';
import assert from 'node:assert/strict';
import { forecast, market } from '../server/markets.ts';
import { Phone } from '../server/phone.ts';
import { Store } from '../server/store.ts';
import { Auth } from '../server/auth.ts';
import { transcribe } from '../server/transcribe.ts';
import { search, safeLink } from '../server/research.ts';
import { readConfig } from '../server/config.ts';
test('public auth requires a strong password, validates cookies and logs out', () => {
  assert.throws(() => new Auth('', true, true), /requires APP_PASSWORD/);
  const auth = new Auth('test-only-long-password', true, true); let cookie;
  const response = { setHeader: (_name, value) => { cookie = value; } };
  assert.equal(auth.authenticated({ headers: {} }), false);
  assert.throws(() => auth.login('wrong', response), /invalid_login/);
  auth.login('test-only-long-password', response); assert.match(cookie, /HttpOnly.*SameSite=Strict.*Secure/);
  const request = { headers: { cookie: cookie.split(';')[0] } }; assert.equal(auth.authenticated(request), true);
  auth.logout(request, response); assert.equal(auth.authenticated(request), false);
});
test('phone pairing, approval, duplicate execution and revocation', () => {
  const store = new Store(':memory:'); const phone = new Phone(store), code = phone.code().code;
  const device = phone.pair(code, 'Test Android'); assert.throws(() => phone.pair(code, 'Again'), /invalid_or_expired/);
  assert.throws(() => phone.propose(device.id, 'unlock_phone', '1234'), /unsupported_phone_action/);
  assert.throws(() => phone.propose(device.id, 'open_url', 'https://127.0.0.1'), /unsupported_phone_url/);
  assert.throws(() => phone.propose(device.id, 'dial_number', 'javascript:alert(1)'), /unsupported_phone_action/);
  assert.throws(() => phone.propose(device.id, 'draft_sms', { number: '+15555550123', text: 'x'.repeat(1001) }), /unsupported_phone_action/);
  assert.equal(phone.propose(device.id, 'dial_number', '+15555550123').argument, '+15555550123');
  assert.deepEqual(JSON.parse(phone.propose(device.id, 'draft_sms', { number: '+15555550123', text: 'Test draft' }).argument), { number: '+15555550123', text: 'Test draft' });
  const action = phone.propose(device.id, 'open_url', 'https://example.com/'); assert.deepEqual(phone.poll(device.id), []);
  assert.throws(() => phone.acknowledge(device.id, action.id), /action_not_approved/);
  phone.approve(action.id); assert.equal(phone.poll(device.id).length, 1); phone.acknowledge(device.id, action.id);
  assert.throws(() => phone.acknowledge(device.id, action.id), /action_not_approved/);
  phone.revoke(device.id); assert.throws(() => phone.poll(device.id), /device_not_paired/); store.db.close();
});
test('forecasts validate data and never fit future observations in backtests', () => {
  const points = Array.from({ length: 100 }, (_, i) => ({ date: '2026-01-' + i, value: 1 + i * .001 })); const result = forecast(points);
  assert.equal(result.central, points.at(-1).value); assert.ok(result.lower <= result.central && result.upper >= result.central);
  assert.equal(result.backtest.observations, 65); assert.ok(result.backtest.meanAbsolutePercentageError > 0);
  assert.throws(() => forecast(points.slice(0, 10)), /insufficient_market_data/);
});
test('Forex pairs are allowlisted before making network calls', async () => {
  await assert.rejects(market('ANY-URL', AbortSignal.timeout(1000), () => { throw new Error('must not call'); }), /unsupported_forex_pair/);
});
test('STT sends multipart audio with its own backend credential', async () => {
  const config = readConfig({ STT_PROVIDER: 'groq', STT_API_KEY: 'fake-speech-key', STT_MODEL: 'whisper-large-v3-turbo' });
  const result = await transcribe(config, new Uint8Array([1,2]), 'audio/webm;codecs=opus', AbortSignal.timeout(1000), async (url, options) => {
    assert.equal(url, 'https://api.groq.com/openai/v1/audio/transcriptions'); assert.equal(options.headers.Authorization, 'Bearer fake-speech-key');
    assert.equal(options.body.get('model'), 'whisper-large-v3-turbo'); assert.ok(options.body.get('file')); return Response.json({ text: 'Hello Kane' });
  }); assert.equal(result.text, 'Hello Kane');
});
test('browser search is the only Groq tool enabled and links come from metadata', async () => {
  const config = readConfig({ SEARCH_PROVIDER: 'groq', SEARCH_API_KEY: 'fake-search-key' });
  const result = await search(config, 'test', AbortSignal.timeout(1000), async (_url, options) => {
    assert.deepEqual(JSON.parse(options.body).tools, [{ type: 'browser_search' }]);
    return Response.json({ choices: [{ message: { content: 'Sourced fact', executed_tools: [{ output: 'https://example.com/source' }] } }] });
  }); assert.equal(result.sourceMetadataAvailable, true); assert.equal(result.sources[0].url, 'https://example.com/source');
  assert.equal(safeLink('javascript:alert(1)'), undefined);
});
