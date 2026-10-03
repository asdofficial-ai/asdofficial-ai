import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { value } from './config.ts';
import { ProviderError } from './providers.ts';
export class Auth {
  passwordHash?: Buffer;
  salt = randomBytes(16);
  sessions = new Map<string, number>();
  secure: boolean;
  constructor(password: string, secure: boolean, required: boolean) {
    this.secure = secure;
    const configured = value(password);
    if (required && configured.length < 16) throw new Error('Public hosting requires APP_PASSWORD with at least 16 characters.');
    if (configured) this.passwordHash = scryptSync(configured, this.salt, 32);
  }
  authenticated(request: IncomingMessage) {
    if (!this.passwordHash) return true;
    const token = request.headers.cookie?.split(';').map(cookie => cookie.trim()).find(cookie => cookie.startsWith('kane_session='))?.slice(13);
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return false;
    const hash = createHash('sha256').update(token).digest('hex'); const expiry = this.sessions.get(hash);
    if (!expiry || expiry < Date.now()) { this.sessions.delete(hash); return false; } return true;
  }
  login(password: unknown, response: ServerResponse) {
    if (!this.passwordHash) return;
    if (typeof password !== 'string' || password.length > 256 || !timingSafeEqual(scryptSync(password, this.salt, 32), this.passwordHash)) throw new ProviderError('invalid_login', 401);
    for (const [hash, expiry] of this.sessions) if (expiry < Date.now()) this.sessions.delete(hash);
    if (this.sessions.size >= 50) throw new ProviderError('too_many_login_sessions', 429);
    const token = randomBytes(32).toString('hex');
    this.sessions.set(createHash('sha256').update(token).digest('hex'), Date.now() + 86400000);
    response.setHeader('Set-Cookie', `kane_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400${this.secure ? '; Secure' : ''}`);
  }
  logout(request: IncomingMessage, response: ServerResponse) {
    const token = request.headers.cookie?.split(';').map(cookie => cookie.trim()).find(cookie => cookie.startsWith('kane_session='))?.slice(13);
    if (token) this.sessions.delete(createHash('sha256').update(token).digest('hex'));
    response.setHeader('Set-Cookie', `kane_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${this.secure ? '; Secure' : ''}`);
  }
}
