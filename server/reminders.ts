import { randomUUID } from 'node:crypto';
import { Store } from './store.ts';
import { ProviderError } from './providers.ts';
export class Reminders {
  store: Store;
  constructor(store: Store) { this.store = store; store.db.exec(`CREATE TABLE IF NOT EXISTS reminders(id TEXT PRIMARY KEY, title TEXT NOT NULL, due_at TEXT NOT NULL, repeat_hours INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL);`); }
  list() { return this.store.db.prepare("SELECT * FROM reminders WHERE status='pending' ORDER BY due_at LIMIT 200").all(); }
  create(title: unknown, due: unknown, repeat: unknown = 0, now = Date.now()) {
    if (typeof title !== 'string' || !title.trim() || title.length > 500 || typeof due !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(due) || typeof repeat !== 'number' || ![0,24,168].includes(repeat)) throw new ProviderError('invalid_reminder', 400);
    const [year, month, day] = due.slice(0,10).split('-').map(Number);
    if (month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate()) throw new ProviderError('invalid_reminder', 400);
    const timestamp = Date.parse(due);
    if (!Number.isFinite(timestamp) || timestamp <= now || timestamp > now + 5 * 366 * 86400000) throw new ProviderError('reminder_time_must_be_future', 400);
    if (this.list().length >= 200) throw new ProviderError('reminder_limit', 409);
    const id = randomUUID(); this.store.db.prepare('INSERT INTO reminders VALUES (?,?,?,?,?,?)').run(id, title.trim(), new Date(timestamp).toISOString(), Number(repeat), 'pending', new Date(now).toISOString()); return this.get(id);
  }
  get(id: string) { const row = this.store.db.prepare("SELECT * FROM reminders WHERE id=? AND status='pending'").get(id); if (!row) throw new ProviderError('reminder_not_found', 404); return row; }
  act(id: string, action: unknown, now = Date.now()) {
    const row = this.get(id);
    if (action === 'snooze') this.store.db.prepare('UPDATE reminders SET due_at=? WHERE id=?').run(new Date(now + 600000).toISOString(), id);
    else if (action === 'dismiss') { const hours = Number(row.repeat_hours); if (hours) { const interval = hours * 3600000, previous = Date.parse(String(row.due_at)); const next = previous + Math.max(1, Math.floor((now - previous) / interval) + 1) * interval; this.store.db.prepare('UPDATE reminders SET due_at=? WHERE id=?').run(new Date(next).toISOString(), id); } else this.store.db.prepare("UPDATE reminders SET status='dismissed' WHERE id=?").run(id); }
    else throw new ProviderError('invalid_reminder_action', 400);
  }
  delete(id: string) { this.get(id); this.store.db.prepare('DELETE FROM reminders WHERE id=?').run(id); }
}
