import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { ProviderError } from './providers.ts';

export class Store {
  db: DatabaseSync;
  constructor(path?: string) {
    if (!path && process.env.DATABASE_PATH) { path = process.env.DATABASE_PATH; mkdirSync(dirname(path), { recursive: true }); }
    if (!path) {
      const directory = fileURLToPath(new URL('../data/', import.meta.url));
      mkdirSync(directory, { recursive: true });
      path = directory + 'kane.sqlite';
    }
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
      BEGIN;
      CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS messages(id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE, role TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS turns(id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE, request_id TEXT NOT NULL, input TEXT NOT NULL, status TEXT NOT NULL, UNIQUE(session_id,request_id));
      CREATE TABLE IF NOT EXISTS items(id TEXT PRIMARY KEY, kind TEXT NOT NULL, content TEXT NOT NULL, source TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
      PRAGMA user_version=1;
      COMMIT;`);
    this.db.prepare("UPDATE turns SET status='interrupted' WHERE status='running'").run();
  }
  session() {
    const session = { id: randomUUID(), created_at: new Date().toISOString() };
    this.db.prepare('INSERT INTO sessions VALUES (?,?)').run(session.id, session.created_at);
    return session;
  }
  requireSession(id: string) {
    if (!this.db.prepare('SELECT id FROM sessions WHERE id=?').get(id)) throw new ProviderError('session_not_found', 404);
  }
  history(id: string) {
    this.requireSession(id);
    return this.db.prepare('SELECT * FROM messages WHERE session_id=? ORDER BY rowid').all(id);
  }
  addMessage(session: string, role: string, content: string) {
    const id = randomUUID();
    this.db.prepare('INSERT INTO messages VALUES (?,?,?,?,?)').run(id, session, role, content, new Date().toISOString());
    return id;
  }
  memoryEnabled() { return this.db.prepare("SELECT value FROM settings WHERE key='memory'").get()?.value !== 'disabled'; }
  setMemory(enabled: boolean) { this.db.prepare("INSERT OR REPLACE INTO settings VALUES ('memory',?)").run(enabled ? 'enabled' : 'disabled'); }
  list(kind: string) { return this.db.prepare('SELECT * FROM items WHERE kind=? ORDER BY rowid DESC LIMIT 200').all(kind); }
  save(kind: string, content: string, source: string, id?: string, completed = false) {
    if (kind === 'memories' && !this.memoryEnabled()) throw new ProviderError('memory_disabled', 409);
    if (kind === 'memories' && /(?:api.?key|password|secret|credit.?card|payment|sk-[\w-]+|gsk_[\w-]+)/i.test(content)) throw new ProviderError('sensitive_memory_rejected', 400);
    const now = new Date().toISOString();
    if (id) {
      const result = this.db.prepare('UPDATE items SET content=?,source=?,completed=?,updated_at=? WHERE id=? AND kind=?').run(content, source, completed ? 1 : 0, now, id, kind);
      if (!result.changes) throw new ProviderError('item_not_found', 404);
    } else {
      id = randomUUID();
      this.db.prepare('INSERT INTO items VALUES (?,?,?,?,?,?,?)').run(id, kind, content, source, completed ? 1 : 0, now, now);
    }
    return this.db.prepare('SELECT * FROM items WHERE id=?').get(id);
  }
  deleteItem(kind: string, id?: string) {
    if (id) this.db.prepare('DELETE FROM items WHERE kind=? AND id=?').run(kind, id);
    else this.db.prepare('DELETE FROM items WHERE kind=?').run(kind);
  }
  relevantMemory(text: string) {
    if (!this.memoryEnabled()) return [];
    const words = text.toLowerCase().split(/\W+/).filter(word => word.length > 3);
    return this.list('memories').filter(item => words.some(word => String(item.content).toLowerCase().includes(word))).slice(0, 5).map(item => String(item.content).slice(0, 400));
  }
}
