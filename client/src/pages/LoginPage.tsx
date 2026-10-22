import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ErrorBanner, Spinner } from '../components/ui';
import Velaris from '../components/ui/velaris';

/**
 * Authentic officers loaded from real case files.
 */
const DEMO_ACCOUNTS = [
  { badgeNumber: 'IO-001', name: 'R.P. Shukla', role: 'Investigating Officer' },
  { badgeNumber: 'IO-002', name: 'PW30 Sub Inspector, Thidanadu PS', role: 'Investigating Officer' },
  { badgeNumber: 'IO-003', name: 'PW31 Circle Inspector, Erattupetta', role: 'Investigating Officer' },
  { badgeNumber: 'SA-001', name: 'SSP Srinagar', role: 'System Administrator' },
  { badgeNumber: 'IO-004', name: 'SHO Police Station Batamaloo', role: 'Investigating Officer' },
  { badgeNumber: 'IO-005', name: 'Harshal Raut, PSI Tulinj PS', role: 'Investigating Officer' },
  { badgeNumber: 'LA-001', name: 'Dr. Meera Nair', role: 'Lab Analyst' },
  { badgeNumber: 'JA-001', name: 'Judge Priya Mehta', role: 'Judicial Authority' },
];

const DEMO_PASSWORD = 'Forensys@123';

/** Velaris aurora palette for the login hero (module-level: stable identity). */
const LOGO_BG = '#0a1226';
const LOGO_COLORS = ['#3f5a86', '#0ea5e9', '#d97706', '#1a2740'];

export function LoginPage() {
  const { officer, loading, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [badgeNumber, setBadgeNumber] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);

  if (loading) return <Spinner label="Restoring session…" />;
  if (officer) {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from ?? '/cases'} replace />;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(badgeNumber.trim(), password);
      navigate('/cases', { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setSubmitting(false);
    }
  }

  function useDemoAccount(badge: string) {
    setBadgeNumber(badge);
    setPassword(DEMO_PASSWORD);
    setError(null);
  }

  return (
    <Velaris
      height="auto"
      className="flex min-h-full items-center justify-center px-4 py-10"
      bg={LOGO_BG}
      colors={LOGO_COLORS}
      speed={1.5}
      grain={0.3}
    >
      <div className="mx-auto grid w-full max-w-4xl overflow-hidden rounded-xl bg-white shadow-xl md:grid-cols-2">
        {/* Brand panel */}
        <div className="bg-forensic-900 px-8 py-10 text-white">
          <h1 className="text-3xl font-semibold tracking-tight">ForenSys</h1>
          <p className="mt-2 text-sm text-slate-300">
            Digital Crime Scene Evidence &amp; Investigation Management System
          </p>

          <ul className="mt-8 space-y-3 text-sm text-slate-300">
            <li className="flex gap-2">
              <span className="text-amber-400 font-bold">•</span> Register evidence with physical &amp; digital subtypes
            </li>
            <li className="flex gap-2">
              <span className="text-amber-400 font-bold">•</span> Tamper-evident chain-of-custody trail
            </li>
            <li className="flex gap-2">
              <span className="text-amber-400 font-bold">•</span> Database-enforced auditing on status changes
            </li>
            <li className="flex gap-2">
              <span className="text-amber-400 font-bold">•</span> Role-based access for officers, analysts &amp; admins
            </li>
          </ul>
        </div>

        {/* Form panel */}
        <div className="px-8 py-10">
          <h2 className="text-xl font-semibold text-forensic-900">Sign in</h2>
          <p className="mt-1 text-sm text-slate-500">Use your badge number and password.</p>

          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <ErrorBanner error={error} />

            <div>
              <label className="fs-label" htmlFor="badgeNumber">
                Badge number
              </label>
              <input
                id="badgeNumber"
                className="fs-input"
                autoComplete="username"
                placeholder="IO-001"
                value={badgeNumber}
                onChange={(e) => setBadgeNumber(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="fs-label" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                className="fs-input"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <button type="submit" className="fs-btn-primary w-full" disabled={submitting}>
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <div className="mt-8">
            <p className="text-xs font-medium tracking-wide text-slate-400 uppercase">
              Authorized Officer Accounts
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Password for all accounts: <code className="font-mono">{DEMO_PASSWORD}</code>
            </p>
            <ul className="mt-3 space-y-1">
              {DEMO_ACCOUNTS.map((account) => (
                <li key={account.badgeNumber}>
                  <button
                    type="button"
                    onClick={() => useDemoAccount(account.badgeNumber)}
                    className="w-full rounded-md border border-slate-200 px-3 py-2 text-left text-xs transition-colors hover:border-forensic-600 hover:bg-slate-50"
                  >
                    <span className="font-mono font-medium text-slate-700">{account.badgeNumber}</span>
                    <span className="ml-2 text-slate-500">{account.name}</span>
                    <span className="mt-0.5 block text-slate-400">{account.role}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </Velaris>
  );
}
