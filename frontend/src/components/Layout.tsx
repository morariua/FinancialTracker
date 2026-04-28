import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../store/auth';
import { api } from '../api/client';

const links = [
  { to: '/', label: 'Dashboard', end: true, icon: '◎' },
  { to: '/transactions', label: 'Transactions', icon: '⇆' },
  { to: '/budgets', label: 'Budgets', icon: '◈' },
  { to: '/bills', label: 'Bills', icon: '⌖' },
  { to: '/accounts', label: 'Accounts', icon: '⛁' },
  { to: '/alerts', label: 'Alerts', icon: '⚑' },
  { to: '/settings', label: 'Settings', icon: '⚙' },
];

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let cancel = false;
    const refresh = async () => {
      try {
        await api.post('/alerts/evaluate');
        const r = await api.get('/alerts');
        if (!cancel) setUnread(r.data.filter((a: { read_at: number | null }) => !a.read_at).length);
      } catch { /* ignore */ }
    };
    refresh();
    const id = setInterval(refresh, 60_000);
    return () => {
      cancel = true;
      clearInterval(id);
    };
  }, []);

  const onLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-full flex">
      <aside className="w-60 shrink-0 border-r border-border bg-panel/60 backdrop-blur sticky top-0 h-screen flex flex-col">
        <div className="p-5 flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent to-accent2 flex items-center justify-center font-bold">F</div>
          <div className="font-semibold">FinTracker</div>
        </div>
        <nav className="flex-1 px-3 space-y-1">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) =>
                `flex items-center justify-between px-3 py-2 rounded-lg text-sm ${
                  isActive ? 'bg-accent/20 text-white' : 'text-slate-300 hover:bg-panelMuted'
                }`
              }
            >
              <span className="flex items-center gap-3">
                <span className="text-slate-400">{l.icon}</span>
                {l.label}
              </span>
              {l.to === '/alerts' && unread > 0 && (
                <span className="pill bg-bad text-white">{unread}</span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t border-border text-sm">
          <div className="text-slate-200 font-medium truncate">{user?.name}</div>
          <div className="text-slate-500 text-xs truncate">{user?.email}</div>
          <button onClick={onLogout} className="btn-ghost mt-3 w-full text-xs">
            Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 p-6 max-w-[1500px] mx-auto w-full">
        <Outlet />
      </main>
    </div>
  );
}
