import { useState, type FormEvent } from 'react';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { useAuth } from '../auth/AuthContext';
import type { Officer, Role } from '../lib/types';
import { ErrorBanner, PageHeader, Pill, Spinner } from '../components/ui';

const ALL_ROLES: Role[] = [
  'Investigating Officer',
  'Lab Analyst',
  'System Administrator',
  'Judicial Authority',
];

const ROLE_TONE: Record<Role, 'green' | 'indigo' | 'rose' | 'slate'> = {
  'Investigating Officer': 'indigo',
  'Lab Analyst': 'green',
  'System Administrator': 'rose',
  'Judicial Authority': 'slate',
};

/**
 * System Administrator duties beyond the seven ellipses: authenticate and
 * manage users. Every write here is gated by the MANAGE_USERS permission on the
 * server, so this page is inert for any other role.
 */
export function UsersPage() {
  const { officer: me } = useAuth();

  const [badgeNumber, setBadgeNumber] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<Role>('Investigating Officer');
  const [password, setPassword] = useState('');

  const [error, setError] = useState<unknown>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const officers = useAsync(() => api.get<{ officers: Officer[] }>('/api/officers'), [success]);

  async function createUser(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setBusy(true);

    try {
      const res = await api.post<{ officer: Officer }>('/api/officers', {
        badgeNumber: badgeNumber.trim(),
        fullName: fullName.trim(),
        role,
        password,
      });
      setSuccess(`Created ${res.officer.fullName} (${res.officer.badgeNumber}) as ${res.officer.role}.`);
      setBadgeNumber('');
      setFullName('');
      setPassword('');
      officers.reload();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(target: Officer, nextRole: string) {
    setError(null);
    setSuccess(null);
    try {
      await api.patch(`/api/officers/${target.officerId}`, { role: nextRole });
      setSuccess(`${target.fullName} is now a ${nextRole}.`);
      officers.reload();
    } catch (err) {
      setError(err);
    }
  }

  async function resetPassword(target: Officer) {
    const next = window.prompt(`New password for ${target.fullName} (minimum 8 characters):`);
    if (!next) return;
    setError(null);
    setSuccess(null);
    try {
      await api.post(`/api/officers/${target.officerId}/password`, { password: next });
      setSuccess(`Password reset for ${target.fullName}.`);
    } catch (err) {
      setError(err);
    }
  }

  async function removeUser(target: Officer) {
    if (!window.confirm(`Delete ${target.fullName} (${target.badgeNumber})?`)) return;
    setError(null);
    setSuccess(null);
    try {
      await api.delete(`/api/officers/${target.officerId}`);
      setSuccess(`Deleted ${target.fullName}.`);
      officers.reload();
    } catch (err) {
      setError(err);
    }
  }

  return (
    <>
      <PageHeader
        title="Manage Users"
        subtitle="Create officer accounts and assign the role that drives all access control."
      />

      {success && (
        <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {success}
        </div>
      )}
      <ErrorBanner error={error} />

      <div className="grid gap-4 lg:grid-cols-3">
        <form className="fs-card space-y-4" onSubmit={createUser}>
          <h2 className="font-semibold text-forensic-900">New officer</h2>

          <div>
            <label className="fs-label" htmlFor="badgeNumber">
              Badge number <span className="text-red-600">*</span>
            </label>
            <input
              id="badgeNumber"
              className="fs-input font-mono"
              placeholder="BADGE-9090"
              maxLength={50}
              value={badgeNumber}
              onChange={(e) => setBadgeNumber(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="fs-label" htmlFor="fullName">
              Full name <span className="text-red-600">*</span>
            </label>
            <input
              id="fullName"
              className="fs-input"
              placeholder="Det. Jane Doe"
              maxLength={150}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="fs-label" htmlFor="role">
              Role <span className="text-red-600">*</span>
            </label>
            <select id="role" className="fs-input" value={role} onChange={(e) => setRole(e.target.value as Role)}>
              {ALL_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500">
              Must match the <code>chk_officers_role</code> constraint.
            </p>
          </div>

          <div>
            <label className="fs-label" htmlFor="password">
              Temporary password <span className="text-red-600">*</span>
            </label>
            <input
              id="password"
              type="password"
              className="fs-input"
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <p className="mt-1 text-xs text-slate-500">Hashed with bcrypt before storage.</p>
          </div>

          <button type="submit" className="fs-btn-primary w-full" disabled={busy}>
            {busy ? 'Creating…' : 'Create officer'}
          </button>
        </form>

        <div className="fs-card overflow-x-auto p-0 lg:col-span-2">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="font-semibold text-forensic-900">Officers</h2>
          </div>

          {officers.loading ? (
            <Spinner label="Loading officers…" />
          ) : (
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="fs-th">Badge</th>
                  <th className="fs-th">Name</th>
                  <th className="fs-th">Role</th>
                  <th className="fs-th" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(officers.data?.officers ?? []).map((o) => (
                  <tr key={o.officerId} className={o.officerId === me?.officerId ? 'bg-amber-50' : ''}>
                    <td className="fs-td font-mono text-xs">{o.badgeNumber}</td>
                    <td className="fs-td">
                      {o.fullName}
                      {o.officerId === me?.officerId && (
                        <span className="ml-2 text-xs text-amber-700">(you)</span>
                      )}
                    </td>
                    <td className="fs-td">
                      <div className="flex items-center gap-2">
                        <select
                          className="fs-input py-1 text-xs"
                          value={o.role}
                          onChange={(e) => changeRole(o, e.target.value)}
                        >
                          {ALL_ROLES.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                        <Pill tone={ROLE_TONE[o.role] ?? 'slate'}>{o.role.split(' ')[0]}</Pill>
                      </div>
                    </td>
                    <td className="fs-td text-right whitespace-nowrap">
                      <button
                        type="button"
                        className="text-xs font-medium text-forensic-600 hover:underline"
                        onClick={() => resetPassword(o)}
                      >
                        Reset password
                      </button>
                      <span className="mx-2 text-slate-300">|</span>
                      <button
                        type="button"
                        className="text-xs font-medium text-red-600 hover:underline"
                        onClick={() => removeUser(o)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
