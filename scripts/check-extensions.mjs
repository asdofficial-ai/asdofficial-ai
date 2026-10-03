import { loadEnvironment, readConfig } from '../server/config.ts';
import { search } from '../server/research.ts';
import { market } from '../server/markets.ts';
import { speak, ProviderError } from '../server/providers.ts';
import { transcribe } from '../server/transcribe.ts';
loadEnvironment(); const config = readConfig(process.env);
for (const [name, operation] of [
  ['forex', async () => { const result = await market('EUR-USD', AbortSignal.timeout(15000)); console.log('forex-points', result.points.length); }],
  ['speech', async () => { const audio = await speak(config, 'Hello. I am Kane.', AbortSignal.timeout(30000)); const result = await transcribe(config, audio, 'audio/mpeg', AbortSignal.timeout(30000)); if (!result.text.trim()) throw new Error('empty'); }],
  ['search', async () => { const result = await search(config, 'Find the official European Central Bank website and provide its URL.', AbortSignal.timeout(30000)); console.log('search-source-metadata', result.sourceMetadataAvailable ? 'present' : 'not-provided'); if (!result.answer.trim()) throw new Error('empty'); }]
]) { try { await operation(); console.log(name, 'passed'); } catch (error) { console.log(name, error instanceof ProviderError ? error.code : 'network_or_timeout_failure'); process.exitCode = 1; } }
