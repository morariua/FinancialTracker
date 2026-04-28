import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { Alert } from '../api/types';
import { dateLong } from '../utils/format';

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [showDismissed, setShowDismissed] = useState(false);

  const load = async () => {
    const r = await api.get('/alerts', { params: showDismissed ? { include_dismissed: 1 } : {} });
    setAlerts(r.data);
  };

  useEffect(() => { load(); }, [showDismissed]);

  const evaluate = async () => {
    await api.post('/alerts/evaluate');
    load();
  };

  const markRead = async () => {
    await api.post('/alerts/read-all');
    load();
  };

  const dismiss = async (id: string) => {
    await api.post(`/alerts/${id}/dismiss`);
    load();
  };

  const visible = alerts;

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Alerts</h1>
          <p className="text-slate-400 text-sm">Real-time notifications about your budgets and bills</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={evaluate}>Re-evaluate</button>
          <button className="btn-ghost" onClick={markRead}>Mark all read</button>
          <label className="inline-flex items-center gap-2 text-sm text-slate-300 ml-3">
            <input type="checkbox" checked={showDismissed} onChange={(e) => setShowDismissed(e.target.checked)} />
            Include dismissed
          </label>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="card p-10 text-center text-slate-400">No alerts. You're on track.</div>
      ) : (
        <ul className="space-y-2">
          {visible.map((a) => (
            <li key={a.id} className="card p-4 flex items-start justify-between gap-4">
              <div className="flex gap-3 items-start">
                <span
                  className={`mt-1 inline-block w-2.5 h-2.5 rounded-full ${
                    a.severity === 'critical' ? 'bg-bad' : a.severity === 'warning' ? 'bg-warn' : 'bg-accent2'
                  }`}
                />
                <div>
                  <div className={`font-medium ${a.read_at ? 'text-slate-400' : ''}`}>{a.title}</div>
                  <div className="text-sm text-slate-400 mt-0.5">{a.message}</div>
                  <div className="text-xs text-slate-500 mt-1">{dateLong(a.created_at)}</div>
                </div>
              </div>
              {!a.dismissed_at && (
                <button className="btn-ghost text-xs" onClick={() => dismiss(a.id)}>Dismiss</button>
              )}
              {a.dismissed_at && <span className="text-xs text-slate-500">dismissed</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
