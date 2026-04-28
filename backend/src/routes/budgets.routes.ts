import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import { db } from '../db/database';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import { BadRequest } from '../utils/errors';
import { currentMonth, monthBounds } from '../utils/dates';

const router = Router();
router.use(requireAuth);

const upsertSchema = z.object({
  category_id: z.string().uuid(),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  amount: z.number().nonnegative(),
  rollover: z.boolean().default(false),
});

router.get('/', (req, res) => {
  const userId = req.userId!;
  const month = (req.query.month as string) || currentMonth();
  const { start, end } = monthBounds(month);

  const rows = db
    .prepare(
      `SELECT b.id, b.category_id, b.month, b.amount, b.rollover,
              c.name AS category_name, c.color AS category_color, c.kind AS category_kind,
              COALESCE((
                SELECT SUM(CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END)
                FROM transactions t
                WHERE t.user_id = b.user_id
                  AND t.category_id = b.category_id
                  AND t.date BETWEEN ? AND ?
              ), 0) AS spent
       FROM budgets b
       JOIN categories c ON c.id = b.category_id
       WHERE b.user_id = ? AND b.month = ?
       ORDER BY c.name`
    )
    .all(start, end, userId, month);
  res.json(rows);
});

router.put('/', (req, res, next) => {
  try {
    const userId = req.userId!;
    const body = upsertSchema.parse(req.body);
    const cat = db
      .prepare('SELECT id FROM categories WHERE id = ? AND user_id = ?')
      .get(body.category_id, userId);
    if (!cat) throw BadRequest('Invalid category');
    const now = Date.now();
    const existing = db
      .prepare(
        'SELECT id FROM budgets WHERE user_id = ? AND category_id = ? AND month = ?'
      )
      .get(userId, body.category_id, body.month) as { id: string } | undefined;
    if (existing) {
      db.prepare(
        'UPDATE budgets SET amount = ?, rollover = ?, updated_at = ? WHERE id = ?'
      ).run(body.amount, body.rollover ? 1 : 0, now, existing.id);
      res.json({ id: existing.id });
    } else {
      const id = uuid();
      db.prepare(
        `INSERT INTO budgets (id, user_id, category_id, month, amount, rollover, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?)`
      ).run(id, userId, body.category_id, body.month, body.amount, body.rollover ? 1 : 0, now, now);
      res.json({ id });
    }
  } catch (e) {
    next(e);
  }
});

router.delete('/:id', (req, res, next) => {
  try {
    const userId = req.userId!;
    const info = db
      .prepare('DELETE FROM budgets WHERE id = ? AND user_id = ?')
      .run(req.params.id, userId);
    res.json({ ok: info.changes > 0 });
  } catch (e) {
    next(e);
  }
});

const allocateSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  income: z.number().nonnegative().optional(),
  strategy: z.enum(['50-30-20', 'historical', 'zero-based']).default('50-30-20'),
  savings_target_pct: z.number().min(0).max(0.9).default(0.2),
});

router.post('/auto-allocate', (req, res, next) => {
  try {
    const userId = req.userId!;
    const body = allocateSchema.parse(req.body);

    const settings = db
      .prepare('SELECT monthly_income FROM user_settings WHERE user_id = ?')
      .get(userId) as { monthly_income: number } | undefined;
    const income = body.income ?? settings?.monthly_income ?? 0;
    if (income <= 0) {
      throw BadRequest('Set your monthly income first or pass an income value.');
    }

    const categories = db
      .prepare(
        `SELECT id, name, kind FROM categories WHERE user_id = ? ORDER BY name`
      )
      .all(userId) as Array<{ id: string; name: string; kind: string }>;

    const allocations = computeAllocations(categories, income, body.strategy, body.savings_target_pct);

    const now = Date.now();
    const upsert = db.prepare(
      `INSERT INTO budgets (id, user_id, category_id, month, amount, rollover, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?)
       ON CONFLICT(user_id, category_id, month)
       DO UPDATE SET amount = excluded.amount, updated_at = excluded.updated_at`
    );
    const txn = db.transaction(() => {
      for (const a of allocations) {
        upsert.run(uuid(), userId, a.category_id, body.month, a.amount, 0, now, now);
      }
    });
    txn();
    res.json({ income, allocations });
  } catch (e) {
    next(e);
  }
});

function computeAllocations(
  categories: Array<{ id: string; name: string; kind: string }>,
  income: number,
  strategy: '50-30-20' | 'historical' | 'zero-based',
  savingsPct: number
) {
  // Simple weights for default categories. Falls back to "Other" as remainder.
  const NEEDS = new Set(['Housing', 'Groceries', 'Utilities', 'Transport', 'Health']);
  const WANTS = new Set(['Dining', 'Entertainment', 'Subscriptions']);
  const SAVINGS_NAME = 'Savings';

  const needsBudget = income * 0.5;
  const wantsBudget = income * 0.3;
  const savingsBudget = income * (strategy === '50-30-20' ? 0.2 : savingsPct);

  const needsCats = categories.filter((c) => NEEDS.has(c.name));
  const wantsCats = categories.filter((c) => WANTS.has(c.name));
  const savingsCat = categories.find((c) => c.name === SAVINGS_NAME);

  const out: Array<{ category_id: string; category_name: string; amount: number }> = [];
  const split = (amount: number, cats: Array<{ id: string; name: string }>) => {
    if (cats.length === 0) return;
    const per = Math.round((amount / cats.length) * 100) / 100;
    for (const c of cats) out.push({ category_id: c.id, category_name: c.name, amount: per });
  };
  split(needsBudget, needsCats);
  split(wantsBudget, wantsCats);
  if (savingsCat) {
    out.push({
      category_id: savingsCat.id,
      category_name: savingsCat.name,
      amount: Math.round(savingsBudget * 100) / 100,
    });
  }
  return out;
}

export default router;
