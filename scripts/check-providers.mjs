import { loadEnvironment, readConfig } from '../server/config.ts';
import { chat, speak, ProviderError } from '../server/providers.ts';
loadEnvironment();
const config = readConfig(process.env);
for (const [name, operation] of [['groq', chat], ['fish', speak]]) {
  try {
    const result = await operation(config, 'Hello. I am Kane.', AbortSignal.timeout(30000));
    console.log(name, name === 'groq' ? 'text-received' : result.length > 0 ? 'audio-received' : 'empty-audio');
  } catch (error) { console.log(name, error instanceof ProviderError ? error.code : 'network_or_timeout_error'); }
}
