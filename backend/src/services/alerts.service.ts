import { v4 as uuid } from 'uuid';
import { db } from '../db/database';
import { currentMonth, monthBounds, daysInMonth } from '../utils/dates';

export type Severity = 'info' | 'warning' | 'critical';

interface AlertInput {
  user_id: string;
  kind: string;
  severity: Severity;
  title: string;
  message: string;
  meta?: unknown;
  dedupe_key: string;
}

function upsertAlert(a: AlertInput): boolean {
  const existing = db
    .prepare('SELECT id FROM alerts WHERE user_id = ? AND dedupe_key = ?')
    .get(a.user_id, a.dedupe_key) as { id: string } | undefined;
  if (existing) return false;
  db.prepare(
    `INSERT INTO alerts (id, user_id, kind, severity, title, message, meta, dedupe_key, created_at)
     VALUES (?,?,?,?,?,?,?,?,?)`
  ).run(
    uuid(),
    a.user_id,
    a.kind,
    a.severity,
    a.title,
    a.message,
    a.meta ? JSON.stringify(a.meta) : null,
    a.dedupe_key,
    Date.now()
  );
  return true;
}

export function evaluateAlertsForUser(userId: string): number {
  const month = currentMonth();
  const { start, end } = monthBounds(month);
  const settings = db
    .prepare(
      'SELECT monthly_income, low_budget_threshold, bill_reminder_days FROM user_settings WHERE user_id = ?'
    )
    .get(userId) as
    | { monthly_income: number; low_budget_threshold: number; bill_reminder_days: number }
    | undefined;
  if (!settings) return 0;

  const threshold = settings.low_budget_threshold ?? 0.2;
  let created = 0;

  // Low budget alerts
  const budgets = db
    .prepare(
      `SELECT b.id, b.category_id, b.amount, c.name AS category_name,
              COALESCE((
                SELECT SUM(CASE WHEN t.type='expense' THEN t.amount ELSE 0 END)
                FROM transactions t
                WHERE t.user_id = b.user_id AND t.category_id = b.category_id
                  AND t.date BETWEEN ? AND ?
              ), 0) AS spent
       FROM budgets b
       JOIN categories c ON c.id = b.category_id
       WHERE b.user_id = ? AND b.month = ?`
    )
    .all(start, end, userId, month) as Array<{
    id: string;
    category_id: string;
    category_name: string;
    amount: number;
    spent: number;
  }>;

  for (const b of budgets) {
    if (b.amount <= 0) continue;
    const remaining = b.amount - b.spent;
    const remainingPct = remaining / b.amount;
    if (b.spent >= b.amount) {
      if (
        upsertAlert({
          user_id: userId,
          kind: 'budget_exceeded',
          severity: 'critical',
          title: `Over budget: ${b.category_name}`,
          message: `You have spent $${b.spent.toFixed(2)} of $${b.amount.toFixed(2)} (over by $${(b.spent - b.amount).toFixed(2)}).`,
          meta: { category_id: b.category_id, month },
          dedupe_key: `budget_exceeded:${b.category_id}:${month}`,
        })
      )
        created++;
    } else if (remainingPct <= threshold) {
      if (
        upsertAlert({
          user_id: userId,
          kind: 'budget_low',
          severity: 'warning',
          title: `Low budget: ${b.category_name}`,
          message: `Only $${remaining.toFixed(2)} (${(remainingPct * 100).toFixed(0)}%) left of your $${b.amount.toFixed(2)} ${b.category_name} budget.`,
          meta: { category_id: b.category_id, month, remaining },
          dedupe_key: `budget_low:${b.category_id}:${month}:${Math.floor(remainingPct * 10)}`,
        })
      )
        created++;
    }
  }

  // Overall remaining-money alert
  const totalIncome = settings.monthly_income;
  const spentRow = db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END),0) AS spent,
         COALESCE(SUM(CASE WHEN type='income' THEN amount ELSE 0 END),0) AS income
       FROM transactions WHERE user_id = ? AND date BETWEEN ? AND ?`
    )
    .get(userId, start, end) as { spent: number; income: number };
  const effectiveIncome = totalIncome > 0 ? totalIncome : spentRow.income;
  if (effectiveIncome > 0) {
    const remaining = effectiveIncome - spentRow.spent;
    const pct = remaining / effectiveIncome;
    if (remaining <= 0) {
      if (
        upsertAlert({
          user_id: userId,
          kind: 'monthly_out_of_funds',
          severity: 'critical',
          title: `Out of monthly funds`,
          message: `You have spent your entire monthly income ($${effectiveIncome.toFixed(2)}).`,
          meta: { month, remaining, effectiveIncome },
          dedupe_key: `monthly_out:${month}`,
        })
      )
        created++;
    } else if (pct <= 0.15) {
      if (
        upsertAlert({
          user_id: userId,
          kind: 'monthly_low',
          severity: 'warning',
          title: `Only $${remaining.toFixed(2)} left this month`,
          message: `${(pct * 100).toFixed(0)}% of your monthly funds remain.`,
          meta: { month, remaining, effectiveIncome },
          dedupe_key: `monthly_low:${month}:${Math.floor(pct * 20)}`,
        })
      )
        created++;
    }
  }

  // Upcoming bills
  const reminderDays = settings.bill_reminder_days ?? 3;
  const today = new Date();
  const todayDay = today.getUTCDate();
  const dim = daysInMonth(month);
  const bills = db
    .prepare(
      `SELECT id, name, amount, due_day, last_paid_month FROM bills
       WHERE user_id = ? AND active = 1`
    )
    .all(userId) as Array<{
    id: string;
    name: string;
    amount: number;
    due_day: number;
    last_paid_month: string | null;
  }>;
  for (const b of bills) {
    if (b.last_paid_month === month) continue;
    const dueDay = Math.min(b.due_day, dim);
    const daysUntil = dueDay - todayDay;
    if (daysUntil < 0) {
      if (
        upsertAlert({
          user_id: userId,
          kind: 'bill_overdue',
          severity: 'critical',
          title: `Overdue: ${b.name}`,
          message: `${b.name} ($${b.amount.toFixed(2)}) was due on day ${dueDay}.`,
          meta: { bill_id: b.id, month },
          dedupe_key: `bill_overdue:${b.id}:${month}`,
        })
      )
        created++;
    } else if (daysUntil <= reminderDays) {
      if (
        upsertAlert({
          user_id: userId,
          kind: 'bill_due_soon',
          severity: 'warning',
          title: `${b.name} due in ${daysUntil} day${daysUntil === 1 ? '' : 's'}`,
          message: `Pay $${b.amount.toFixed(2)} by day ${dueDay} of ${month}.`,
          meta: { bill_id: b.id, month, daysUntil },
          dedupe_key: `bill_due:${b.id}:${month}`,
        })
      )
        created++;
    }
  }

  return created;
}

export function evaluateAlertsForAllUsers(): number {
  const users = db.prepare('SELECT id FROM users').all() as Array<{ id: string }>;
  let total = 0;
  for (const u of users) total += evaluateAlertsForUser(u.id);
  return total;
}
