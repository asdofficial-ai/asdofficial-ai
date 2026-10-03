import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { Store } from './store.ts';
import { ProviderError } from './providers.ts';
import { safeLink } from './research.ts';
export class Phone {
  store: Store;
  codes = new Map<string, number>();
  constructor(store: Store) {
    this.store = store;
    store.db.exec(`CREATE TABLE IF NOT EXISTS devices(id TEXT PRIMARY KEY, name TEXT NOT NULL, last_seen TEXT, revoked INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS phone_actions(id TEXT PRIMARY KEY, device_id TEXT NOT NULL REFERENCES devices(id), kind TEXT NOT NULL, argument TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL);`);
  }
  code() {
    for (const [code, expiry] of this.codes) if (expiry < Date.now()) this.codes.delete(code);
    if (this.codes.size > 20) throw new ProviderError('pairing_rate_limit', 429);
    const code = randomBytes(4).toString('hex').toUpperCase();
    this.codes.set(createHash('sha256').update(code).digest('hex'), Date.now() + 300000);
    return { code, expiresInSeconds: 300 };
  }
  pair(code: unknown, name: unknown) {
    if (typeof code !== 'string' || typeof name !== 'string' || !name.trim() || name.length > 80) throw new ProviderError('invalid_pairing', 400);
    const hash = createHash('sha256').update(code.toUpperCase()).digest('hex');
    if ((this.codes.get(hash) || 0) < Date.now()) throw new ProviderError('invalid_or_expired_pairing_code', 400);
    this.codes.delete(hash);
    const id = randomUUID(); this.store.db.prepare('INSERT INTO devices VALUES (?,?,?,0)').run(id, name, new Date().toISOString()); return { id, name };
  }
  device(id: string) {
    if (!this.store.db.prepare('SELECT id FROM devices WHERE id=? AND revoked=0').get(id)) throw new ProviderError('device_not_paired', 403);
  }
  list() { return this.store.db.prepare('SELECT * FROM devices ORDER BY rowid DESC').all(); }
  revoke(id: string) { this.store.db.prepare('UPDATE devices SET revoked=1 WHERE id=?').run(id); this.store.db.prepare("UPDATE phone_actions SET status='revoked' WHERE device_id=? AND status IN ('pending','approved')").run(id); }
  propose(id: string, kind: unknown, argument: unknown) {
    this.device(id);
    let canonical: string;
    if (kind === 'open_url') {
      if (!safeLink(argument) || String(argument).length > 2000) throw new ProviderError('unsupported_phone_action', 400);
      const url = new URL(String(argument));
      if (/^(localhost|127\.|0\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[)/.test(url.hostname)) throw new ProviderError('unsupported_phone_url', 400);
      canonical = url.href;
    } else if (kind === 'dial_number' && typeof argument === 'string' && /^\+?[0-9]{5,15}$/.test(argument)) canonical = argument;
    else if (kind === 'draft_sms' && argument && typeof argument === 'object' && 'number' in argument && 'text' in argument && typeof argument.number === 'string' && /^\+?[0-9]{5,15}$/.test(argument.number) && typeof argument.text === 'string' && argument.text.length > 0 && argument.text.length <= 1000) canonical = JSON.stringify({ number: argument.number, text: argument.text });
    else throw new ProviderError('unsupported_phone_action', 400);
    const action = { id: randomUUID(), deviceId: id, kind: String(kind), argument: canonical, status: 'pending' };
    this.store.db.prepare('INSERT INTO phone_actions VALUES (?,?,?,?,?,?)').run(action.id, id, action.kind, canonical, 'pending', new Date().toISOString()); return action;
  }
  approve(id: string) {
    const row = this.store.db.prepare("SELECT * FROM phone_actions WHERE id=? AND status='pending'").get(id);
    if (!row) throw new ProviderError('action_not_pending', 409);
    this.device(String(row.device_id));
    if (Date.now() - Date.parse(String(row.created_at)) > 300000) throw new ProviderError('approval_expired', 409);
    this.store.db.prepare("UPDATE phone_actions SET status='approved' WHERE id=? AND status='pending'").run(id); return row;
  }
  poll(id: string) {
    this.device(id); this.store.db.prepare('UPDATE devices SET last_seen=? WHERE id=?').run(new Date().toISOString(), id);
    this.store.db.prepare("UPDATE phone_actions SET status='expired' WHERE device_id=? AND status='approved' AND created_at < ?").run(id, new Date(Date.now() - 300000).toISOString());
    return this.store.db.prepare("SELECT * FROM phone_actions WHERE device_id=? AND status='approved' ORDER BY rowid LIMIT 10").all(id);
  }
  acknowledge(device: string, id: string) {
    this.device(device);
    const result = this.store.db.prepare("UPDATE phone_actions SET status='acknowledged' WHERE id=? AND device_id=? AND status='approved'").run(id, device);
    if (!result.changes) throw new ProviderError('action_not_approved', 409);
  }
}
