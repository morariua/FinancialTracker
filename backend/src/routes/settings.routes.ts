import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/database';
import { AuthedRequest, requireAuth } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

const settingsSchema = z.object({
  monthly_income: z.number().nonnegative().optional(),
  currency: z.string().length(3).optional(),
  low_budget_threshold: z.number().min(0).max(1).optional(),
  bill_reminder_days: z.number().int().min(0).max(30).optional(),
});

router.get('/', (req, res) => {
  const userId = req.userId!;
  const row = db
    .prepare(
      'SELECT monthly_income, currency, low_budget_threshold, bill_reminder_days FROM user_settings WHERE user_id = ?'
    )
    .get(userId);
  res.json(row || {});
});

router.patch('/', (req, res, next) => {
  try {
    const userId = req.userId!;
    const body = settingsSchema.parse(req.body);
    const fields: string[] = [];
    const vals: unknown[] = [];
    for (const [k, v] of Object.entries(body)) {
      if (v === undefined) continue;
      fields.push(`${k} = ?`);
      vals.push(v);
    }
    if (fields.length) {
      fields.push('updated_at = ?');
      vals.push(Date.now());
      vals.push(userId);
      db.prepare(`UPDATE user_settings SET ${fields.join(', ')} WHERE user_id = ?`).run(...vals);
    }
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

export default router;
