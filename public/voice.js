export class VoiceCapture {
  recorder; stream; context; timer; poll; cancelled = false;
  async start(onState, onAudio) {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw new Error('Microphone capture requires a supported browser and HTTPS.');
    this.cancelled = false;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    if (this.cancelled) { stream.getTracks().forEach(track => track.stop()); return; }
    this.stream = stream;
    const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'].find(type => MediaRecorder.isTypeSupported(type));
    this.recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const chunks = []; this.recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    this.recorder.onstop = async () => {
      this.cleanup();
      if (this.cancelled) return;
      const blob = new Blob(chunks, { type: this.recorder.mimeType });
      if (!blob.size) { onState('No speech captured. Try again.'); return; }
      onState('transcribing'); await onAudio(blob);
    };
    this.recorder.onerror = () => { this.cancel(); onState('Microphone recording failed.'); };
    this.context = new AudioContext();
    const analyser = this.context.createAnalyser(); analyser.fftSize = 1024;
    this.context.createMediaStreamSource(stream).connect(analyser);
    const data = new Uint8Array(analyser.fftSize); let spoke = false, lastSpeech = Date.now(); const started = Date.now();
    this.poll = setInterval(() => {
      analyser.getByteTimeDomainData(data); const rms = Math.sqrt(data.reduce((sum, sample) => sum + ((sample - 128) / 128) ** 2, 0) / data.length);
      if (rms > 0.018) { spoke = true; lastSpeech = Date.now(); }
      if ((spoke && Date.now() - lastSpeech > 1400) || (!spoke && Date.now() - started > 10000)) this.finish();
    }, 100);
    this.timer = setTimeout(() => this.finish(), 45000);
    this.recorder.start(); onState('listening');
  }
  finish() { if (this.recorder?.state === 'recording') this.recorder.stop(); }
  cleanup() { clearInterval(this.poll); clearTimeout(this.timer); this.stream?.getTracks().forEach(track => track.stop()); this.context?.close().catch(() => {}); }
  cancel() { this.cancelled = true; if (this.recorder?.state === 'recording') this.recorder.stop(); this.cleanup(); }
}
