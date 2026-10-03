import { createServer } from 'node:http';
import { loadEnvironment, readConfig, capabilityStatus } from './config.ts';
import { chat, speak, ProviderError } from './providers.ts';
import { Store } from './store.ts';
import { Engine } from './engine.ts';
import { tools, executeTool } from './tools.ts';
import type { IncomingMessage } from 'node:http';
import { readFileSync } from 'node:fs';
import { settings } from './settings.ts';
import { Auth } from './auth.ts';
import { Phone } from './phone.ts';
import { search } from './research.ts';
import { market, forexPairs } from './markets.ts';
import { transcribe } from './transcribe.ts';
import { Reminders } from './reminders.ts';
import { totalmem, cpus, uptime } from 'node:os';

try { loadEnvironment(); }
catch { console.error('Backend configuration could not be loaded. Check .env syntax and permissions.'); process.exit(1); }
const config = readConfig(process.env);
const capabilities = capabilityStatus(config);
const port = Number(process.env.PORT || 3001);
const host = process.env.HOST || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1');
const publicOrigin = new URL(process.env.PUBLIC_ORIGIN || `http://127.0.0.1:${port}`).origin;
const publicMode = process.env.NODE_ENV === 'production' || host !== '127.0.0.1';
if (publicMode && (!publicOrigin.startsWith('https:') || !process.env.DATABASE_PATH)) throw new Error('Public hosting requires HTTPS PUBLIC_ORIGIN and a persistent DATABASE_PATH.');
const auth = new Auth(process.env.APP_PASSWORD || '', publicOrigin.startsWith('https:'), publicMode);
const store = new Store();
const engine = new Engine(store, config);
const phone = new Phone(store);
const reminders = new Reminders(store);
let previousCpu = process.cpuUsage(); let previousTime = Date.now();
let loginWindow = Date.now(); let loginAttempts = 0;
let rateWindow = Date.now();
let requests = 0;
async function body(request: IncomingMessage) {
  if (!request.headers['content-type']?.startsWith('application/json')) throw new ProviderError('json_required', 415);
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) { size += chunk.length; if (size > 16384) throw new ProviderError('request_too_large', 413); chunks.push(chunk); }
  let input;
  try { input = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new ProviderError('invalid_json', 400); }
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ProviderError('invalid_input', 400);
  if ([config.text.key, config.tts.key, config.stt.key, config.search.key].filter(Boolean).some(key => JSON.stringify(input).includes(key))) throw new ProviderError('credential_content_rejected', 400);
  return input;
}
function text(value: unknown) { if (typeof value !== 'string' || !value.trim() || value.length > 4000) throw new ProviderError('invalid_text', 400); return value; }
// Output only fixed status labels and environment variable names, never values.
console.info(JSON.stringify({ event: 'configuration.validated', capabilities }));
const server = createServer(async (request, response) => {
  response.setHeader('Content-Type', 'application/json');
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  try {
    if (![new URL(publicOrigin).host, `127.0.0.1:${port}`, `localhost:${port}`].includes(request.headers.host || '')) throw new ProviderError('invalid_host', 403);
    if (request.headers.origin && request.headers.origin !== publicOrigin) throw new ProviderError('origin_not_allowed', 403);
    if (Date.now() - rateWindow >= 60000) { requests = 0; rateWindow = Date.now(); }
    if (++requests > settings.requestsPerMinute) throw new ProviderError('rate_limit', 429);
    const path = new URL(request.url || '/', 'http://127.0.0.1:3001').pathname;
    const sessionRoute = path.match(/^\/api\/sessions\/([\w-]+)(?:\/(messages|cancel))?$/);
    const itemRoute = path.match(/^\/api\/(memories|notes|tasks)(?:\/([\w-]+))?$/);
    const assets: Record<string, [string, string]> = { '/': ['index.html','text/html'], '/app.js': ['app.js','text/javascript'], '/cockpit.css': ['cockpit.css','text/css'], '/orb.js': ['orb.js','text/javascript'], '/voice.js': ['voice.js','text/javascript'], '/assistant-extras.js': ['assistant-extras.js','text/javascript'], '/wake.js': ['wake.js','text/javascript'], '/manifest.webmanifest': ['manifest.webmanifest','application/manifest+json'], '/sw.js': ['sw.js','text/javascript'], '/icon.svg': ['icon.svg','image/svg+xml'], '/phone': ['phone.html','text/html'], '/phone.js': ['phone.js','text/javascript'] };
    if (request.method === 'GET' && assets[path]) {
      response.setHeader('Content-Type', assets[path][1] + '; charset=utf-8');
      response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; media-src 'self' blob:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
      response.end(readFileSync(new URL('../public/' + assets[path][0], import.meta.url))); return;
    }
    if (path === '/api/health' && request.method === 'GET') { response.end(JSON.stringify({ status: 'ok' })); return; }
    if (path === '/api/auth/login' && request.method === 'POST') {
      if (Date.now() - loginWindow > 60000) { loginWindow = Date.now(); loginAttempts = 0; }
      if (++loginAttempts > 5) throw new ProviderError('login_rate_limit', 429);
      auth.login((await body(request)).password, response); response.end(JSON.stringify({ authenticated: true })); return;
    }
    if (!auth.authenticated(request)) throw new ProviderError('login_required', 401);
    if (path === '/api/reminders' && request.method === 'GET') { response.end(JSON.stringify({ reminders: reminders.list(), serverTime: new Date().toISOString() })); return; }
    if (path === '/api/reminders' && request.method === 'POST') { const input = await body(request); response.statusCode = 201; response.end(JSON.stringify({ reminder: reminders.create(input.title, input.dueAt, input.repeatHours) })); return; }
    const reminderRoute = path.match(/^\/api\/reminders\/([\w-]+)$/);
    if (reminderRoute && request.method === 'PATCH') { reminders.act(reminderRoute[1], (await body(request)).action); response.end(JSON.stringify({ updated: true })); return; }
    if (reminderRoute && request.method === 'DELETE') { reminders.delete(reminderRoute[1]); response.end(JSON.stringify({ deleted: true })); return; }
    if (path === '/api/auth/logout' && request.method === 'POST') { auth.logout(request, response); response.end(JSON.stringify({ loggedOut: true })); return; }
    if (path === '/api/telemetry' && request.method === 'GET') {
      const currentCpu = process.cpuUsage(); const now = Date.now(); const delta = (currentCpu.user - previousCpu.user + currentCpu.system - previousCpu.system) / 1000;
      const cpu = Math.min(100, delta / Math.max(1, now - previousTime) * 100); previousCpu = currentCpu; previousTime = now;
      const count = (table: string) => Number(store.db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get()?.count);
      response.end(JSON.stringify({ processCpuPercent: cpu, processMemoryBytes: process.memoryUsage().rss, hostMemoryBytes: totalmem(), cores: cpus().length, processUptimeSeconds: process.uptime(), hostUptimeSeconds: uptime(), counts: { sessions: count('sessions'), messages: count('messages'), memories: store.list('memories').length, notes: store.list('notes').length, tasks: store.list('tasks').length }, activeTurns: engine.active.size, authRequired: Boolean(auth.passwordHash), language: /^[a-z]{2}$/.test(config.language) ? config.language : 'en', events: engine.activity })); return;
    }
    if (path === '/api/sessions' && request.method === 'GET') { response.end(JSON.stringify({ sessions: store.db.prepare('SELECT * FROM sessions ORDER BY rowid DESC LIMIT 100').all() })); return; }
    if (path === '/api/search' && request.method === 'POST') {
      const input = await body(request); const result = await search(config, text(input.query), AbortSignal.timeout(settings.providerTimeoutMs)); response.end(JSON.stringify(result)); return;
    }
    if (path === '/api/markets' && request.method === 'GET') { response.end(JSON.stringify({ pairs: forexPairs, dataType: 'daily_reference_rates' })); return; }
    if (path === '/api/markets/forex' && request.method === 'GET') {
      const pair = new URL(request.url || '', publicOrigin).searchParams.get('pair') || 'EUR-USD'; response.end(JSON.stringify(await market(pair, AbortSignal.timeout(15000)))); return;
    }
    if (path === '/api/transcribe' && request.method === 'POST') {
      let size = 0; const chunks: Buffer[] = [];
      for await (const chunk of request) { size += chunk.length; if (size > 8 * 1024 * 1024) throw new ProviderError('audio_too_large', 413); chunks.push(chunk); }
      if (!size) throw new ProviderError('empty_audio', 400);
      response.end(JSON.stringify(await transcribe(config, Buffer.concat(chunks), request.headers['content-type'] || '', AbortSignal.timeout(settings.providerTimeoutMs)))); return;
    }
    if (path === '/api/phone/devices' && request.method === 'GET') { response.end(JSON.stringify({ devices: phone.list(), capabilities: ['open_url','dial_number','draft_sms'], foregroundOnly: true })); return; }
    if (path === '/api/phone/pairing' && request.method === 'POST') { response.end(JSON.stringify(phone.code())); return; }
    if (path === '/api/phone/pair' && request.method === 'POST') { const input = await body(request); response.end(JSON.stringify(phone.pair(input.code, input.name))); return; }
    const phoneRoute = path.match(/^\/api\/phone\/devices\/([\w-]+)(?:\/(actions|poll))?$/);
    if (phoneRoute) {
      const [, id, action] = phoneRoute;
      if (request.method === 'DELETE' && !action) { phone.revoke(id); response.end(JSON.stringify({ revoked: true })); return; }
      if (request.method === 'POST' && action === 'actions') { const input = await body(request); response.end(JSON.stringify({ action: phone.propose(id, input.kind, input.argument) })); return; }
      if (request.method === 'GET' && action === 'poll') { response.end(JSON.stringify({ actions: phone.poll(id) })); return; }
    }
    const actionRoute = path.match(/^\/api\/phone\/actions\/([\w-]+)\/(approve|acknowledge)$/);
    if (actionRoute && request.method === 'POST') {
      const [, id, action] = actionRoute;
      if (action === 'approve') { phone.approve(id); response.end(JSON.stringify({ approved: true })); return; }
      const input = await body(request); phone.acknowledge(text(input.deviceId), id); response.end(JSON.stringify({ acknowledged: true })); return;
    }
    if (path === '/api/sessions' && request.method === 'POST') {
      response.statusCode = 201; response.end(JSON.stringify({ type: 'session.created', session: store.session() })); return;
    }
    if (path === '/api/memory/settings' && request.method === 'PATCH') {
      const input = await body(request);
      if (typeof input.enabled !== 'boolean') throw new ProviderError('invalid_input', 400);
      store.setMemory(input.enabled); response.end(JSON.stringify({ enabled: store.memoryEnabled() })); return;
    }
    if (sessionRoute) {
      const [, session, action] = sessionRoute;
      store.requireSession(session);
      if (request.method === 'GET' && !action) { response.end(JSON.stringify({ messages: store.history(session) })); return; }
      if (request.method === 'POST' && action === 'cancel') { engine.cancel(session); response.end(JSON.stringify({ cancellationRequested: true })); return; }
      if (request.method === 'DELETE' && !action) {
        if (engine.active.has(session)) throw new ProviderError('cancel_active_turn_first', 409);
        store.db.prepare('DELETE FROM sessions WHERE id=?').run(session); response.end(JSON.stringify({ deleted: true })); return;
      }
      if (request.method === 'POST' && action === 'messages') {
        const input = await body(request);
        text(input.text);
        if (typeof input.requestId !== 'string' || !/^[\w-]{1,100}$/.test(input.requestId)) throw new ProviderError('request_id_required', 400);
        const controller = new AbortController();
        response.on('close', () => controller.abort());
        // Delay SSE headers until validation in the engine has succeeded.
        await engine.turn(session, input.requestId, input.text, event => {
          if (response.destroyed) return;
          if (!response.headersSent) response.setHeader('Content-Type', 'text/event-stream');
          response.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
        }, controller.signal, undefined, settings.providerTimeoutMs, input.research === true);
        response.end(); return;
      }
    }
    if (itemRoute) {
      const [, kind, id] = itemRoute;
      if (request.method === 'GET' && !id) { response.end(JSON.stringify({ items: store.list(kind) })); return; }
      if (request.method === 'DELETE') {
        if (!id && kind !== 'memories') throw new ProviderError('item_id_required', 400);
        store.deleteItem(kind, id); response.end(JSON.stringify({ deleted: true })); return;
      }
      if ((request.method === 'POST' && !id) || (request.method === 'PATCH' && id)) {
        const input = await body(request);
        if (kind === 'memories' && input.confirmed !== true) throw new ProviderError('memory_confirmation_required', 400);
        const item = store.save(kind, text(input.content), input.source ? text(input.source) : 'explicit_user_request', id, input.completed === true);
        response.end(JSON.stringify({ item })); return;
      }
    }
    if (path === '/api/tools' && request.method === 'GET') { response.end(JSON.stringify({ tools })); return; }
    if (path === '/api/tools/execute' && request.method === 'POST') {
      const input = await body(request);
      if (typeof input.name !== 'string' || !input.arguments || typeof input.arguments !== 'object') throw new ProviderError('invalid_input', 400);
      response.end(JSON.stringify(executeTool(input.name, input.arguments))); return;
    }
  if (request.method === 'POST' && ['/api/chat', '/api/voice'].includes(request.url || '')) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), settings.providerTimeoutMs);
    response.on('close', () => controller.abort());
    try {
      // Browser callers must be same-origin; JSON prevents simple cross-site POSTs.
      if (!request.headers['content-type']?.startsWith('application/json')) throw new ProviderError('json_required', 415);
      const input = await body(request);
      if (typeof input?.text !== 'string' || !input.text.trim() || input.text.length > 4000) throw new ProviderError('invalid_text', 400);
      if (request.url === '/api/chat') response.end(JSON.stringify(await chat(config, input.text, controller.signal)));
      else {
        const audio = await speak(config, input.text, controller.signal);
        response.setHeader('Content-Type', 'audio/mpeg');
        response.end(audio);
      }
    } catch (error) {
      if (!response.destroyed) {
        response.statusCode = controller.signal.aborted ? 504 : error instanceof ProviderError ? error.status : 502;
        response.end(JSON.stringify({ error: controller.signal.aborted ? 'request_cancelled_or_timed_out' : error instanceof ProviderError ? error.code : 'provider_request_failed' }));
      }
    } finally { clearTimeout(timeout); }
  } else if (request.method === 'GET' && request.url === '/api/capabilities') {
    response.end(JSON.stringify({ capabilities: { ...capabilities, memory: { available: store.memoryEnabled() }, persistence: { available: true }, streaming: { available: capabilities.text.available }, scheduling: { available: true, delivery: 'open_browser', persistent: true }, tools: { available: true, modelToolCalling: false }, markets: { available: true, type: 'daily_forex_reference' }, phone: { available: true, actions: ['open_url','dial_number','draft_sms'], foregroundOnly: true } } }));
  } else if (request.method === 'GET' && request.url === '/api/health') {
    response.end(JSON.stringify({ status: 'ok' }));
  } else {
    response.statusCode = 404;
    response.end(JSON.stringify({ error: 'not_found' }));
  }
  } catch (error) {
    if (!response.destroyed && !response.headersSent) { response.statusCode = error instanceof ProviderError ? error.status : 500; response.end(JSON.stringify({ error: error instanceof ProviderError ? error.code : 'internal_error' })); }
    else if (!response.destroyed) response.end();
  }
});
server.requestTimeout = 10_000;
server.headersTimeout = 10_000;
server.listen(port, host, () => console.info('Kane server is listening.'));
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
    for (const session of engine.active.keys()) engine.cancel(session);
    setTimeout(() => process.exit(0), 5000).unref();
  });
}
