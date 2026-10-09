import { randomBytes, createHash, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const derive = promisify(scrypt);
const PARAMETERS = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
export const COOKIE_NAME = '__Host-teachersign_dev_session';
const digest = value => createHash('sha256').update(value).digest('hex');

// Password derivation is shared by the local demo and the school gateway.
// Plaintext passwords are never persisted by this helper.
export async function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const key = await derive(password, salt, 64, PARAMETERS);
  return `scrypt$32768$8$3$${salt}$${key.toString('hex')}`;
}

export async function verifyPassword(password, stored) {
  const [algorithm, n, r, p, salt, expected, extra] = stored.split('$');
  if (extra || algorithm !== 'scrypt' || n !== '32768' || r !== '8' || p !== '3' || !/^[a-f0-9]{32}$/.test(salt || '') || !/^[a-f0-9]{128}$/.test(expected || '')) return false;
  const key = await derive(password, salt, 64, PARAMETERS);
  return timingSafeEqual(key, Buffer.from(expected, 'hex'));
}

export class Authentication {
  constructor({ username, passwordHash, now = Date.now, idleMs = 30 * 60_000, lifetimeMs = 8 * 60 * 60_000, maxAttempts = 5, attemptWindowMs = 15 * 60_000 }) {
    if (!username || !passwordHash) throw new Error('Administrator credentials are not configured');
    Object.assign(this, { username, passwordHash, now, idleMs, lifetimeMs, maxAttempts, attemptWindowMs });
    this.sessions = new Map();
    this.attempts = new Map();
    this.credentialVersion = 0;
  }

  async login(username, password, address) {
    this.prune();
    const time = this.now();
    // Reserve an attempt before awaiting password hashing, including concurrent requests.
    const addressKey = `address:${address}`;
    const accountKey = `account:${this.username}`;
    const buckets = [addressKey, accountKey].map(key => {
      let bucket = this.attempts.get(key);
      if (!bucket || bucket.until <= time) {
        bucket = { count: 0, until: time + this.attemptWindowMs };
        this.attempts.set(key, bucket);
      }
      return bucket;
    });
    if (buckets.some(bucket => bucket.count >= this.maxAttempts)) return { limited: true };
    buckets.forEach(bucket => bucket.count++);
    const version = this.credentialVersion;
    const validPassword = await verifyPassword(password, this.passwordHash);
    if (version !== this.credentialVersion || username !== this.username || !validPassword) return { denied: true };
    [addressKey, accountKey].forEach(key => this.attempts.delete(key));
    const token = randomBytes(32).toString('base64url');
    const session = { username, csrf: randomBytes(32).toString('base64url'), createdAt: time, lastSeenAt: time, expiresAt: time + this.lifetimeMs };
    this.prune();
    // Limit memory growth even under repeated valid demo logins.
    if (this.sessions.size >= 100) this.sessions.delete(this.sessions.keys().next().value);
    this.sessions.set(digest(token), session);
    return { token, session };
  }

  tokenFromCookie(cookie = '') {
    return cookie.split(';').map(value => value.trim()).find(value => value.startsWith(`${COOKIE_NAME}=`))?.slice(COOKIE_NAME.length + 1);
  }

  get(cookie, touch = true) {
    const token = this.tokenFromCookie(cookie);
    if (!token) return null;
    const key = digest(token);
    const session = this.sessions.get(key);
    if (!session) return null;
    if (session.expiresAt <= this.now() || session.lastSeenAt + this.idleMs <= this.now()) {
      this.sessions.delete(key);
      return null;
    }
    if (touch) session.lastSeenAt = this.now();
    return session;
  }

  logout(cookie) {
    const token = this.tokenFromCookie(cookie);
    if (token) this.sessions.delete(digest(token));
  }

  replaceCredentials(username, passwordHash) {
    this.username = username;
    this.passwordHash = passwordHash;
    this.credentialVersion++;
    this.sessions.clear();
    this.attempts.clear();
  }

  prune() {
    for (const [key, session] of this.sessions) if (session.expiresAt <= this.now() || session.lastSeenAt + this.idleMs <= this.now()) this.sessions.delete(key);
    for (const [key, bucket] of this.attempts) if (bucket.until <= this.now()) this.attempts.delete(key);
  }

  cookie(token = '') {
    return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${token ? Math.floor(this.lifetimeMs / 1000) : 0}`;
  }
}
