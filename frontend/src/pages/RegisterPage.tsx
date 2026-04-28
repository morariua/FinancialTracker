import { FormEvent, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../store/auth';
import { errorMessage } from '../api/client';

export default function RegisterPage() {
  const { user, register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (user) return <Navigate to="/" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await register(email, password, name);
      navigate('/');
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const meets = {
    length: password.length >= 10,
    upper: /[A-Z]/.test(password),
    lower: /[a-z]/.test(password),
    number: /\d/.test(password),
  };

  return (
    <div className="min-h-full flex items-center justify-center p-6">
      <div className="card w-full max-w-md p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent to-accent2 flex items-center justify-center font-bold">F</div>
          <div>
            <div className="text-lg font-semibold">FinTracker</div>
            <div className="text-xs text-slate-400">Create your account</div>
          </div>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label">Name</label>
            <input className="input" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="label">Email</label>
            <input
              className="input"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Password</label>
            <input
              className="input"
              type="password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <ul className="mt-2 text-xs space-y-1">
              <li className={meets.length ? 'text-good' : 'text-slate-500'}>• At least 10 characters</li>
              <li className={meets.upper ? 'text-good' : 'text-slate-500'}>• Upper case letter</li>
              <li className={meets.lower ? 'text-good' : 'text-slate-500'}>• Lower case letter</li>
              <li className={meets.number ? 'text-good' : 'text-slate-500'}>• A number</li>
            </ul>
          </div>
          {err && <div className="text-sm text-red-400">{err}</div>}
          <button className="btn-primary w-full" disabled={busy}>
            {busy ? 'Creating account…' : 'Create account'}
          </button>
        </form>
        <p className="text-sm text-slate-400 mt-4">
          Already have an account? <Link to="/login" className="text-accent2 hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
