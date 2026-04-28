import { Router } from 'express';
import { db } from '../db/database';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import { addMonths, currentMonth, daysInMonth, monthBounds, todayISO } from '../utils/dates';

const router = Router();
router.use(requireAuth);

router.get('/summary', (req, res) => {
  const userId = req.userId!;
  const month = (req.query.month as string) || currentMonth();
  const { start, end } = monthBounds(month);

  const settings = db
    .prepare('SELECT monthly_income, currency FROM user_settings WHERE user_id = ?')
    .get(userId) as { monthly_income: number; currency: string } | undefined;

  const totals = db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END),0) AS spent,
         COALESCE(SUM(CASE WHEN type='income' THEN amount ELSE 0 END),0) AS income,
         COUNT(*) AS tx_count
       FROM transactions WHERE user_id = ? AND date BETWEEN ? AND ?`
    )
    .get(userId, start, end) as { spent: number; income: number; tx_count: number };

  const byCategory = db
    .prepare(
      `SELECT c.id AS category_id, c.name AS category_name, c.color AS category_color,
              COALESCE(SUM(CASE WHEN t.type='expense' THEN t.amount ELSE 0 END),0) AS spent
       FROM categories c
       LEFT JOIN transactions t ON t.category_id = c.id AND t.user_id = c.user_id AND t.date BETWEEN ? AND ?
       WHERE c.user_id = ? AND c.kind = 'expense'
       GROUP BY c.id ORDER BY spent DESC`
    )
    .all(start, end, userId);

  const dailySpending = db
    .prepare(
      `SELECT date, SUM(CASE WHEN type='expense' THEN amount ELSE 0 END) AS spent
       FROM transactions WHERE user_id = ? AND date BETWEEN ? AND ?
       GROUP BY date ORDER BY date`
    )
    .all(userId, start, end);

  // Trend last 6 months
  const trend: Array<{ month: string; spent: number; income: number }> = [];
  for (let i = 5; i >= 0; i--) {
    const m = addMonths(month, -i);
    const { start: s, end: e } = monthBounds(m);
    const t = db
      .prepare(
        `SELECT
           COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END),0) AS spent,
           COALESCE(SUM(CASE WHEN type='income' THEN amount ELSE 0 END),0) AS income
         FROM transactions WHERE user_id = ? AND date BETWEEN ? AND ?`
      )
      .get(userId, s, e) as { spent: number; income: number };
    trend.push({ month: m, spent: t.spent, income: t.income });
  }

  const accounts = db
    .prepare('SELECT id, name, type, balance, currency FROM accounts WHERE user_id = ?')
    .all(userId) as Array<{ id: string; balance: number }>;
  const totalBalance = accounts.reduce((s, a) => s + a.balance, 0);

  const upcomingBills = db
    .prepare(
      `SELECT id, name, amount, due_day FROM bills
       WHERE user_id = ? AND active = 1 AND (last_paid_month IS NULL OR last_paid_month != ?)
       ORDER BY due_day ASC LIMIT 10`
    )
    .all(userId, month);

  const today = new Date();
  const dayOfMonth = today.getUTCDate();
  const dim = daysInMonth(month);
  const monthProgress = Math.min(1, dayOfMonth / dim);

  const totalBudget = db
    .prepare(
      `SELECT COALESCE(SUM(amount),0) AS total FROM budgets WHERE user_id = ? AND month = ?`
    )
    .get(userId, month) as { total: number };

  const income = settings?.monthly_income || totals.income;
  const remaining = income - totals.spent;

  res.json({
    month,
    today: todayISO(),
    monthProgress,
    income,
    spent: totals.spent,
    remaining,
    txCount: totals.tx_count,
    totalBudget: totalBudget.total,
    totalBalance,
    accounts,
    byCategory,
    dailySpending,
    trend,
    upcomingBills,
    currency: settings?.currency || 'USD',
  });
});

export default router;
