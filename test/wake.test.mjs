import test from 'node:test';
import assert from 'node:assert/strict';
import { WakeListener, wakeCommand, isDismissCommand } from '../public/wake.js';
test('wake phrases are anchored and do not trigger on quoted mentions', () => {
  assert.equal(wakeCommand('Hey Kane, what time is it?'), 'what time is it?'); assert.equal(wakeCommand('hey K'), '');
  assert.equal(wakeCommand('I heard someone say hey Kane'), undefined); assert.equal(wakeCommand('hey Kaneway'), undefined);
});
test('dismissal matches direct commands, not quoted mentions or reminder instructions', () => {
  for (const text of ['dismiss', 'You are dismissed.', 'you’re dismissed', 'Hey Kane, shut up!', 'Kane, stop talking', 'be quiet please']) assert.equal(isDismissCommand(text), true, text);
  for (const text of ['dismiss this reminder', 'what does dismiss mean?', 'say you are dismissed', '"dismiss"', 'do not shut up']) assert.equal(isDismissCommand(text), false, text);
});
test('reply mode accepts dismissal, ignores wake requests and disables after dismissal', t => {
  const previous = globalThis.document; globalThis.document = { documentElement: { lang: 'en' } }; t.after(() => { previous === undefined ? delete globalThis.document : globalThis.document = previous; });
  const instances = []; class Recognition { constructor() { instances.push(this); } start() {} abort() { this.aborted = true; } }
  const commands = []; let dismissed = 0;
  const wake = new WakeListener(value => commands.push(value), () => {}, Recognition, () => dismissed++); t.after(() => wake.disable());
  const event = (text, isFinal = true) => ({ resultIndex: 0, results: [Object.assign([{ transcript: text }], { isFinal })] });
  wake.enable(); wake.setMode('controls'); const recognition = instances.at(-1);
  recognition.onresult(event('Hey Kane start another response')); assert.equal(commands.length, 0);
  recognition.onresult(event('dismiss', false)); assert.equal(dismissed, 0);
  recognition.onresult(event('you are dismissed')); assert.equal(dismissed, 1); assert.equal(wake.enabled, false); assert.equal(recognition.aborted, true);
  recognition.onresult(event('dismiss')); assert.equal(dismissed, 1);
});
test('pause and disable suppress late wake results and release recognition', t => {
  const previous = globalThis.document; globalThis.document = { documentElement: { lang: 'en' } }; t.after(() => { previous === undefined ? delete globalThis.document : globalThis.document = previous; });
  const instances = []; class Recognition { constructor() { instances.push(this); } start() {} abort() { this.aborted = true; } }
  const commands = []; const wake = new WakeListener(value => commands.push(value), () => {}, Recognition); t.after(() => wake.disable());
  wake.enable(); const first = instances[0]; const result = { resultIndex: 0, results: [Object.assign([{ transcript: 'Hey Kane test' }], { isFinal: true })] };
  wake.pause(); first.onresult(result); assert.equal(commands.length, 0); assert.equal(first.aborted, true);
  wake.resume(); instances[1].onresult(result); assert.deepEqual(commands, ['test']);
  wake.disable(); instances[1].onresult(result); assert.equal(commands.length, 1);
});
