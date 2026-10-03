import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const envPath = fileURLToPath(new URL('../.env', import.meta.url));

export function loadEnvironment() {
  if (existsSync(envPath)) {
    try { process.loadEnvFile(envPath); }
    catch { throw new Error('Unable to load backend .env. Check its syntax and file permissions.'); }
  }
  const hosting = fileURLToPath(new URL('../.env.hosting', import.meta.url));
  if (existsSync(hosting)) { try { process.loadEnvFile(hosting); } catch { throw new Error('Unable to load hosting configuration.'); } }
}

export function value(raw: string | undefined): string {
  const cleaned = raw?.trim() ?? '';
  return /^PASTE_/i.test(cleaned) ? '' : cleaned;
}

export function readConfig(env: Record<string, string | undefined>) {
  const get = (name: string) => value(env[name]);
  return {
    name: get('ASSISTANT_NAME') || 'Kane',
    language: get('DEFAULT_LANGUAGE') || 'en',
    text: { provider: get('AI_PROVIDER').toLowerCase(), key: get('AI_API_KEY'), model: get('AI_MODEL'), baseUrl: get('AI_BASE_URL') },
    stt: { provider: get('STT_PROVIDER').toLowerCase(), key: get('STT_API_KEY'), model: get('STT_MODEL') },
    tts: { provider: get('TTS_PROVIDER').toLowerCase(), key: get('TTS_API_KEY'), model: get('TTS_MODEL'), voice: get('TTS_VOICE_ID') },
    search: { provider: get('SEARCH_PROVIDER').toLowerCase(), key: get('SEARCH_API_KEY') }
  };
}

// Only explicitly registered, implemented adapters can become available.
// Configuration alone must never advertise a working integration.
export function capabilityStatus(config: ReturnType<typeof readConfig>) {
  const status = (provider: string, fields: Record<string, string>, implemented = '') => {
    const missing = Object.keys(fields).filter(name => !fields[name]);
    const available = !missing.length && provider === implemented;
    return { available, status: missing.length ? 'configuration_required' : available ? 'configured' : 'adapter_not_implemented', missing };
  };
  return {
    text: status(config.text.provider, { AI_PROVIDER: config.text.provider, AI_API_KEY: config.text.key, AI_MODEL: config.text.model }, 'groq'),
    speechRecognition: config.stt.provider === 'browser'
      ? { available: false, status: 'requires_browser_interface', missing: [] }
      : status(config.stt.provider, { STT_PROVIDER: config.stt.provider, STT_API_KEY: config.stt.key, STT_MODEL: config.stt.model }, 'groq'),
    voiceGeneration: status(config.tts.provider, { TTS_PROVIDER: config.tts.provider, TTS_API_KEY: config.tts.key, TTS_MODEL: config.tts.model, TTS_VOICE_ID: config.tts.voice }, 'fish'),
    search: status(config.search.provider, { SEARCH_PROVIDER: config.search.provider, SEARCH_API_KEY: config.search.key }, 'groq'),
    wakeWord: { available: false, status: 'not_implemented' }
  };
}
