import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import { db } from '../db/database';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import { encryptString } from '../utils/crypto';
import { env } from '../config/env';

const router = Router();
router.use(requireAuth);

const plaidConfigured = () => !!env.plaid.clientId && !!env.plaid.secret;

router.get('/status', (_req, res) => {
  res.json({ configured: plaidConfigured(), env: env.plaid.env });
});

router.post('/link-token', (_req, res) => {
  if (!plaidConfigured()) {
    res.status(501).json({
      error: {
        code: 'plaid_not_configured',
        message: 'Plaid is not configured. Set PLAID_CLIENT_ID and PLAID_SECRET in your .env to enable bank linking.',
      },
    });
    return;
  }
  // In a configured environment, here we would call plaid.linkTokenCreate.
  res.json({
    link_token: 'configure-plaid-and-replace-with-real-token',
    expiration: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  });
});

const sandboxLinkSchema = z.object({
  institution_name: z.string().min(1).max(80),
  accounts: z
    .array(
      z.object({
        name: z.string().min(1).max(80),
        type: z.enum(['checking', 'savings', 'credit', 'cash', 'investment', 'loan']),
        mask: z.string().max(8).optional(),
        balance: z.number().default(0),
      })
    )
    .min(1),
});

router.post('/sandbox-link', (req, res, next) => {
  try {
    const userId = req.userId!;
    const body = sandboxLinkSchema.parse(req.body);
    const itemId = uuid();
    const now = Date.now();
    db.prepare(
      `INSERT INTO plaid_items (id, user_id, access_token_enc, item_id, institution_name, created_at)
       VALUES (?,?,?,?,?,?)`
    ).run(uuid(), userId, encryptString('sandbox-token-' + itemId), itemId, body.institution_name, now);

    const created: Array<{ id: string }> = [];
    for (const a of body.accounts) {
      const id = uuid();
      db.prepare(
        `INSERT INTO accounts (id, user_id, name, type, institution, mask, balance, currency, plaid_account_id, plaid_item_id, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
      ).run(
        id,
        userId,
        a.name,
        a.type,
        body.institution_name,
        a.mask || null,
        a.balance,
        'USD',
        uuid(),
        itemId,
        now,
        now
      );
      created.push({ id });
    }
    res.json({ item_id: itemId, accounts: created });
  } catch (e) {
    next(e);
  }
});

router.post('/sync', (_req, res) => {
  // Stub: in a configured environment, calls plaid.transactionsSync with stored cursor.
  // We do not auto-create fake transactions so balances stay accurate.
  res.json({ synced: 0, message: plaidConfigured() ? 'sync run' : 'plaid not configured' });
});

export default router;
