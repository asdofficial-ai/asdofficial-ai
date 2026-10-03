import { startOrb } from './orb.js';
import { VoiceCapture } from './voice.js';
const $ = id => document.getElementById(id);
let session, controller, busy = false, generation = 0, capabilities, marketData, devices = [], kind = 'notes', editing, deferredInstall;
const capture = new VoiceCapture(), cpuSamples = [];
const playback = $('playback');
function state(value) { document.body.dataset.state = value; $('state-label').textContent = value.toUpperCase(); $('status').textContent = value; $('mic').classList.toggle('recording', value === 'listening'); }
function notify(error) { state(error.message || String(error)); }
async function api(path, method = 'GET', body) {
  const response = await fetch(path, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json();
  if (response.status === 401) { if (!$('login').open) $('login').showModal(); throw new Error('Sign in to continue.'); }
  if (!response.ok) throw new Error(data.error); return data;
}
function element(tag, text, className) { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; }
function button(label, action, className = 'quiet') { const node = element('button', label, className); node.onclick = () => Promise.resolve(action()).catch(notify); return node; }
function empty(target, text) { $(target).replaceChildren(element('p', text, 'empty')); }
function stop() {
  generation++; controller?.abort(); capture.cancel(); playback.pause();
  if (playback.src) { URL.revokeObjectURL(playback.src); playback.removeAttribute('src'); } playback.hidden = true;
  if (session) api(`/api/sessions/${session}/cancel`, 'POST').catch(() => {});
  busy = false; $('send').disabled = false; state('idle');
}
async function create() { stop(); session = (await api('/api/sessions', 'POST')).session.id; localStorage.setItem('kane-session', session); $('session-label').textContent = 'Session ' + session.slice(0, 6); $('history').replaceChildren(); state('idle'); }
function message(role, content) {
  const node = element('div', undefined, 'message ' + role), label = element('span', role === 'user' ? 'You' : 'Kane', 'role'), text = element('span', content);
  node.append(label, text); $('history').append(node); $('history').scrollTop = $('history').scrollHeight; return text;
}
async function restore() {
  const stored = localStorage.getItem('kane-session');
  if (!stored) return create();
  try { const data = await api(`/api/sessions/${stored}`); session = stored; $('session-label').textContent = 'Session ' + session.slice(0, 6); $('history').replaceChildren(); data.messages.forEach(row => message(row.role, row.content)); state('idle'); }
  catch (error) { if (!$('login').open) await create(); else throw error; }
}
async function speak(answer, current) {
  state('speaking');
  const response = await fetch('/api/voice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: answer.slice(0, 4000) }), signal: controller.signal });
  if (!response.ok) throw new Error((await response.json()).error);
  const audio = await response.blob(); if (current !== generation) return;
  playback.src = URL.createObjectURL(audio); playback.hidden = false;
  playback.onended = () => { if (current === generation) state('idle'); };
  playback.onerror = () => state('Audio playback failed.');
  try { await playback.play(); } catch { state('Voice is ready. Press Play to hear it.'); }
}
$('form').onsubmit = async event => {
  event.preventDefault(); if (busy || !session) return;
  capture.cancel(); playback.pause();
  const text = $('text').value.trim(); if (!text) return;
  busy = true; $('send').disabled = true; const current = ++generation; controller = new AbortController();
  message('user', text); const output = message('assistant', ''); $('text').value = ''; let answer = ''…2524 tokens truncated…tervalCoverage === null ? 'Unavailable' : (f.backtest.empiricalIntervalCoverage * 100).toFixed(1) + '%']];
  rows.forEach(([name, value]) => { const row = element('tr'); row.append(element('td', name), element('td', String(value))); table.append(row); });
  const source = element('a', 'Data source: ECB via Frankfurter'); source.href = marketData.sourceUrl; source.target = '_blank'; source.rel = 'noopener noreferrer';
  detail(marketData.pair + ' · Forex Research', [chart, source, table, element('p', f.approximateInterval, 'fine'), element('p', f.warning, 'fine')]); lineChart(chart, marketData.points.map(point => point.value));
}
$('pair').onchange = loadMarket; $('market-refresh').onclick = loadMarket; $('forecast-open').onclick = showForecast; $('quick-market').onclick = showForecast;
$('search-form').onsubmit = async event => { event.preventDefault(); empty('search-results', 'Researching live sources…'); try { const result = await api('/api/search', 'POST', { query: $('search-query').value }); $('search-results').replaceChildren(element('p', result.answer)); result.sources.forEach(source => { const link = element('a', new URL(source.url).hostname + ' ↗'); link.href = source.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; $('search-results').append(link); }); if (!result.sourceMetadataAvailable) $('search-results').append(element('p', 'Source metadata was not supplied by the provider. Verify any cited links independently.', 'fine')); } catch (error) { empty('search-results', error.message); } };
async function phoneDevices() {
  devices = (await api('/api/phone/devices')).devices; $('devices').replaceChildren();
  const active = devices.filter(device => !device.revoked); if (!active.length) $('devices').textContent = 'No phone paired';
  active.forEach(device => { const row = element('div', undefined, 'device'); const online = Date.now() - Date.parse(device.last_seen) < 20000; row.append(element('span', device.name + (online ? ' · connected' : ' · offline')), button('Revoke', async () => { if (confirm('Revoke access for ' + device.name + '?')) { await api('/api/phone/devices/' + device.id, 'DELETE'); await phoneDevices(); } })); $('devices').append(row); });
}
$('pair-phone').onclick = async () => { try { const result = await api('/api/phone/pairing', 'POST'); $('pair-code').textContent = result.code; state('Open the companion on your Android and enter this code within 5 minutes.'); } catch (error) { notify(error); } };
$('phone-action').onclick = async () => {
  const device = devices.find(device => !device.revoked);
  if (!device) return notify(new Error('Pair your Android first.'));
  const choice = prompt('Choose an action: link, dial, or sms', 'link');
  if (!choice) return;
  let kind, argument;
  if (choice.toLowerCase() === 'link') { kind = 'open_url'; argument = prompt('HTTPS link to open on ' + device.name + ':'); }
  else if (choice.toLowerCase() === 'dial') { kind = 'dial_number'; argument = prompt('Phone number including country code:'); }
  else if (choice.toLowerCase() === 'sms') { kind = 'draft_sms'; const number = prompt('Phone number including country code:'); if (!number) return; const text = prompt('SMS draft text:'); if (!text) return; argument = { number, text }; }
  else return notify(new Error('Choose link, dial, or sms.'));
  if (!argument) return;
  try {
    const result = await api(`/api/phone/devices/${device.id}/actions`, 'POST', { kind, argument });
    if (confirm(`Approve this exact action?\nDevice: ${device.name}\nAction: ${kind}\nDetails: ${result.action.argument}\nYour phone will also require a tap. Calls and messages require you to complete them on the phone.`)) {
      await api(`/api/phone/actions/${result.action.id}/approve`, 'POST'); state('Approved. Tap the action in your phone companion.');
    }
  } catch (error) { notify(error); }
};
async function connections() {
  capabilities = (await api('/api/capabilities')).capabilities;
  const entries = [['Text reasoning','text'],['Voice generation','voiceGeneration'],['Speech recognition','speechRecognition'],['Web search','search'],['Durable memory','memory'],['Forex research','markets'],['Android pairing','phone'],['Wake word','wakeWord'],['Reminders','scheduling']];
  $('diagnostics').replaceChildren(); $('connections').replaceChildren();
  entries.forEach(([label, key]) => { const available = capabilities[key]?.available; const row = element('div', undefined, 'diag'); row.append(element('span', label), element('strong', available ? 'Configured' : 'Unavailable', available ? '' : 'off')); $('diagnostics').append(row); const connected = element('div'); connected.append(element('span', label), element('strong', available ? 'Ready' : 'Disabled', available ? 'good' : '')); $('connections').append(connected); });
  $('diagnostic-summary').textContent = 'Configuration status · not a continuous health probe'; $('core-memory').textContent = capabilities.memory.available ? 'Memory enabled' : 'Memory disabled'; $('voice').disabled = !capabilities.voiceGeneration.available; $('mic').disabled = !capabilities.speechRecognition.available || !navigator.mediaDevices?.getUserMedia; $('research-mode').disabled = !capabilities.search.available;
}
async function refresh() { await Promise.all([telemetry(), workspace(), tasks(), phoneDevices()]); }
function systems() {
  const content = [element('p', 'Private assistant · keys stay on the backend. Android companion needs to stay open; no background device access.'), button(capabilities?.memory.available ? 'Disable durable memory' : 'Enable durable memory', async () => { await api('/api/memory/settings', 'PATCH', { enabled: !capabilities.memory.available }); await connections(); $('detail').close(); }), button('Delete all durable memories', async () => { if (confirm('Permanently delete all saved memories?')) { await api('/api/memories', 'DELETE'); await refresh(); $('detail').close(); } }), button('Calculator', async () => { const expression = prompt('Arithmetic expression'); if (!expression) return; const result = await api('/api/tools/execute', 'POST', { name: 'calculator', arguments: { expression } }); state('Result: ' + result.result); }), button('Sign out', async () => { stop(); await api('/api/auth/logout', 'POST'); location.reload(); })]; detail('System Controls', content);
}
$('settings').onclick = systems; $('refresh').onclick = () => Promise.all([connections(), refresh()]).catch(notify);
document.querySelectorAll('[data-tab]').forEach(node => node.onclick = () => { document.querySelectorAll('[data-tab]').forEach(button => button.classList.toggle('active', button === node)); if (node.dataset.tab === 'markets') showForecast(); if (node.dataset.tab === 'systems') systems(); if (node.dataset.tab === 'workspace') $('items').scrollIntoView({ behavior: 'smooth', block: 'center' }); if (node.dataset.tab === 'research') { $('search-query').focus(); $('search-query').scrollIntoView({ behavior: 'smooth', block: 'center' }); } });
$('manage-memory').onclick = () => { kind = 'memories'; workspace().catch(notify); }; $('task-workspace').onclick = () => { kind = 'tasks'; workspace().catch(notify); };
document.querySelectorAll('[data-prompt]').forEach(node => node.onclick = () => { $('text').value = node.dataset.prompt; $('research-mode').checked = node.dataset.research === 'true' && capabilities?.search.available; $('text').focus(); });
$('login-form').onsubmit = async event => { event.preventDefault(); try { await api('/api/auth/login', 'POST', { password: $('password').value }); $('password').value = ''; $('login').close(); await initialize(); } catch (error) { $('login-error').textContent = error.message; } };
$('login').addEventListener('cancel', event => event.preventDefault());
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); deferredInstall = event; $('install').hidden = false; }); $('install').onclick = async () => { await deferredInstall?.prompt(); deferredInstall = undefined; $('install').hidden = true; };
async function initialize() { try { await connections(); await restore(); await refresh(); await loadMarket(); } catch (error) { notify(error); } }
setInterval(() => { $('clock').textContent = new Date().toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }, 1000);
setInterval(() => { if (!document.hidden) Promise.all([telemetry(), phoneDevices()]).catch(() => { $('online').textContent = 'Offline'; }); }, 10000);
window.addEventListener('pagehide', () => { capture.cancel(); controller?.abort(); playback.pause(); });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
startOrb(); initialize();
