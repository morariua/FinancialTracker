import { FormEvent, useEffect, useMemo, useState } from 'react';
import { api, errorMessage } from '../api/client';
import type { Account, Category, Transaction } from '../api/types';
import { money, todayISO } from '../utils/format';
import { Modal } from '../components/Modal';

export default function TransactionsPage() {
  const [items, setItems] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [openNew, setOpenNew] = useState(false);
  const [openCsv, setOpenCsv] = useState(false);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [editing, setEditing] = useState<Transaction | null>(null);

  const load = async () => {
    const [t, a, c] = await Promise.all([
      api.get('/transactions', { params: { search: search || undefined, category_id: filterCat || undefined } }),
      api.get('/accounts'),
      api.get('/categories'),
    ]);
    setItems(t.data);
    setAccounts(a.data);
    setCategories(c.data);
  };

  useEffect(() => {
    load();
  }, [search, filterCat]);

  const totals = useMemo(() => {
    let inc = 0, exp = 0;
    for (const t of items) {
      if (t.type === 'income') inc += t.amount;
      else if (t.type === 'expense') exp += t.amount;
    }
    return { inc, exp };
  }, [items]);

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Transactions</h1>
          <p className="text-slate-400 text-sm">{items.length} entries · spent {money(totals.exp)} · earned {money(totals.inc)}</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={() => setOpenCsv(true)}>Import CSV</button>
          <button className="btn-primary" onClick={() => setOpenNew(true)}>+ Add</button>
        </div>
      </div>

      <div className="card p-3 flex gap-2 flex-wrap">
        <input
          className="input max-w-xs"
          placeholder="Search description / merchant"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="input max-w-xs" value={filterCat} onChange={(e) => setFilterCat(e.target.value)}>
          <option value="">All categories</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      <div className="card overflow-x-auto scroll-thin">
        <table className="data">
          <thead>
            <tr>
              <th>Date</th>
              <th>Description</th>
              <th>Category</th>
              <th>Account</th>
              <th className="text-right">Amount</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr><td colSpan={6} className="text-center text-slate-500 py-6">No transactions yet.</td></tr>
            )}
            {items.map((t) => (
              <tr key={t.id} className="hover:bg-panelMuted/50">
                <td className="text-slate-400">{t.date}</td>
                <td>
                  <div>{t.description}</div>
                  {t.merchant && <div className="text-xs text-slate-500">{t.merchant}</div>}
                </td>
                <td>
                  {t.category_name ? (
                    <span className="pill" style={{ background: (t.category_color || '#334155') + '33', color: t.category_color || '#94a3b8' }}>
                      {t.category_name}
                    </span>
                  ) : <span className="text-slate-500 text-xs">—</span>}
                </td>
                <td className="text-slate-300">{t.account_name || '—'}</td>
                <td className={`text-right font-medium ${t.type === 'income' ? 'text-good' : 'text-slate-100'}`}>
                  {t.type === 'income' ? '+' : '-'} {money(t.amount)}
                </td>
                <td className="text-right">
                  <button className="text-xs text-slate-400 hover:text-white" onClick={() => setEditing(t)}>Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <NewTxModal open={openNew} onClose={() => setOpenNew(false)} onSaved={load} accounts={accounts} categories={categories} />
      <CsvImportModal open={openCsv} onClose={() => setOpenCsv(false)} onSaved={load} accounts={accounts} />
      <EditTxModal tx={editing} onClose={() => setEditing(null)} onSaved={load} categories={categories} accounts={accounts} />
    </div>
  );
}

function NewTxModal({
  open, onClose, onSaved, accounts, categories,
}: {
  open: boolean; onClose: () => void; onSaved: () => void; accounts: Account[]; categories: Category[];
}) {
  const [form, setForm] = useState({
    description: '', amount: '', date: todayISO(), type: 'expense' as 'expense' | 'income' | 'transfer',
    category_id: '', account_id: '', merchant: '', notes: '',
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (open) setForm({ description: '', amount: '', date: todayISO(), type: 'expense', category_id: '', account_id: '', merchant: '', notes: '' });
  }, [open]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const amt = parseFloat(form.amount);
      if (Number.isNaN(amt) || amt <= 0) throw new Error('Amount must be positive');
      await api.post('/transactions', {
        description: form.description,
        amount: amt,
        date: form.date,
        type: form.type,
        category_id: form.category_id || null,
        account_id: form.account_id || null,
        merchant: form.merchant || null,
        notes: form.notes || null,
      });
      onSaved();
      onClose();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Add transaction">
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="label">Description</label>
          <input className="input" required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Amount</label>
            <input className="input" type="number" min="0" step="0.01" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </div>
          <div>
            <label className="label">Date</label>
            <input className="input" type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Type</label>
            <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as 'expense' | 'income' | 'transfer' })}>
              <option value="expense">Expense</option>
              <option value="income">Income</option>
              <option value="transfer">Transfer</option>
            </select>
          </div>
          <div>
            <label className="label">Category</label>
            <select className="input" value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
              <option value="">—</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Account</label>
            <select className="input" value={form.account_id} onChange={(e) => setForm({ ...form, account_id: e.target.value })}>
              <option value="">—</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Merchant</label>
            <input className="input" value={form.merchant} onChange={(e) => setForm({ ...form, merchant: e.target.value })} />
          </div>
        </div>
        <div>
          <label className="label">Notes</label>
          <input className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
        {err && <div className="text-sm text-red-400">{err}</div>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Add'}</button>
        </div>
      </form>
    </Modal>
  );
}

function EditTxModal({
  tx, onClose, onSaved, accounts, categories,
}: {
  tx: Transaction | null; onClose: () => void; onSaved: () => void; accounts: Account[]; categories: Category[];
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState<{ category_id: string; account_id: string; description: string; amount: string }>({ category_id: '', account_id: '', description: '', amount: '' });

  useEffect(() => {
    if (tx) {
      setForm({
        category_id: tx.category_id || '',
        account_id: tx.account_id || '',
        description: tx.description,
        amount: String(tx.amount),
      });
    }
  }, [tx]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!tx) return;
    setBusy(true);
    setErr(null);
    try {
      await api.patch(`/transactions/${tx.id}`, {
        category_id: form.category_id || null,
        account_id: form.account_id || null,
        description: form.description,
        amount: parseFloat(form.amount),
      });
      onSaved();
      onClose();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!tx) return;
    if (!confirm('Delete this transaction?')) return;
    setBusy(true);
    try {
      await api.delete(`/transactions/${tx.id}`);
      onSaved();
      onClose();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={!!tx} onClose={onClose} title="Edit transaction">
      {tx && (
        <form onSubmit={save} className="space-y-3">
          <div>
            <label className="label">Description</label>
            <input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Amount</label>
              <input className="input" type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </div>
            <div>
              <label className="label">Category</label>
              <select className="input" value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
                <option value="">—</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="label">Account</label>
            <select className="input" value={form.account_id} onChange={(e) => setForm({ ...form, account_id: e.target.value })}>
              <option value="">—</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          {err && <div className="text-sm text-red-400">{err}</div>}
          <div className="flex justify-between gap-2 pt-2">
            <button type="button" className="btn-danger" onClick={remove} disabled={busy}>Delete</button>
            <div className="flex gap-2">
              <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
              <button className="btn-primary" disabled={busy}>Save</button>
            </div>
          </div>
        </form>
      )}
    </Modal>
  );
}

function CsvImportModal({
  open, onClose, onSaved, accounts,
}: {
  open: boolean; onClose: () => void; onSaved: () => void; accounts: Account[];
}) {
  const [csv, setCsv] = useState('');
  const [accountId, setAccountId] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setCsv('');
      setMsg(null);
      setErr(null);
    }
  }, [open]);

  const onFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => setCsv(String(reader.result || ''));
    reader.readAsText(file);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const r = await api.post('/transactions/import-csv', {
        csv,
        account_id: accountId || undefined,
      });
      setMsg(`Imported ${r.data.imported} transactions.`);
      onSaved();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Import CSV">
      <form onSubmit={submit} className="space-y-3">
        <p className="text-sm text-slate-400">
          Upload your bank CSV. Expected columns include <code>date</code>, <code>description</code>, and <code>amount</code> (or <code>debit</code>/<code>credit</code>).
        </p>
        <div>
          <label className="label">Account (optional)</label>
          <select className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">—</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">CSV file</label>
          <input
            type="file"
            accept=".csv,text/csv"
            className="block text-sm text-slate-300"
            onChange={(e) => e.target.files && e.target.files[0] && onFile(e.target.files[0])}
          />
        </div>
        <div>
          <label className="label">Or paste CSV</label>
          <textarea
            className="input font-mono text-xs h-32"
            placeholder="date,description,amount&#10;2024-04-01,Coffee,-3.50"
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
          />
        </div>
        {msg && <div className="text-sm text-good">{msg}</div>}
        {err && <div className="text-sm text-red-400">{err}</div>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Close</button>
          <button className="btn-primary" disabled={busy || !csv}>{busy ? 'Importing…' : 'Import'}</button>
        </div>
      </form>
    </Modal>
  );
}
