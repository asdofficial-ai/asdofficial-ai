import test from 'node:test';
import assert from 'node:assert/strict';
import { VoiceCapture } from '../public/voice.js';

function browser(t, getUserMedia, failContext = false) {
  const previous = ['navigator', 'window', 'MediaRecorder', 'AudioContext'].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]);
  const recorders = [];
  class Recorder {
    static isTypeSupported() { return true; }
    constructor(_stream, options) { this.mimeType = options.mimeType; this.state = 'inactive'; recorders.push(this); }
    start() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; }
    async emitStop() { this.ondataavailable({ data: new Blob(['audio']) }); await this.onstop(); }
  }
  class Context {
    constructor() { if (failContext) throw new Error('audio setup failed'); }
    async resume() {}
    async close() {}
    createAnalyser() { return { fftSize: 1024, getByteTimeDomainData(data) { data.fill(128); } }; }
    createMediaStreamSource() { return { connect() {} }; }
  }
  for (const [name, value] of Object.entries({ navigator: { mediaDevices: { getUserMedia } }, window: { MediaRecorder: Recorder }, MediaRecorder: Recorder, AudioContext: Context })) Object.defineProperty(globalThis, name, { value, configurable: true });
  t.after(() => { for (const [name, descriptor] of previous) descriptor ? Object.defineProperty(globalThis, name, descriptor) : delete globalThis[name]; });
  return recorders;
}
function stream() { const track = { stopped: false, stop() { this.stopped = true; } }; return { track, getTracks() { return [track]; } }; }

test('cancelled pending microphone permission cannot start a recording', async t => {
  let resolve; const audio = stream(); const recorders = browser(t, () => new Promise(done => { resolve = done; }));
  const capture = new VoiceCapture(); t.after(() => capture.cancel());
  const pending = capture.start(() => {}, () => assert.fail('cancelled audio delivered'));
  capture.cancel(); resolve(audio); await pending;
  assert.equal(audio.track.stopped, true); assert.equal(recorders.length, 0);
});

test('an old recorder stop cannot release or submit a newer recording', async t => {
  const streams = [stream(), stream()]; let index = 0;
  const recorders = browser(t, async () => streams[index++]); const capture = new VoiceCapture(); t.after(() => capture.cancel());
  const received = [];
  await capture.start(() => {}, blob => received.push(blob)); capture.cancel();
  await capture.start(() => {}, blob => received.push(blob)); await recorders[0].emitStop();
  assert.equal(streams[1].track.stopped, false); assert.equal(capture.recorder, recorders[1]); assert.equal(received.length, 0);
  capture.finish(); await recorders[1].emitStop();
  assert.equal(streams[1].track.stopped, true); assert.equal(received.length, 1); assert.equal(received[0].type, recorders[1].mimeType);
});

test('microphone resources are released when audio setup fails', async t => {
  const audio = stream(); browser(t, async () => audio, true); const capture = new VoiceCapture(); t.after(() => capture.cancel());
  await assert.rejects(capture.start(() => {}, () => {}), /audio setup failed/);
  assert.equal(audio.track.stopped, true); assert.equal(capture.recorder, undefined);
});
