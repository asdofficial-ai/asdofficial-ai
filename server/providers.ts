import type { readConfig } from './config.ts';
import { readFileSync } from 'node:fs';
import { settings } from './settings.ts';
const behavior = readFileSync(new URL('../config/behavior.txt', import.meta.url), 'utf8');

type Config = ReturnType<typeof readConfig>;
export class ProviderError extends Error {
  code: string;
  status: number;
  constructor(code: string, status = 502) { super(code); this.code = code; this.status = status; }
}
async function check(response: Response) {
  if (!response.ok) {
    await response.body?.cancel();
    throw new ProviderError(response.status === 401 || response.status === 403 ? 'provider_authentication_failed' : response.status === 404 ? 'provider_model_or_resource_not_found' : response.status === 429 ? 'provider_rate_limited' : 'provider_unavailable');
  }
}
export async function* streamChat(config: Config, messages: { role: string; content: string }[], signal: AbortSignal, transport = fetch) {
  if (config.text.provider !== 'groq' || !config.text.key || !config.text.model) throw new ProviderError('text_configuration_required', 503);
  const base = new URL(config.text.baseUrl || 'https://api.groq.com/openai/v1/');
  if (base.protocol !== 'https:' || base.username || base.password) throw new ProviderError('invalid_provider_endpoint', 503);
  const response = await transport(new URL('chat/completions', base.href.endsWith('/') ? base : new URL(base.href + '/')), {
    method: 'POST', redirect: 'error', signal,
    headers: { Authorization: `Bearer ${config.text.key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: config.text.model, messages: [{ role: 'system', content: behavior + '\nConfigured language: ' + config.language }, ...messages], stream: true, max_completion_tokens: settings.outputTokens })
  });
  await check(response);
  if (!response.body) throw new ProviderError('invalid_provider_response');
  const decoder = new TextDecoder();
  let buffer = '';
  // Hold enough trailing characters to catch credentials split across deltas.
  const secrets = [config.text.key, config.tts.key, config.stt.key, config.search.key].filter(Boolean);
  const hold = Math.max(1, ...secrets.map(key => key.length));
  let pending = '';
  let finished = false;
  const reader = response.body.getReader();
  try {
    while (true) {
      signal.throwIfAborted();
      const chunk = await reader.read();
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      if (buffer.length > 65536) throw new ProviderError('invalid_provider_response');
      let newline;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline).trim(); buffer = buffer.slice(newline + 1);
        if (!line.startsWith('data:')) continue;
        const raw = line.slice(5).trim();
        if (raw === '[DONE]') { finished = true; break; }
        let data;
        try { data = JSON.parse(raw); } catch { throw new ProviderError('invalid_provider_response'); }
        if (data.error) throw new ProviderError('provider_unavailable');
        const delta = data.choices?.[0]?.delta?.content;
        if (typeof delta === 'string') {
          pending += delta;
          if (secrets.some(key => pending.includes(key))) throw new ProviderError('unsafe_provider_response');
          if (pending.length > hold) { yield pending.slice(0, -hold); pending = pending.slice(-hold); }
        }
      }
      if (finished) break;
    }
    if (!finished) throw new ProviderError('incomplete_provider_response');
    if (pending) yield pending;
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
export async function chat(config: Config, text: string, signal: AbortSignal, transport = fetch) {
  if (config.text.provider !== 'groq' || !config.text.key || !config.text.model) throw new ProviderError('text_configuration_required', 503);
  const base = new URL(config.text.baseUrl || 'https://api.groq.com/openai/v1/');
  if (base.protocol !== 'https:' || base.username || base.password) throw new ProviderError('invalid_provider_endpoint', 503);
  const response = await transport(new URL('chat/completions', base.href.endsWith('/') ? base : new URL(base.href + '/')), {
    method: 'POST', redirect: 'error', signal,
    headers: { Authorization: `Bearer ${config.text.key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: config.text.model, messages: [{ role: 'system', content: behavior }, { role: 'user', content: text }], max_completion_tokens: settings.outputTokens })
  });
  await check(response);
  const data = await response.json();
  const answer = data.choices?.[0]?.message?.content;
  if (typeof answer !== 'string') throw new ProviderError('invalid_provider_response');
  // Never forward the upstream envelope or usage values that may contain arbitrary content.
  if ([config.text.key, config.tts.key, config.stt.key, config.search.key].filter(Boolean).some(key => answer.includes(key))) throw new ProviderError('unsafe_provider_response');
  return { text: answer };
}
export async function speak(config: Config, text: string, signal: AbortSignal, transport = fetch) {
  if (config.tts.provider !== 'fish' || !config.tts.key || !config.tts.model || !config.tts.voice) throw new ProviderError('voice_configuration_required', 503);
  const response = await transport('https://api.fish.audio/v1/tts', {
    method: 'POST', redirect: 'error', signal,
    headers: { Authorization: `Bearer ${config.tts.key}`, 'Content-Type': 'application/json', model: config.tts.model },
    body: JSON.stringify({ text, reference_id: config.tts.voice, format: 'mp3', prosody: { speed: settings.voiceSpeed } })
  });
  await check(response);
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (!response.body) throw new ProviderError('invalid_provider_response');
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > 10 * 1024 * 1024) throw new ProviderError('audio_response_too_large');
    chunks.push(chunk);
  }
  if (!size) throw new ProviderError('invalid_provider_response');
  return Buffer.concat(chunks);
}
