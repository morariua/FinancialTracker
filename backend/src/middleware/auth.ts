/// <reference path="../types/express.d.ts" />
import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { Unauthorized } from '../utils/errors';

export interface AuthedRequest extends Request {
  userId: string;
  userEmail: string;
}

export function userId(req: Request): string {
  if (!req.userId) throw Unauthorized();
  return req.userId;
}

export interface AccessTokenPayload {
  sub: string;
  email: string;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.jwtSecret, {
    expiresIn: `${env.accessTtlMin}m`,
    issuer: 'finance-tracker',
    audience: 'finance-tracker-app',
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, env.jwtSecret, {
    issuer: 'finance-tracker',
    audience: 'finance-tracker-app',
  }) as AccessTokenPayload;
  return decoded;
}

export function signRefreshToken(payload: { sub: string; jti: string }): string {
  return jwt.sign(payload, env.jwtRefreshSecret, {
    expiresIn: `${env.refreshTtlDays}d`,
    issuer: 'finance-tracker',
    audience: 'finance-tracker-refresh',
  });
}

export function verifyRefreshToken(token: string): { sub: string; jti: string } {
  const decoded = jwt.verify(token, env.jwtRefreshSecret, {
    issuer: 'finance-tracker',
    audience: 'finance-tracker-refresh',
  }) as { sub: string; jti: string };
  return decoded;
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return next(Unauthorized('Missing access token'));
  }
  const token = header.slice('Bearer '.length).trim();
  try {
    const payload = verifyAccessToken(token);
    req.userId = payload.sub;
    req.userEmail = payload.email;
    next();
  } catch {
    next(Unauthorized('Invalid or expired access token'));
  }
}
