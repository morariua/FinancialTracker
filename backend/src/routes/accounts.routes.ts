import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import { db } from '../db/database';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import { NotFound } from '../utils/errors';

const router = Router();
router.use(requireAuth);

const upsertSchema = z.object({
  name: z.string().min(1).max(80),
  type: z.enum(['checking', 'savings', 'credit', 'cash', 'investment', 'loan']),
  institution: z.string().max(100).optional(),
  mask: z.string().max(8).optional(),
  balance: z.number().default(0),
  currency: z.string().length(3).default('USD'),
});

router.get('/', (req, res) => {
  const userId = req.userId!;
  const rows = db
    .prepare(
      `SELECT id, name, type, institution, mask, balance, currency, plaid_account_id, created_at, updated_at
       FROM accounts WHERE user_id = ? ORDER BY created_at DESC`
    )
    .all(userId);
  res.json(rows);
});

router.post('/', (req, res, next) => {
  try {
    const userId = req.userId!;
    const body = upsertSchema.parse(req.body);
    const id = uuid();
    const now = Date.now();
    db.prepare(
      `INSERT INTO accounts (id, user_id, name, type, institution, mask, balance, currency, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`
    ).run(
      id,
      userId,
      body.name,
      body.type,
      body.institution || null,
      body.mask || null,
      body.balance,
      body.currency,
      now,
      now
    );
    res.json({ id, ...body });
  } catch (e) {
    next(e);
  }
});

router.patch('/:id', (req, res, next) => {
  try {
    const userId = req.userId!;
    const body = upsertSchema.partial().parse(req.body);
    const existing = db
      .prepare('SELECT id FROM accounts WHERE id = ? AND user_id = ?')
      .get(req.params.id, userId);
    if (!existing) throw NotFound('Account not found');
    const fields: string[] = [];
    const vals: unknown[] = [];
    for (const [k, v] of Object.entries(body)) {
      fields.push(`${k} = ?`);
      vals.push(v);
    }
    fields.push('updated_at = ?');
    vals.push(Date.now());
    vals.push(req.params.id, userId);
    db.prepare(
      `UPDATE accounts SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`
    ).run(...vals);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.delete('/:id', (req, res, next) => {
  try {
    const userId = req.userId!;
    const info = db
      .prepare('DELETE FROM accounts WHERE id = ? AND user_id = ?')
      .run(req.params.id, userId);
    if (info.changes === 0) throw NotFound('Account not found');
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

export default router;
