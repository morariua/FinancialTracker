import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import { db } from '../db/database';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import { NotFound } from '../utils/errors';
import { currentMonth } from '../utils/dates';

const router = Router();
router.use(requireAuth);

const upsertSchema = z.object({
  name: z.string().min(1).max(80),
  amount: z.number().positive(),
  due_day: z.number().int().min(1).max(31),
  category_id: z.string().uuid().optional().nullable(),
  account_id: z.string().uuid().optional().nullable(),
  autopay: z.boolean().default(false),
  active: z.boolean().default(true),
});

router.get('/', (req, res) => {
  const userId = req.userId!;
  const rows = db
    .prepare(
      `SELECT b.*, c.name AS category_name, c.color AS category_color, a.name AS account_name
       FROM bills b
       LEFT JOIN categories c ON c.id = b.category_id
       LEFT JOIN accounts a ON a.id = b.account_id
       WHERE b.user_id = ? AND b.active = 1
       ORDER BY b.due_day`
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
      `INSERT INTO bills (id, user_id, name, amount, due_day, category_id, account_id, autopay, active, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`
    ).run(
      id,
      userId,
      body.name,
      body.amount,
      body.due_day,
      body.category_id || null,
      body.account_id || null,
      body.autopay ? 1 : 0,
      body.active ? 1 : 0,
      now,
      now
    );
    res.json({ id });
  } catch (e) {
    next(e);
  }
});

router.patch('/:id', (req, res, next) => {
  try {
    const userId = req.userId!;
    const body = upsertSchema.partial().parse(req.body);
    const existing = db
      .prepare('SELECT id FROM bills WHERE id = ? AND user_id = ?')
      .get(req.params.id, userId);
    if (!existing) throw NotFound('Bill not found');
    const fields: string[] = [];
    const vals: unknown[] = [];
    for (const [k, v] of Object.entries(body)) {
      if (k === 'autopay' || k === 'active') {
        fields.push(`${k} = ?`);
        vals.push(v ? 1 : 0);
      } else {
        fields.push(`${k} = ?`);
        vals.push(v);
      }
    }
    fields.push('updated_at = ?');
    vals.push(Date.now());
    vals.push(req.params.id, userId);
    db.prepare(`UPDATE bills SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`).run(...vals);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.post('/:id/mark-paid', (req, res, next) => {
  try {
    const userId = req.userId!;
    const bill = db
      .prepare('SELECT * FROM bills WHERE id = ? AND user_id = ?')
      .get(req.params.id, userId) as
      | {
          id: string;
          name: string;
          amount: number;
          category_id: string | null;
          account_id: string | null;
        }
      | undefined;
    if (!bill) throw NotFound('Bill not found');
    const month = currentMonth();
    const now = Date.now();
    const txId = uuid();
    db.prepare(
      `INSERT INTO transactions (id, user_id, account_id, category_id, amount, currency, description, date, type, pending, source, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(
      txId,
      userId,
      bill.account_id,
      bill.category_id,
      bill.amount,
      'USD',
      `Bill: ${bill.name}`,
      new Date().toISOString().slice(0, 10),
      'expense',
      0,
      'bill',
      now,
      now
    );
    if (bill.account_id) {
      db.prepare('UPDATE accounts SET balance = balance - ?, updated_at = ? WHERE id = ?').run(
        bill.amount,
        now,
        bill.account_id
      );
    }
    db.prepare('UPDATE bills SET last_paid_month = ?, updated_at = ? WHERE id = ?').run(
      month,
      now,
      bill.id
    );
    res.json({ ok: true, transaction_id: txId });
  } catch (e) {
    next(e);
  }
});

router.delete('/:id', (req, res, next) => {
  try {
    const userId = req.userId!;
    const info = db
      .prepare('DELETE FROM bills WHERE id = ? AND user_id = ?')
      .run(req.params.id, userId);
    if (info.changes === 0) throw NotFound('Bill not found');
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

export default router;
