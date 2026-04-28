import dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

const isProd = process.env.NODE_ENV === 'production';

const devSecret = () => crypto.randomBytes(48).toString('hex');

export const env = {
  port: parseInt(process.env.PORT || '4000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd,
  jwtSecret: isProd ? required('JWT_SECRET') : (process.env.JWT_SECRET || devSecret()),
  jwtRefreshSecret: isProd
    ? required('JWT_REFRESH_SECRET')
    : (process.env.JWT_REFRESH_SECRET || devSecret()),
  accessTtlMin: parseInt(process.env.ACCESS_TOKEN_TTL_MIN || '15', 10),
  refreshTtlDays: parseInt(process.env.REFRESH_TOKEN_TTL_DAYS || '30', 10),
  dbPath: process.env.DB_PATH || './data/finance.db',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  cookieSecure: (process.env.COOKIE_SECURE || (isProd ? 'true' : 'false')) === 'true',
  cookieDomain: process.env.COOKIE_DOMAIN || 'localhost',
  plaid: {
    clientId: process.env.PLAID_CLIENT_ID || '',
    secret: process.env.PLAID_SECRET || '',
    env: process.env.PLAID_ENV || 'sandbox',
  },
  alertCron: process.env.ALERT_CHECK_CRON || '*/15 * * * *',
};

if (env.jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters');
}
