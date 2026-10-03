import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../server/store.ts';
import { Reminders } from '../server/reminders.ts';
const now = Date.parse('2026-10-03T12:00:00.000Z');
test('reminders validate dates, repetition and user content', () => {
  const store = new Store(':memory:'), reminders = new Reminders(store);
  try {
    for (const due of ['bad', '2026-10-02T12:00:00.000Z', '2027-02-30T12:00:00.000Z', '2026-10-04T12:00']) assert.throws(() => reminders.create('Test', due, 0, now));
    assert.throws(() => reminders.create('', '2026-10-04T12:00:00.000Z', 0, now));
    assert.throws(() => reminders.create('Test', '2026-10-04T12:00:00.000Z', 12, now));
    const row = reminders.create(' Test ', '2026-10-04T12:00:00.000Z', 0, now); assert.equal(row.title, 'Test');
  } finally { store.db.close(); }
});
test('snooze, dismissal and overdue repetition do not replay missed occurrences', () => {
  const store = new Store(':memory:'), reminders = new Reminders(store);
  try {
    const once = reminders.create('Once', new Date(now + 60000).toISOString(), 0, now);
    reminders.act(once.id, 'snooze', now); assert.equal(reminders.get(once.id).due_at, new Date(now + 600000).toISOString());
    reminders.act(once.id, 'dismiss', now); assert.throws(() => reminders.get(once.id), /reminder_not_found/);
    const repeat = reminders.create('Repeat', new Date(now + 60000).toISOString(), 24, now); const later = now + 5 * 86400000;
    reminders.act(repeat.id, 'dismiss', later); const due = Date.parse(reminders.get(repeat.id).due_at); assert.ok(due > later && due <= later + 86400000);
    assert.throws(() => reminders.act(repeat.id, 'unknown', now), /invalid_reminder_action/);
    reminders.delete(repeat.id); assert.equal(reminders.list().length, 0);
  } finally { store.db.close(); }
});
test('overdue reminders survive a database restart', () => {
  const directory = mkdtempSync(join(tmpdir(), 'kane-reminders-')); const path = join(directory, 'test.sqlite'); let store;
  try {
    store = new Store(path); const reminder = new Reminders(store).create('Persist', new Date(now + 60000).toISOString(), 0, now); store.db.close();
    store = new Store(path); assert.equal(new Reminders(store).get(reminder.id).title, 'Persist');
  } finally { store?.db.close(); rmSync(directory, { recursive: true, force: true }); }
});
