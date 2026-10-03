import test from 'node:test';
import assert from 'node:assert/strict';
import { WakeListener, wakeCommand } from '../public/wake.js';
test('wake phrases are anchored and do not trigger on quoted mentions', () => {
  assert.equal(wakeCommand('Hey Kane, what time is it?'), 'what time is it?'); assert.equal(wakeCommand('hey K'), '');
  assert.equal(wakeCommand('I heard someone say hey Kane'), undefined); assert.equal(wakeCommand('hey Kaneway'), undefined);
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
