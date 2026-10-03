import { readFileSync } from 'node:fs';
const raw = JSON.parse(readFileSync(new URL('../config/runtime.json', import.meta.url), 'utf8'));
const bounds: Record<string, [number, number]> = { providerTimeoutMs: [1000, 120000], contextCharacters: [4000, 64000], outputTokens: [64, 8192], requestsPerMinute: [1, 1000], voiceSpeed: [0.5, 2] };
for (const [name, [min, max]] of Object.entries(bounds)) {
  if (typeof raw[name] !== 'number' || !Number.isFinite(raw[name]) || raw[name] < min || raw[name] > max) throw new Error('Invalid runtime settings. Check config/runtime.json.');
}
export const settings: { providerTimeoutMs: number; contextCharacters: number; outputTokens: number; requestsPerMinute: number; voiceSpeed: number } = raw;
