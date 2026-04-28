import { Router } from 'express';
import { z } from 'zod';
import { authLimiter } from '../middleware/rateLimit';
import {
  getUserById,
  loginUser,
  registerUser,
  revokeAllForUser,
  revokeRefresh,
  rotateRefresh,
} from '../services/auth.service';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import { db } from '../db/database';
import { v4 as uuid } from 'uuid';

const router = Router();

const registerSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(10).max(200),
  name: z.string().min(1).max(80),
});

const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(200),
});

router.post('/register', authLimiter, async (req, res, next) => {
  try {
    const body = registerSchema.parse(req.body);
    const tokens = await registerUser({
      ...body,
      ip: req.ip,
      userAgent: req.get('user-agent') || undefined,
    });
    db.prepare(
      `INSERT INTO audit_log (id, user_id, action, ip, user_agent, created_at) VALUES (?,?,?,?,?,?)`
    ).run(uuid(), null, 'register', req.ip || null, req.get('user-agent') || null, Date.now());
    res.json(tokens);
  } catch (e) {
    next(e);
  }
});

router.post('/login', authLimiter, async (req, res, next) => {
  try {
    const body = loginSchema.parse(req.body);
    const tokens = await loginUser({
      ...body,
      ip: req.ip,
      userAgent: req.get('user-agent') || undefined,
    });
    db.prepare(
      `INSERT INTO audit_log (id, user_id, action, ip, user_agent, created_at) VALUES (?,?,?,?,?,?)`
    ).run(uuid(), null, 'login', req.ip || null, req.get('user-agent') || null, Date.now());
    res.json(tokens);
  } catch (e) {
    next(e);
  }
});

router.post('/refresh', async (req, res, next) => {
  try {
    const token = (req.body && req.body.refresh) || req.cookies?.refresh;
    if (!token) {
      res.status(400).json({ error: { code: 'bad_request', message: 'Missing refresh token' } });
      return;
    }
    const tokens = rotateRefresh(token, req.ip, req.get('user-agent') || undefined);
    res.json(tokens);
  } catch (e) {
    next(e);
  }
});

router.post('/logout', async (req, res, next) => {
  try {
    const token = (req.body && req.body.refresh) || req.cookies?.refresh;
    if (token) revokeRefresh(token);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.post('/logout-all', requireAuth, async (req, res, next) => {
  try {
    revokeAllForUser(req.userId!);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.get('/me', requireAuth, (req, res, next) => {
  try {
    const u = getUserById(req.userId!);
    if (!u) {
      res.status(404).json({ error: { code: 'not_found', message: 'User not found' } });
      return;
    }
    const settings = db
      .prepare('SELECT monthly_income, currency, low_budget_threshold, bill_reminder_days FROM user_settings WHERE user_id = ?')
      .get(u.id);
    res.json({ user: u, settings });
  } catch (e) {
    next(e);
  }
});

export default router;
