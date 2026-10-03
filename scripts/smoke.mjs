// Live verification. Only fixed labels and HTTP status codes are printed.
const base = 'http://127.0.0.1:3001';
async function request(path, method = 'GET', body) {
  return fetch(base + path, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(35000) });
}
const health = await request('/api/health'); console.log('health', health.status);
const page = await request('/'); console.log('development-page', page.status);
const created = await request('/api/sessions', 'POST'); const { session } = await created.json();
const conversation = await request(`/api/sessions/${session.id}/messages`, 'POST', { text: 'Reply with one short greeting.', requestId: 'live-smoke' });
const events = await conversation.text();
console.log('live-text', conversation.status, events.includes('event: response.completed') ? 'completed' : 'failed');
const voice = await request('/api/voice', 'POST', { text: 'Hello. I am Kane.' });
const bytes = await voice.arrayBuffer(); console.log('live-voice', voice.status, voice.ok && bytes.byteLength > 0 ? 'audio-received' : 'failed');
const note = await request('/api/notes', 'POST', { content: 'Smoke-test note' }); const item = (await note.json()).item;
console.log('note-create', note.status);
console.log('note-delete', (await request(`/api/notes/${item.id}`, 'DELETE')).status);
console.log('session-delete', (await request(`/api/sessions/${session.id}`, 'DELETE')).status);
