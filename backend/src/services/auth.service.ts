import bcrypt from 'bcryptjs';
import { v4 as uuid } from 'uuid';
import { db } from '../db/database';
import { BadRequest, Conflict, Unauthorized } from '../utils/errors';
import { sha256 } from '../utils/crypto';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../middleware/auth';
import { env } from '../config/env';

const MAX_FAILED = 8;
const LOCK_MINUTES = 15;

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  failed_login_count: number;
  locked_until: number | null;
}

export async function registerUser(input: {
  email: string;
  password: string;
  name: string;
  ip?: string;
  userAgent?: string;
}) {
  const email = input.email.toLowerCase().trim();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email) as
    | { id: string }
    | undefined;
  if (existing) throw Conflict('An account with this email already exists');

  if (input.password.length < 10) {
    throw BadRequest('Password must be at least 10 characters');
  }
  if (!/[A-Z]/.test(input.password) || !/[a-z]/.test(input.password) || !/\d/.test(input.password)) {
    throw BadRequest('Password must include upper, lower case letters and a number');
  }

  const id = uuid();
  const now = Date.now();
  const hash = await bcrypt.hash(input.password, 12);
  db.prepare(
    `INSERT INTO users (id, email, password_hash, name, created_at, updated_at)
     VALUES (?,?,?,?,?,?)`
  ).run(id, email, hash, input.name.trim(), now, now);

  db.prepare(
    `INSERT INTO user_settings (user_id, monthly_income, currency, low_budget_threshold, bill_reminder_days, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?)`
  ).run(id, 0, 'USD', 0.2, 3, now, now);

  seedDefaultCategories(id);

  return issueTokens({ id, email }, input.ip, input.userAgent);
}

function seedDefaultCategories(userId: string): void {
  const now = Date.now();
  const defaults: Array<{ name: string; icon: string; color: string; kind: string }> = [
    { name: 'Housing', icon: 'home', color: '#6366f1', kind: 'expense' },
    { name: 'Groceries', icon: 'shopping-cart', color: '#10b981', kind: 'expense' },
    { name: 'Dining', icon: 'utensils', color: '#f59e0b', kind: 'expense' },
    { name: 'Transport', icon: 'car', color: '#0ea5e9', kind: 'expense' },
    { name: 'Utilities', icon: 'zap', color: '#8b5cf6', kind: 'expense' },
    { name: 'Subscriptions', icon: 'repeat', color: '#ec4899', kind: 'expense' },
    { name: 'Entertainment', icon: 'film', color: '#ef4444', kind: 'expense' },
    { name: 'Health', icon: 'heart', color: '#14b8a6', kind: 'expense' },
    { name: 'Savings', icon: 'piggy-bank', color: '#22c55e', kind: 'savings' },
    { name: 'Income', icon: 'briefcase', color: '#84cc16', kind: 'income' },
    { name: 'Other', icon: 'tag', color: '#64748b', kind: 'expense' },
  ];
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO categories (id, user_id, name, icon, color, kind, created_at)
     VALUES (?,?,?,?,?,?,?)`
  );
  for (const c of defaults) {
    stmt.run(uuid(), userId, c.name, c.icon, c.color, c.kind, now);
  }
}

export async function loginUser(input: {
  email: string;
  password: string;
  ip?: string;
  userAgent?: string;
}) {
  const email = input.email.toLowerCase().trim();
  const user = db
    .prepare(
      'SELECT id, email, password_hash, name, failed_login_count, locked_until FROM users WHERE email = ?'
    )
    .get(email) as UserRow | undefined;

  if (!user) {
    // Constant-time-ish: still hash a dummy
    await bcrypt.compare(input.password, '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalida');
    throw Unauthorized('Invalid email or password');
  }
  if (user.locked_until && user.locked_until > Date.now()) {
    throw Unauthorized('Account temporarily locked. Try again later.');
  }
  const ok = await bcrypt.compare(input.password, user.password_hash);
  if (!ok) {
    const next = user.failed_login_count + 1;
    const lock = next >= MAX_FAILED ? Date.now() + LOCK_MINUTES * 60 * 1000 : null;
    db.prepare('UPDATE users SET failed_login_count = ?, locked_until = ? WHERE id = ?').run(
      next,
      lock,
      user.id
    );
    throw Unauthorized('Invalid email or password');
  }
  db.prepare('UPDATE users SET failed_login_count = 0, locked_until = NULL WHERE id = ?').run(
    user.id
  );
  return issueTokens({ id: user.id, email: user.email }, input.ip, input.userAgent);
}

export function issueTokens(
  user: { id: string; email: string },
  ip?: string,
  userAgent?: string
) {
  const access = signAccessToken({ sub: user.id, email: user.email });
  const jti = uuid();
  const refresh = signRefreshToken({ sub: user.id, jti });
  const tokenHash = sha256(refresh);
  const expires = Date.now() + env.refreshTtlDays * 24 * 60 * 60 * 1000;
  db.prepare(
    `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, created_at, user_agent, ip)
     VALUES (?,?,?,?,?,?,?)`
  ).run(jti, user.id, tokenHash, expires, Date.now(), userAgent || null, ip || null);
  return { access, refresh, accessExpiresIn: env.accessTtlMin * 60 };
}

export function rotateRefresh(token: string, ip?: string, userAgent?: string) {
  let payload: { sub: string; jti: string };
  try {
    payload = verifyRefreshToken(token);
  } catch {
    throw Unauthorized('Invalid refresh token');
  }
  const row = db
    .prepare(
      'SELECT id, user_id, token_hash, expires_at, revoked_at FROM refresh_tokens WHERE id = ?'
    )
    .get(payload.jti) as
    | { id: string; user_id: string; token_hash: string; expires_at: number; revoked_at: number | null }
    | undefined;

  if (!row || row.revoked_at) throw Unauthorized('Refresh token revoked');
  if (row.expires_at < Date.now()) throw Unauthorized('Refresh token expired');
  if (row.token_hash !== sha256(token)) throw Unauthorized('Refresh token mismatch');

  // Revoke old, issue new (rotation)
  db.prepare('UPDATE refresh_tokens SET revoked_at = ? WHERE id = ?').run(Date.now(), row.id);
  const user = db
    .prepare('SELECT id, email FROM users WHERE id = ?')
    .get(row.user_id) as { id: string; email: string } | undefined;
  if (!user) throw Unauthorized('User not found');
  return issueTokens(user, ip, userAgent);
}

export function revokeRefresh(token: string): void {
  try {
    const payload = verifyRefreshToken(token);
    db.prepare('UPDATE refresh_tokens SET revoked_at = ? WHERE id = ?').run(
      Date.now(),
      payload.jti
    );
  } catch {
    /* ignore */
  }
}

export function revokeAllForUser(userId: string): void {
  db.prepare('UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').run(
    Date.now(),
    userId
  );
}

export function getUserById(id: string) {
  return db
    .prepare('SELECT id, email, name, created_at FROM users WHERE id = ?')
    .get(id) as { id: string; email: string; name: string; created_at: number } | undefined;
}
