import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import { db } from '../db/database';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import { BadRequest, NotFound } from '../utils/errors';

const router = Router();
router.use(requireAuth);

const upsertSchema = z.object({
  name: z.string().min(1).max(60),
  icon: z.string().max(40).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  kind: z.enum(['expense', 'income', 'savings']).default('expense'),
});

router.get('/', (req, res) => {
  const userId = req.userId!;
  const rows = db
    .prepare(
      `SELECT id, name, icon, color, kind, created_at FROM categories WHERE user_id = ? ORDER BY name`
    )
    .all(userId);
  res.json(rows);
});

router.post('/', (req, res, next) => {
  try {
    const userId = req.userId!;
    const body = upsertSchema.parse(req.body);
    const existing = db
      .prepare('SELECT id FROM categories WHERE user_id = ? AND name = ?')
      .get(userId, body.name) as { id: string } | undefined;
    if (existing) throw BadRequest('Category already exists');
    const id = uuid();
    db.prepare(
      `INSERT INTO categories (id, user_id, name, icon, color, kind, created_at)
       VALUES (?,?,?,?,?,?,?)`
    ).run(id, userId, body.name, body.icon || null, body.color || null, body.kind, Date.now());
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
      .prepare('SELECT id FROM categories WHERE id = ? AND user_id = ?')
      .get(req.params.id, userId) as { id: string } | undefined;
    if (!existing) throw NotFound('Category not found');
    const fields: string[] = [];
    const vals: unknown[] = [];
    for (const [k, v] of Object.entries(body)) {
      fields.push(`${k} = ?`);
      vals.push(v);
    }
    if (fields.length) {
      vals.push(req.params.id, userId);
      db.prepare(`UPDATE categories SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`).run(
        ...vals
      );
    }
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.delete('/:id', (req, res, next) => {
  try {
    const userId = req.userId!;
    const info = db
      .prepare('DELETE FROM categories WHERE id = ? AND user_id = ?')
      .run(req.params.id, userId);
    if (info.changes === 0) throw NotFound('Category not found');
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

export default router;
