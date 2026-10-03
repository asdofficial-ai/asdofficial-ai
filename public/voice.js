export class VoiceCapture {
  recorder; active; generation = 0;
  async start(onState, onAudio) {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw new Error('Microphone capture requires a supported browser and HTTPS.');
    this.cancel(); const generation = this.generation;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    if (generation !== this.generation) { stream.getTracks().forEach(track => track.stop()); return; }
    const recording = { stream, context: undefined, timer: undefined, poll: undefined, recorder: undefined };
    this.active = recording;
    try {
    const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'].find(type => MediaRecorder.isTypeSupported(type));
    const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    recording.recorder = recorder; this.recorder = recorder;
    const chunks = []; recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    recorder.onstop = async () => {
      this.cleanup(recording);
      if (generation !== this.generation) return;
      const blob = new Blob(chunks, { type: recorder.mimeType });
      if (!blob.size) { onState('No speech captured. Try again.'); return; }
      onState('transcribing');
      try { await onAudio(blob); } catch { if (generation === this.generation) onState('Speech processing failed. Try again.'); }
    };
    recorder.onerror = () => { if (generation !== this.generation) return; this.cancel(); onState('Microphone recording failed.'); };
    const context = new AudioContext(); recording.context = context;
    await context.resume();
    if (generation !== this.generation) { this.cleanup(recording); return; }
    const analyser = context.createAnalyser(); analyser.fftSize = 1024;
    context.createMediaStreamSource(stream).connect(analyser);
    const data = new Uint8Array(analyser.fftSize); let spoke = false, lastSpeech = Date.now(); const started = Date.now();
    recording.poll = setInterval(() => {
      analyser.getByteTimeDomainData(data); const rms = Math.sqrt(data.reduce((sum, sample) => sum + ((sample - 128) / 128) ** 2, 0) / data.length);
      if (rms > 0.018) { spoke = true; lastSpeech = Date.now(); }
      if ((spoke && Date.now() - lastSpeech > 1400) || (!spoke && Date.now() - started > 10000)) this.finish();
    }, 100);
    recording.timer = setTimeout(() => this.finish(), 45000);
    recorder.start(); onState('listening');
    } catch (error) { this.cleanup(recording); throw error; }
  }
  finish() { if (this.recorder?.state === 'recording') this.recorder.stop(); }
  cleanup(recording = this.active) {
    if (!recording || recording.cleaned) return;
    recording.cleaned = true; clearInterval(recording.poll); clearTimeout(recording.timer);
    recording.stream.getTracks().forEach(track => track.stop()); recording.context?.close().catch(() => {});
    if (this.active === recording) { this.active = undefined; this.recorder = undefined; }
  }
  cancel() { this.generation++; const recording = this.active; if (recording?.recorder?.state === 'recording') recording.recorder.stop(); this.cleanup(recording); }
}
