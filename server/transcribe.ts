import type { readConfig } from './config.ts';
import { ProviderError } from './providers.ts';
export async function transcribe(config: ReturnType<typeof readConfig>, bytes: Uint8Array, mime: string, signal: AbortSignal, transport = fetch) {
  if (config.stt.provider !== 'groq' || !config.stt.key || !config.stt.model) throw new ProviderError('speech_configuration_required', 503);
  const type = mime.split(';')[0];
  if (!['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/wav', 'audio/mpeg'].includes(type)) throw new ProviderError('unsupported_audio_type', 415);
  const extension = ({ 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/wav': 'wav', 'audio/mpeg': 'mp3' } as Record<string, string>)[type];
  const form = new FormData();
  form.set('file', new Blob([new Uint8Array(bytes)], { type }), `speech.${extension}`); form.set('model', config.stt.model); form.set('response_format', 'json');
  if (/^[a-z]{2}$/.test(config.language)) form.set('language', config.language);
  const response = await transport('https://api.groq.com/openai/v1/audio/transcriptions', { method: 'POST', redirect: 'error', signal, headers: { Authorization: `Bearer ${config.stt.key}` }, body: form });
  if (!response.ok) { await response.body?.cancel(); throw new ProviderError(response.status === 401 ? 'speech_authentication_failed' : 'speech_provider_unavailable'); }
  const data = await response.json();
  if (typeof data.text !== 'string' || data.text.length > 4000) throw new ProviderError('invalid_transcription');
  if ([config.text.key, config.stt.key, config.tts.key, config.search.key].filter(Boolean).some(key => data.text.includes(key))) throw new ProviderError('unsafe_provider_response');
  return { text: data.text };
}
