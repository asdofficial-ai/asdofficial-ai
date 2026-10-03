import test from 'node:test';
import assert from 'node:assert/strict';
import { readConfig, capabilityStatus, value } from '../server/config.ts';

test('blank and placeholder values are unconfigured', () => {
  for (const raw of [undefined, '', '   ', ' PASTE_SECRET_HERE ', 'paste_provider']) assert.equal(value(raw), '');
  assert.equal(capabilityStatus(readConfig({})).text.status, 'configuration_required');
});
test('configured keys cannot enable unimplemented adapters or leak into status', () => {
  const env = { AI_PROVIDER: 'custom-secret-provider', AI_API_KEY: 'secret-text', AI_MODEL: 'secret-model', TTS_API_KEY: 'secret-voice', SEARCH_API_KEY: 'secret-search' };
  const status = capabilityStatus(readConfig(env));
  assert.equal(status.text.status, 'adapter_not_implemented');
  assert.equal(status.text.available, false);
  for (const secret of Object.values(env)) assert.ok(!JSON.stringify(status).includes(secret));
});
test('browser speech recognition does not require a key', () => {
  const status = capabilityStatus(readConfig({ STT_PROVIDER: 'browser' }));
  assert.deepEqual(status.speechRecognition.missing, []);
  assert.equal(status.speechRecognition.status, 'requires_browser_interface');
});
test('one credential can be independently assigned to several capabilities', () => {
  const config = readConfig({ AI_API_KEY: 'shared', STT_API_KEY: 'shared', TTS_API_KEY: 'shared' });
  assert.equal(config.text.key, config.stt.key);
  assert.equal(config.stt.key, config.tts.key);
});
