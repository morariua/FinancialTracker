import { Router } from 'express';
import { db } from '../db/database';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import { evaluateAlertsForUser } from '../services/alerts.service';

const router = Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const userId = req.userId!;
  const includeDismissed = req.query.include_dismissed === '1';
  const where = includeDismissed
    ? 'user_id = ?'
    : 'user_id = ? AND dismissed_at IS NULL';
  const rows = db
    .prepare(
      `SELECT id, kind, severity, title, message, meta, read_at, dismissed_at, created_at
       FROM alerts WHERE ${where} ORDER BY created_at DESC LIMIT 200`
    )
    .all(userId) as Array<{
    id: string;
    kind: string;
    severity: string;
    title: string;
    message: string;
    meta: string | null;
    read_at: number | null;
    dismissed_at: number | null;
    created_at: number;
  }>;
  res.json(
    rows.map((r) => ({
      ...r,
      meta: r.meta ? JSON.parse(r.meta) : null,
    }))
  );
});

router.post('/evaluate', (req, res) => {
  const userId = req.userId!;
  const created = evaluateAlertsForUser(userId);
  res.json({ created });
});

router.post('/:id/read', (req, res) => {
  const userId = req.userId!;
  db.prepare(
    'UPDATE alerts SET read_at = ? WHERE id = ? AND user_id = ? AND read_at IS NULL'
  ).run(Date.now(), req.params.id, userId);
  res.json({ ok: true });
});

router.post('/read-all', (req, res) => {
  const userId = req.userId!;
  db.prepare(
    'UPDATE alerts SET read_at = ? WHERE user_id = ? AND read_at IS NULL'
  ).run(Date.now(), userId);
  res.json({ ok: true });
});

router.post('/:id/dismiss', (req, res) => {
  const userId = req.userId!;
  db.prepare(
    'UPDATE alerts SET dismissed_at = ? WHERE id = ? AND user_id = ?'
  ).run(Date.now(), req.params.id, userId);
  res.json({ ok: true });
});

export default router;
