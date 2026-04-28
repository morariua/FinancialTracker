import { FormEvent, useEffect, useState } from 'react';
import { api, errorMessage } from '../api/client';
import { useAuth } from '../store/auth';
import type { Category } from '../api/types';

export default function SettingsPage() {
  const { settings, user, setSettings } = useAuth();
  const [income, setIncome] = useState('0');
  const [currency, setCurrency] = useState('USD');
  const [threshold, setThreshold] = useState('0.2');
  const [reminderDays, setReminderDays] = useState('3');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [newCatName, setNewCatName] = useState('');

  useEffect(() => {
    if (settings) {
      setIncome(String(settings.monthly_income ?? 0));
      setCurrency(settings.currency || 'USD');
      setThreshold(String(settings.low_budget_threshold ?? 0.2));
      setReminderDays(String(settings.bill_reminder_days ?? 3));
    }
  }, [settings]);

  const loadCats = async () => {
    const r = await api.get('/categories');
    setCategories(r.data);
  };
  useEffect(() => { loadCats(); }, []);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null); setMsg(null);
    try {
      await api.patch('/settings', {
        monthly_income: parseFloat(income),
        currency,
        low_budget_threshold: parseFloat(threshold),
        bill_reminder_days: parseInt(reminderDays, 10),
      });
      setSettings({
        monthly_income: parseFloat(income),
        currency,
        low_budget_threshold: parseFloat(threshold),
        bill_reminder_days: parseInt(reminderDays, 10),
      });
      setMsg('Settings saved.');
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const addCategory = async (e: FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    try {
      await api.post('/categories', { name: newCatName.trim(), kind: 'expense' });
      setNewCatName('');
      loadCats();
    } catch (e) {
      alert(errorMessage(e));
    }
  };

  const removeCat = async (id: string) => {
    if (!confirm('Delete this category? Existing transactions keep their data but lose the link.')) return;
    try {
      await api.delete(`/categories/${id}`);
      loadCats();
    } catch (e) {
      alert(errorMessage(e));
    }
  };

  const logoutAll = async () => {
    if (!confirm('Sign out of all sessions on every device?')) return;
    try {
      await api.post('/auth/logout-all');
      alert('Signed out of all sessions. Your other devices will be logged out shortly.');
    } catch (e) {
      alert(errorMessage(e));
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-slate-400 text-sm">Signed in as {user?.email}</p>
      </div>

      <form onSubmit={save} className="card p-5 space-y-4">
        <h2 className="font-semibold">Profile & finances</h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Monthly income</label>
            <input className="input" type="number" min="0" step="0.01" value={income} onChange={(e) => setIncome(e.target.value)} />
          </div>
          <div>
            <label className="label">Currency</label>
            <input className="input" maxLength={3} value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Low budget threshold (%)</label>
            <input className="input" type="number" min="0" max="1" step="0.05" value={threshold} onChange={(e) => setThreshold(e.target.value)} />
            <p className="text-xs text-slate-500 mt-1">Alert when remaining budget falls below this fraction.</p>
          </div>
          <div>
            <label className="label">Bill reminder days</label>
            <input className="input" type="number" min="0" max="30" value={reminderDays} onChange={(e) => setReminderDays(e.target.value)} />
            <p className="text-xs text-slate-500 mt-1">Days ahead of due date to receive a reminder.</p>
          </div>
        </div>
        {err && <div className="text-sm text-red-400">{err}</div>}
        {msg && <div className="text-sm text-good">{msg}</div>}
        <div>
          <button className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>

      <div className="card p-5 space-y-3">
        <h2 className="font-semibold">Categories</h2>
        <form onSubmit={addCategory} className="flex gap-2">
          <input className="input" placeholder="Add category" value={newCatName} onChange={(e) => setNewCatName(e.target.value)} />
          <button className="btn-primary">Add</button>
        </form>
        <div className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <span key={c.id} className="pill bg-panelMuted text-slate-300">
              <span className="w-2 h-2 rounded-full mr-1" style={{ background: c.color || '#64748b' }} />
              {c.name}
              <button className="ml-2 text-slate-500 hover:text-bad" onClick={() => removeCat(c.id)}>×</button>
            </span>
          ))}
        </div>
      </div>

      <div className="card p-5 space-y-3 border border-bad/30">
        <h2 className="font-semibold text-bad">Security</h2>
        <p className="text-sm text-slate-400">Sign out of every device. You'll need to log in again everywhere.</p>
        <button className="btn-danger" onClick={logoutAll}>Sign out of all sessions</button>
      </div>
    </div>
  );
}
