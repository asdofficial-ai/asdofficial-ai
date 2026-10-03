export function wakeCommand(text) {
  return /^\s*(?:hey|okay|ok)\s+(?:kane|k)\b[\s,.!?;:]*(.*)$/i.exec(text)?.[1]?.trim();
}
export class WakeListener {
  enabled = false; recognition; timer; paused = false;
  constructor(onWake, onStatus, Recognition = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition) { this.Recognition = Recognition; this.onWake = onWake; this.onStatus = onStatus; }
  enable() { if (!this.Recognition) throw new Error('Wake word is unavailable in this browser. Use the microphone button.'); this.enabled = true; this.onStatus('Wake word enabled'); this.resume(); }
  pause() { this.paused = true; clearTimeout(this.timer); const recognition = this.recognition; this.recognition = undefined; recognition?.abort(); if (this.enabled) this.onStatus('Wake word paused'); }
  resume() {
    this.paused = false;
    if (!this.enabled || this.recognition) return;
    const recognition = new this.Recognition(); this.recognition = recognition;
    recognition.lang = document.documentElement.lang || 'en'; recognition.continuous = true; recognition.interimResults = false;
    recognition.onresult = event => {
      if (this.recognition !== recognition || !this.enabled || this.paused) return;
      for (let i = event.resultIndex; i < event.results.length; i++) { if (!event.results[i].isFinal) continue; const command = wakeCommand(event.results[i][0].transcript); if (command !== undefined) { this.pause(); this.onStatus('Wake word detected'); this.onWake(command); break; } }
    };
    recognition.onerror = event => { if (this.recognition !== recognition) return; if (event.error !== 'no-speech' && event.error !== 'aborted') { this.disable(); this.onStatus('Wake word stopped: ' + event.error + '. Enable it again to retry.'); } };
    recognition.onend = () => { if (this.recognition !== recognition) return; this.recognition = undefined; if (this.enabled && !this.paused) this.timer = setTimeout(() => this.resume(), 1500); };
    try { recognition.start(); this.onStatus('Listening for Hey Kane'); } catch { this.disable(); this.onStatus('Wake word could not start. Enable it again to retry.'); }
  }
  disable() { this.enabled = false; this.pause(); this.onStatus('Wake word off'); }
}
