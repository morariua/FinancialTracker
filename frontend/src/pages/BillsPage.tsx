import { FormEvent, useEffect, useState } from 'react';
import { api, errorMessage } from '../api/client';
import type { Account, Bill, Category } from '../api/types';
import { money } from '../utils/format';
import { Modal } from '../components/Modal';

export default function BillsPage() {
  const [bills, setBills] = useState<Bill[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Bill | null>(null);

  const load = async () => {
    const [b, a, c] = await Promise.all([
      api.get('/bills'), api.get('/accounts'), api.get('/categories'),
    ]);
    setBills(b.data); setAccounts(a.data); setCategories(c.data);
  };
  useEffect(() => { load(); }, []);

  const total = bills.reduce((s, b) => s + b.amount, 0);

  const markPaid = async (b: Bill) => {
    if (!confirm(`Mark ${b.name} as paid?`)) return;
    try {
      await api.post(`/bills/${b.id}/mark-paid`);
      load();
    } catch (e) {
      alert(errorMessage(e));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Bills & subscriptions</h1>
          <p className="text-slate-400 text-sm">{bills.length} active · {money(total)} per month</p>
        </div>
        <button className="btn-primary" onClick={() => setOpen(true)}>+ Add bill</button>
      </div>

      {bills.length === 0 ? (
        <div className="card p-10 text-center text-slate-400">No bills yet.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {bills.map((b) => (
            <div key={b.id} className="card p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-medium">{b.name}</div>
                  <div className="text-xs text-slate-400 mt-1">
                    Due day {b.due_day}{b.account_name ? ` · ${b.account_name}` : ''}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold">{money(b.amount)}</div>
                  {b.last_paid_month && <div className="text-xs text-good">Paid {b.last_paid_month}</div>}
                </div>
              </div>
              {b.category_name && (
                <span className="pill mt-2" style={{ background: (b.category_color || '#334155') + '33', color: b.category_color || '#94a3b8' }}>
                  {b.category_name}
                </span>
              )}
              <div className="flex gap-2 mt-3">
                <button className="btn-ghost flex-1 text-sm" onClick={() => setEditing(b)}>Edit</button>
                <button className="btn-primary flex-1 text-sm" onClick={() => markPaid(b)}>Mark paid</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <BillFormModal
        open={open}
        onClose={() => setOpen(false)}
        onSaved={load}
        accounts={accounts}
        categories={categories}
      />
      <BillFormModal
        open={!!editing}
        onClose={() => setEditing(null)}
        onSaved={load}
        accounts={accounts}
        categories={categories}
        bill={editing || undefined}
      />
    </div>
  );
}

function BillFormModal({
  open, onClose, onSaved, accounts, categories, bill,
}: {
  open: boolean; onClose: () => void; onSaved: () => void;
  accounts: Account[]; categories: Category[]; bill?: Bill;
}) {
  const [form, setForm] = useState({
    name: '', amount: '', due_day: '1', category_id: '', account_id: '', autopay: false,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setErr(null);
      if (bill) {
        setForm({
          name: bill.name,
          amount: String(bill.amount),
          due_day: String(bill.due_day),
          category_id: bill.category_id || '',
          account_id: bill.account_id || '',
          autopay: !!bill.autopay,
        });
      } else {
        setForm({ name: '', amount: '', due_day: '1', category_id: '', account_id: '', autopay: false });
      }
    }
  }, [open, bill]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const payload = {
        name: form.name,
        amount: parseFloat(form.amount),
        due_day: parseInt(form.due_day, 10),
        category_id: form.category_id || null,
        account_id: form.account_id || null,
        autopay: form.autopay,
      };
      if (bill) await api.patch(`/bills/${bill.id}`, payload);
      else await api.post('/bills', payload);
      onSaved(); onClose();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!bill) return;
    if (!confirm('Delete this bill?')) return;
    setBusy(true);
    try {
      await api.delete(`/bills/${bill.id}`);
      onSaved(); onClose();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={bill ? 'Edit bill' : 'Add bill'}>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="label">Name</label>
          <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Amount</label>
            <input className="input" type="number" min="0" step="0.01" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </div>
          <div>
            <label className="label">Due day</label>
            <input className="input" type="number" min="1" max="31" required value={form.due_day} onChange={(e) => setForm({ ...form, due_day: e.target.value })} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Category</label>
            <select className="input" value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
              <option value="">—</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Account</label>
            <select className="input" value={form.account_id} onChange={(e) => setForm({ ...form, account_id: e.target.value })}>
              <option value="">—</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        </div>
        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.autopay} onChange={(e) => setForm({ ...form, autopay: e.target.checked })} />
          On autopay
        </label>
        {err && <div className="text-sm text-red-400">{err}</div>}
        <div className="flex justify-between gap-2 pt-2">
          {bill ? (
            <button type="button" className="btn-danger" onClick={remove} disabled={busy}>Delete</button>
          ) : <span />}
          <div className="flex gap-2">
            <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
