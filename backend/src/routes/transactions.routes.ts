import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import { parse } from 'csv-parse/sync';
import { db } from '../db/database';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import { BadRequest, NotFound } from '../utils/errors';

const router = Router();
router.use(requireAuth);

const txSchema = z.object({
  account_id: z.string().uuid().optional().nullable(),
  category_id: z.string().uuid().optional().nullable(),
  amount: z.number(),
  currency: z.string().length(3).default('USD'),
  description: z.string().min(1).max(200),
  merchant: z.string().max(120).optional().nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type: z.enum(['expense', 'income', 'transfer']).default('expense'),
  pending: z.boolean().default(false),
  notes: z.string().max(500).optional().nullable(),
});

router.get('/', (req, res) => {
  const userId = req.userId!;
  const q = req.query;
  const conds: string[] = ['t.user_id = ?'];
  const vals: unknown[] = [userId];
  if (typeof q.from === 'string') {
    conds.push('t.date >= ?');
    vals.push(q.from);
  }
  if (typeof q.to === 'string') {
    conds.push('t.date <= ?');
    vals.push(q.to);
  }
  if (typeof q.category_id === 'string' && q.category_id) {
    conds.push('t.category_id = ?');
    vals.push(q.category_id);
  }
  if (typeof q.account_id === 'string' && q.account_id) {
    conds.push('t.account_id = ?');
    vals.push(q.account_id);
  }
  if (typeof q.search === 'string' && q.search) {
    conds.push('(t.description LIKE ? OR t.merchant LIKE ?)');
    const s = `%${q.search}%`;
    vals.push(s, s);
  }
  const limit = Math.min(parseInt((q.limit as string) || '100', 10) || 100, 500);
  const offset = Math.max(parseInt((q.offset as string) || '0', 10) || 0, 0);
  vals.push(limit, offset);
  const rows = db
    .prepare(
      `SELECT t.*, c.name AS category_name, c.color AS category_color, a.name AS account_name
       FROM transactions t
       LEFT JOIN categories c ON c.id = t.category_id
       LEFT JOIN accounts a ON a.id = t.account_id
       WHERE ${conds.join(' AND ')}
       ORDER BY t.date DESC, t.created_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(...vals);
  res.json(rows);
});

router.post('/', (req, res, next) => {
  try {
    const userId = req.userId!;
    const body = txSchema.parse(req.body);
    if (body.account_id) {
      const owns = db
        .prepare('SELECT id FROM accounts WHERE id = ? AND user_id = ?')
        .get(body.account_id, userId);
      if (!owns) throw BadRequest('Invalid account');
    }
    if (body.category_id) {
      const owns = db
        .prepare('SELECT id FROM categories WHERE id = ? AND user_id = ?')
        .get(body.category_id, userId);
      if (!owns) throw BadRequest('Invalid category');
    }
    const id = uuid();
    const now = Date.now();
    db.prepare(
      `INSERT INTO transactions
        (id, user_id, account_id, category_id, amount, currency, description, merchant, date, type, pending, source, notes, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(
      id,
      userId,
      body.account_id || null,
      body.category_id || null,
      body.amount,
      body.currency,
      body.description,
      body.merchant || null,
      body.date,
      body.type,
      body.pending ? 1 : 0,
      'manual',
      body.notes || null,
      now,
      now
    );
    if (body.account_id) {
      const delta = body.type === 'income' ? body.amount : -body.amount;
      db.prepare('UPDATE accounts SET balance = balance + ?, updated_at = ? WHERE id = ?').run(
        delta,
        now,
        body.account_id
      );
    }
    res.json({ id });
  } catch (e) {
    next(e);
  }
});

router.patch('/:id', (req, res, next) => {
  try {
    const userId = req.userId!;
    const body = txSchema.partial().parse(req.body);
    const existing = db
      .prepare('SELECT * FROM transactions WHERE id = ? AND user_id = ?')
      .get(req.params.id, userId) as
      | {
          id: string;
          account_id: string | null;
          amount: number;
          type: string;
        }
      | undefined;
    if (!existing) throw NotFound('Transaction not found');
    const fields: string[] = [];
    const vals: unknown[] = [];
    for (const [k, v] of Object.entries(body)) {
      if (k === 'pending') {
        fields.push('pending = ?');
        vals.push(v ? 1 : 0);
      } else {
        fields.push(`${k} = ?`);
        vals.push(v);
      }
    }
    fields.push('updated_at = ?');
    vals.push(Date.now());
    vals.push(req.params.id, userId);
    db.prepare(`UPDATE transactions SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`).run(
      ...vals
    );
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.delete('/:id', (req, res, next) => {
  try {
    const userId = req.userId!;
    const tx = db
      .prepare('SELECT * FROM transactions WHERE id = ? AND user_id = ?')
      .get(req.params.id, userId) as
      | { id: string; account_id: string | null; amount: number; type: string }
      | undefined;
    if (!tx) throw NotFound('Transaction not found');
    db.prepare('DELETE FROM transactions WHERE id = ?').run(tx.id);
    if (tx.account_id) {
      const delta = tx.type === 'income' ? -tx.amount : tx.amount;
      db.prepare('UPDATE accounts SET balance = balance + ?, updated_at = ? WHERE id = ?').run(
        delta,
        Date.now(),
        tx.account_id
      );
    }
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

const csvImportSchema = z.object({
  account_id: z.string().uuid().optional(),
  csv: z.string().min(1).max(5_000_000),
});

router.post('/import-csv', (req, res, next) => {
  try {
    const userId = req.userId!;
    const body = csvImportSchema.parse(req.body);
    if (body.account_id) {
      const owns = db
        .prepare('SELECT id FROM accounts WHERE id = ? AND user_id = ?')
        .get(body.account_id, userId);
      if (!owns) throw BadRequest('Invalid account');
    }
    const records = parse(body.csv, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as Record<string, string>[];

    const now = Date.now();
    let imported = 0;
    const insert = db.prepare(
      `INSERT INTO transactions
        (id, user_id, account_id, category_id, amount, currency, description, merchant, date, type, pending, source, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    );
    const tx = db.transaction((rows: Record<string, string>[]) => {
      for (const r of rows) {
        const lower: Record<string, string> = {};
        for (const k of Object.keys(r)) lower[k.toLowerCase()] = r[k];
        const date = lower.date || lower['transaction date'] || lower['posted date'];
        const desc = lower.description || lower.memo || lower.payee || lower.merchant || 'Imported';
        const amountRaw =
          lower.amount ?? lower.debit ?? lower.credit ?? lower.value ?? '';
        let amt = parseFloat(String(amountRaw).replace(/[,\s$]/g, ''));
        if (Number.isNaN(amt)) continue;
        let type: 'expense' | 'income' = 'expense';
        if (lower.credit && parseFloat(lower.credit.replace(/[,\s$]/g, '')) > 0) {
          type = 'income';
          amt = Math.abs(amt);
        } else if (amt > 0 && lower.debit) {
          type = 'expense';
          amt = Math.abs(amt);
        } else if (amt > 0 && !lower.debit) {
          type = 'income';
        } else if (amt < 0) {
          type = 'expense';
          amt = Math.abs(amt);
        }
        const isoDate = normalizeDate(date);
        if (!isoDate) continue;
        insert.run(
          uuid(),
          userId,
          body.account_id || null,
          null,
          amt,
          'USD',
          desc.slice(0, 200),
          (lower.merchant || lower.payee || '').slice(0, 120) || null,
          isoDate,
          type,
          0,
          'csv',
          now,
          now
        );
        imported++;
      }
    });
    tx(records);
    res.json({ imported });
  } catch (e) {
    next(e);
  }
});

function normalizeDate(d?: string): string | null {
  if (!d) return null;
  const t = d.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = t.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    const mm = m[1].padStart(2, '0');
    const dd = m[2].padStart(2, '0');
    let yy = m[3];
    if (yy.length === 2) yy = '20' + yy;
    return `${yy}-${mm}-${dd}`;
  }
  const parsed = new Date(t);
  if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return null;
}

export default router;
