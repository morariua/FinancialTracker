import { FormEvent, useEffect, useState } from 'react';
import { api, errorMessage } from '../api/client';
import type { Account } from '../api/types';
import { money } from '../utils/format';
import { Modal } from '../components/Modal';

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [open, setOpen] = useState(false);
  const [openLink, setOpenLink] = useState(false);
  const [plaidConfigured, setPlaidConfigured] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);

  const load = async () => {
    const [a, p] = await Promise.all([api.get('/accounts'), api.get('/plaid/status')]);
    setAccounts(a.data);
    setPlaidConfigured(!!p.data.configured);
  };
  useEffect(() => { load(); }, []);

  const total = accounts.reduce((s, a) => s + a.balance, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Accounts</h1>
          <p className="text-slate-400 text-sm">{accounts.length} accounts · net {money(total)}</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={() => setOpenLink(true)}>Link bank</button>
          <button className="btn-primary" onClick={() => setOpen(true)}>+ Manual account</button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {accounts.map((a) => (
          <div key={a.id} className="card p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">{a.name}</div>
                <div className="text-xs text-slate-400 capitalize">
                  {a.type}{a.institution ? ` · ${a.institution}` : ''}{a.mask ? ` · •••• ${a.mask}` : ''}
                </div>
              </div>
              <button className="text-xs text-slate-400 hover:text-white" onClick={() => setEditing(a)}>Edit</button>
            </div>
            <div className="text-2xl font-semibold mt-3">{money(a.balance, a.currency)}</div>
            {a.plaid_account_id && <div className="text-xs text-accent2 mt-1">Linked</div>}
          </div>
        ))}
      </div>

      <ManualAccountModal open={open} onClose={() => setOpen(false)} onSaved={load} />
      <ManualAccountModal open={!!editing} onClose={() => setEditing(null)} onSaved={load} account={editing || undefined} />
      <LinkBankModal open={openLink} onClose={() => setOpenLink(false)} onSaved={load} plaidConfigured={plaidConfigured} />
    </div>
  );
}

function ManualAccountModal({
  open, onClose, onSaved, account,
}: {
  open: boolean; onClose: () => void; onSaved: () => void; account?: Account;
}) {
  const [form, setForm] = useState({ name: '', type: 'checking', balance: '0', institution: '', mask: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setErr(null);
      if (account) {
        setForm({
          name: account.name,
          type: account.type,
          balance: String(account.balance),
          institution: account.institution || '',
          mask: account.mask || '',
        });
      } else {
        setForm({ name: '', type: 'checking', balance: '0', institution: '', mask: '' });
      }
    }
  }, [open, account]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const payload = {
        name: form.name, type: form.type, balance: parseFloat(form.balance),
        institution: form.institution || undefined, mask: form.mask || undefined,
      };
      if (account) await api.patch(`/accounts/${account.id}`, payload);
      else await api.post('/accounts', payload);
      onSaved(); onClose();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!account) return;
    if (!confirm('Delete this account?')) return;
    setBusy(true);
    try {
      await api.delete(`/accounts/${account.id}`);
      onSaved(); onClose();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={account ? 'Edit account' : 'Add account'}>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="label">Name</label>
          <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Type</label>
            <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              {['checking','savings','credit','cash','investment','loan'].map((t) =>
                <option key={t} value={t}>{t}</option>
              )}
            </select>
          </div>
          <div>
            <label className="label">Balance</label>
            <input className="input" type="number" step="0.01" required value={form.balance} onChange={(e) => setForm({ ...form, balance: e.target.value })} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Institution</label>
            <input className="input" value={form.institution} onChange={(e) => setForm({ ...form, institution: e.target.value })} />
          </div>
          <div>
            <label className="label">Mask (last 4)</label>
            <input className="input" maxLength={4} value={form.mask} onChange={(e) => setForm({ ...form, mask: e.target.value })} />
          </div>
        </div>
        {err && <div className="text-sm text-red-400">{err}</div>}
        <div className="flex justify-between gap-2 pt-2">
          {account ? <button type="button" className="btn-danger" onClick={remove} disabled={busy}>Delete</button> : <span />}
          <div className="flex gap-2">
            <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

function LinkBankModal({
  open, onClose, onSaved, plaidConfigured,
}: {
  open: boolean; onClose: () => void; onSaved: () => void; plaidConfigured: boolean;
}) {
  const [bank, setBank] = useState('My Bank');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const sandboxLink = async () => {
    setBusy(true); setErr(null);
    try {
      await api.post('/plaid/sandbox-link', {
        institution_name: bank,
        accounts: [
          { name: `${bank} Checking`, type: 'checking', balance: 2500, mask: '1234' },
          { name: `${bank} Savings`, type: 'savings', balance: 10000, mask: '5678' },
        ],
      });
      onSaved(); onClose();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Link bank account">
      <div className="space-y-3 text-sm">
        <p className="text-slate-300">
          Mobile transactions are linked via the <span className="font-semibold">Plaid</span> network — the same secure layer used by Venmo, Robinhood, and most major fintech apps. Plaid handles read-only OAuth with your bank; we only see metadata you authorize.
        </p>
        {plaidConfigured ? (
          <p className="text-good">Plaid is configured. Use the official Plaid Link UI in production builds.</p>
        ) : (
          <p className="text-warn">
            Plaid isn't configured. To enable real bank linking, set <code>PLAID_CLIENT_ID</code> and <code>PLAID_SECRET</code> in your <code>backend/.env</code>.
          </p>
        )}
        <div className="border-t border-border pt-3">
          <p className="font-medium">Demo / sandbox</p>
          <p className="text-slate-400">Provision a sandbox checking + savings pair to try the app end-to-end.</p>
          <div className="mt-2 flex gap-2 items-end">
            <div className="flex-1">
              <label className="label">Institution</label>
              <input className="input" value={bank} onChange={(e) => setBank(e.target.value)} />
            </div>
            <button className="btn-primary" onClick={sandboxLink} disabled={busy}>
              {busy ? 'Linking…' : 'Create sandbox accounts'}
            </button>
          </div>
        </div>
        {err && <div className="text-sm text-red-400">{err}</div>}
        <div className="flex justify-end pt-2">
          <button className="btn-ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </Modal>
  );
}
