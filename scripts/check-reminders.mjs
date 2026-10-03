import assert from 'node:assert/strict';
const base = 'http://127.0.0.1:3001';
async function api(path, method = 'GET', body) {
  const response = await fetch(base + path, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(10000) });
  const result = await response.json(); assert.ok(response.ok, 'HTTP check failed'); return result;
}
let id;
try {
  for (const path of ['/assistant-extras.js', '/wake.js']) { const response = await fetch(base + path); assert.equal(response.status, 200); assert.match(response.headers.get('content-type'), /javascript/); }
  assert.equal((await api('/api/capabilities')).capabilities.scheduling.available, true);
  const created = await api('/api/reminders', 'POST', { title: 'Integration test reminder', dueAt: new Date(Date.now() + 60000).toISOString(), repeatHours: 0 }); id = created.reminder.id;
  assert.ok((await api('/api/reminders')).reminders.some(row => row.id === id));
  await api('/api/reminders/' + id, 'PATCH', { action: 'snooze' });
  const row = (await api('/api/reminders')).reminders.find(row => row.id === id); assert.ok(Date.parse(row.due_at) > Date.now() + 590000);
  await api('/api/reminders/' + id, 'DELETE'); id = undefined;
  console.log('Reminder routes, assets, snooze and deletion: passed');
} catch { console.error('Reminder integration check: failed'); process.exitCode = 1; }
finally { if (id) { try { await api('/api/reminders/' + id, 'DELETE'); } catch { console.error('Test reminder cleanup required'); process.exitCode = 1; } } }
