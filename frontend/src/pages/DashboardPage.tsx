import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { DashboardSummary, Alert } from '../api/types';
import { money, percent, dateLong, nowMonth } from '../utils/format';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export default function DashboardPage() {
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [month, setMonth] = useState<string>(nowMonth());
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const [d, a] = await Promise.all([
          api.get<DashboardSummary>(`/dashboard/summary?month=${month}`),
          api.get<Alert[]>('/alerts'),
        ]);
        if (!cancel) {
          setData(d.data);
          setAlerts(a.data.slice(0, 5));
        }
      } catch (e: unknown) {
        if (!cancel) setErr((e as Error).message);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [month]);

  if (err) return <div className="text-red-400">{err}</div>;
  if (!data) return <div className="text-slate-400">Loading dashboard…</div>;

  const remainPct = data.income > 0 ? data.remaining / data.income : 0;
  const spentPct = data.income > 0 ? Math.min(1, data.spent / data.income) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-slate-400 text-sm">Your finances at a glance for {data.month}</p>
        </div>
        <input
          type="month"
          className="input max-w-[10rem]"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Monthly income" value={money(data.income, data.currency)} hint="Set in Settings" tone="info" />
        <Stat
          label="Spent this month"
          value={money(data.spent, data.currency)}
          hint={`${percent(spentPct)} of income · ${data.txCount} tx`}
          tone={spentPct > 1 ? 'bad' : spentPct > 0.85 ? 'warn' : 'good'}
        />
        <Stat
          label="Remaining"
          value={money(data.remaining, data.currency)}
          hint={data.income > 0 ? `${percent(remainPct)} left · month ${percent(data.monthProgress)} elapsed` : ''}
          tone={data.remaining < 0 ? 'bad' : remainPct < 0.15 ? 'warn' : 'good'}
        />
        <Stat
          label="Net account balance"
          value={money(data.totalBalance, data.currency)}
          hint={`${data.accounts.length} accounts`}
          tone="info"
        />
      </div>

      {alerts.length > 0 && (
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">Recent alerts</h3>
            <a href="/alerts" className="text-xs text-accent2 hover:underline">View all</a>
          </div>
          <ul className="space-y-2">
            {alerts.map((a) => (
              <li key={a.id} className="flex gap-3 items-start">
                <span
                  className={`mt-1 inline-block w-2 h-2 rounded-full ${
                    a.severity === 'critical' ? 'bg-bad' : a.severity === 'warning' ? 'bg-warn' : 'bg-accent2'
                  }`}
                />
                <div>
                  <div className="text-sm font-medium">{a.title}</div>
                  <div className="text-xs text-slate-400">{a.message}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card p-4 lg:col-span-2">
          <h3 className="font-semibold mb-3">Daily spending</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.dailySpending}>
                <defs>
                  <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.6} />
                    <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 11 }} />
                <YAxis stroke="#64748b" tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8 }}
                  formatter={(v: number) => money(v, data.currency)}
                />
                <Area type="monotone" dataKey="spent" stroke="#22d3ee" fill="url(#g1)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card p-4">
          <h3 className="font-semibold mb-3">Spending by category</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data.byCategory.filter((c) => c.spent > 0)}
                  dataKey="spent"
                  nameKey="category_name"
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={85}
                  paddingAngle={2}
                >
                  {data.byCategory
                    .filter((c) => c.spent > 0)
                    .map((c, i) => (
                      <Cell key={i} fill={c.category_color || '#6366f1'} />
                    ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8 }}
                  formatter={(v: number, n: string) => [money(v, data.currency), n]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-1 mt-2">
            {data.byCategory.slice(0, 5).map((c) => (
              <div key={c.category_id} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: c.category_color }} />
                  <span>{c.category_name}</span>
                </div>
                <span className="text-slate-300">{money(c.spent, data.currency)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card p-4 lg:col-span-2">
          <h3 className="font-semibold mb-3">6-month trend</h3>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.trend}>
                <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                <XAxis dataKey="month" stroke="#64748b" tick={{ fontSize: 11 }} />
                <YAxis stroke="#64748b" tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8 }}
                  formatter={(v: number) => money(v, data.currency)}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="income" fill="#22c55e" radius={[6, 6, 0, 0]} />
                <Bar dataKey="spent" fill="#ef4444" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card p-4">
          <h3 className="font-semibold mb-3">Upcoming bills</h3>
          {data.upcomingBills.length === 0 ? (
            <p className="text-slate-400 text-sm">No upcoming bills.</p>
          ) : (
            <ul className="space-y-2">
              {data.upcomingBills.map((b) => (
                <li
                  key={b.id}
                  className="flex items-center justify-between text-sm border border-border rounded-lg p-2"
                >
                  <div>
                    <div className="font-medium">{b.name}</div>
                    <div className="text-xs text-slate-400">Due day {b.due_day}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold">{money(b.amount, data.currency)}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="text-xs text-slate-500">Updated {dateLong(data.today)}</div>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone: 'good' | 'warn' | 'bad' | 'info';
}) {
  const colors: Record<typeof tone, string> = {
    good: 'text-good',
    warn: 'text-warn',
    bad: 'text-bad',
    info: 'text-accent2',
  };
  return (
    <div className="card p-4">
      <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`text-2xl font-semibold mt-1 ${colors[tone]}`}>{value}</div>
      {hint && <div className="text-xs text-slate-500 mt-1">{hint}</div>}
    </div>
  );
}
