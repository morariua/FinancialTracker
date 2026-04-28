import { FormEvent, useEffect, useState } from 'react';
import { api, errorMessage } from '../api/client';
import type { Budget, Category } from '../api/types';
import { money, nowMonth, percent } from '../utils/format';
import { Modal } from '../components/Modal';

export default function BudgetsPage() {
  const [month, setMonth] = useState(nowMonth());
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [openAdd, setOpenAdd] = useState(false);
  const [openAlloc, setOpenAlloc] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    try {
      const [b, c] = await Promise.all([
        api.get(`/budgets?month=${month}`),
        api.get('/categories'),
      ]);
      setBudgets(b.data);
      setCategories(c.data);
    } catch (e) {
      setErr(errorMessage(e));
    }
  };
  useEffect(() => { load(); }, [month]);

  const totalBudget = budgets.reduce((s, b) => s + b.amount, 0);
  const totalSpent = budgets.reduce((s, b) => s + b.spent, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Budgets</h1>
          <p className="text-slate-400 text-sm">
            {budgets.length} categories · spent {money(totalSpent)} of {money(totalBudget)}
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <input type="month" className="input max-w-[10rem]" value={month} onChange={(e) => setMonth(e.target.value)} />
          <button className="btn-ghost" onClick={() => setOpenAlloc(true)}>Auto-allocate</button>
          <button className="btn-primary" onClick={() => setOpenAdd(true)}>+ Set budget</button>
        </div>
      </div>

      {err && <div className="text-red-400 text-sm">{err}</div>}

      {budgets.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="text-slate-300">No budgets for {month} yet.</p>
          <p className="text-slate-500 text-sm mt-1">Set your monthly income in Settings, then click Auto-allocate to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {budgets.map((b) => {
            const pct = b.amount > 0 ? Math.min(1, b.spent / b.amount) : 0;
            const remaining = b.amount - b.spent;
            const tone = pct >= 1 ? 'bg-bad' : pct >= 0.85 ? 'bg-warn' : 'bg-good';
            return (
              <div key={b.id} className="card p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: b.category_color }} />
                    <span className="font-medium">{b.category_name}</span>
                  </div>
                  <BudgetEditButton budget={b} onSaved={load} />
                </div>
                <div className="flex items-end justify-between mb-2">
                  <div>
                    <div className="text-2xl font-semibold">{money(b.spent)}</div>
                    <div className="text-xs text-slate-400">of {money(b.amount)}</div>
                  </div>
                  <div className={`text-sm ${remaining < 0 ? 'text-bad' : 'text-good'}`}>
                    {remaining < 0 ? `${money(Math.abs(remaining))} over` : `${money(remaining)} left`}
                  </div>
                </div>
                <div className="h-2 rounded-full bg-panelMuted overflow-hidden">
                  <div className={`h-full ${tone}`} style={{ width: `${Math.min(100, pct * 100)}%` }} />
                </div>
                <div className="text-xs text-slate-500 mt-1">{percent(pct)} used</div>
              </div>
            );
          })}
        </div>
      )}

      <BudgetAddModal
        open={openAdd}
        onClose={() => setOpenAdd(false)}
        onSaved={load}
        month={month}
        categories={categories}
        existing={new Set(budgets.map((b) => b.category_id))}
      />
      <AutoAllocateModal open={openAlloc} onClose={() => setOpenAlloc(false)} onSaved={load} month={month} />
    </div>
  );
}

function BudgetEditButton({ budget, onSaved }: { budget: Budget; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(budget.amount));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { setAmount(String(budget.amount)); }, [budget]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await api.put('/budgets', {
        category_id: budget.category_id, month: budget.month,
        amount: parseFloat(amount), rollover: !!budget.rollover,
      });
      setOpen(false);
      onSaved();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirm('Remove this budget?')) return;
    setBusy(true);
    try {
      await api.delete(`/budgets/${budget.id}`);
      setOpen(false);
      onSaved();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button onClick={() => setOpen(true)} className="text-xs text-slate-400 hover:text-white">Edit</button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Budget · ${budget.category_name}`}>
        <form onSubmit={save} className="space-y-3">
          <div>
            <label className="label">Amount</label>
            <input className="input" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          {err && <div className="text-sm text-red-400">{err}</div>}
          <div className="flex justify-between">
            <button type="button" className="btn-danger" onClick={remove} disabled={busy}>Remove</button>
            <div className="flex gap-2">
              <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
              <button className="btn-primary" disabled={busy}>Save</button>
            </div>
          </div>
        </form>
      </Modal>
    </>
  );
}

function BudgetAddModal({
  open, onClose, onSaved, month, categories, existing,
}: {
  open: boolean; onClose: () => void; onSaved: () => void; month: string;
  categories: Category[]; existing: Set<string>;
}) {
  const [categoryId, setCategoryId] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { if (open) { setCategoryId(''); setAmount(''); setErr(null); } }, [open]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      await api.put('/budgets', {
        category_id: categoryId, month, amount: parseFloat(amount), rollover: false,
      });
      onSaved(); onClose();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const available = categories.filter((c) => c.kind !== 'income' && !existing.has(c.id));

  return (
    <Modal open={open} onClose={onClose} title={`Set budget · ${month}`}>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="label">Category</label>
          <select className="input" required value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">—</option>
            {available.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Amount</label>
          <input className="input" type="number" min="0" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        {err && <div className="text-sm text-red-400">{err}</div>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={busy}>Save</button>
        </div>
      </form>
    </Modal>
  );
}

function AutoAllocateModal({
  open, onClose, onSaved, month,
}: {
  open: boolean; onClose: () => void; onSaved: () => void; month: string;
}) {
  const [strategy, setStrategy] = useState<'50-30-20'>('50-30-20');
  const [income, setIncome] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<{ income: number; allocations: Array<{ category_name: string; amount: number }> } | null>(null);

  useEffect(() => { if (open) { setIncome(''); setErr(null); setResult(null); } }, [open]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null); setResult(null);
    try {
      const body: Record<string, unknown> = { month, strategy };
      if (income) body.income = parseFloat(income);
      const r = await api.post('/budgets/auto-allocate', body);
      setResult(r.data);
      onSaved();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={`Auto-allocate · ${month}`}>
      <form onSubmit={submit} className="space-y-3">
        <p className="text-sm text-slate-400">
          Split your income across categories using a proven strategy.
        </p>
        <div>
          <label className="label">Strategy</label>
          <select className="input" value={strategy} onChange={(e) => setStrategy(e.target.value as '50-30-20')}>
            <option value="50-30-20">50/30/20 — 50% needs, 30% wants, 20% savings</option>
          </select>
        </div>
        <div>
          <label className="label">Override income (optional)</label>
          <input className="input" type="number" min="0" step="0.01" value={income} onChange={(e) => setIncome(e.target.value)} placeholder="Uses Settings income if blank" />
        </div>
        {err && <div className="text-sm text-red-400">{err}</div>}
        {result && (
          <div className="border border-border rounded-lg p-3 bg-panelMuted/30">
            <div className="text-sm mb-2">Allocated <span className="font-semibold">{money(result.income)}</span> across:</div>
            <ul className="space-y-1 text-sm">
              {result.allocations.map((a, i) => (
                <li key={i} className="flex justify-between">
                  <span>{a.category_name}</span>
                  <span className="text-slate-300">{money(a.amount)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Close</button>
          <button className="btn-primary" disabled={busy}>{busy ? 'Allocating…' : 'Allocate'}</button>
        </div>
      </form>
    </Modal>
  );
}
