import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import type { Permission } from '../lib/permissions';
import { Pill } from './ui';

interface NavItem {
  to: string;
  label: string;
  permission: Permission;
}

/**
 * One entry per reachable use case. The `permission` gate hides links a role
 * cannot use, and ProtectedRoute re-checks the same permission on the route so a
 * hand-typed URL does not bypass it.
 */
const NAV: NavItem[] = [
  { to: '/cases', label: 'Cases & Timeline', permission: 'VIEW_CASE_DATA' },
  { to: '/custody', label: 'Chain of Custody', permission: 'LOG_CUSTODY' },
  { to: '/reports', label: 'Lab & Witness Reports', permission: 'UPLOAD_REPORT' },
  { to: '/dashboard', label: 'Analytics Dashboard', permission: 'VIEW_DASHBOARD' },
  { to: '/users', label: 'Manage Users', permission: 'MANAGE_USERS' },
];

const ROLE_TONE: Record<string, 'green' | 'indigo' | 'rose' | 'slate'> = {
  'Investigating Officer': 'indigo',
  'Lab Analyst': 'green',
  'System Administrator': 'rose',
  'Judicial Authority': 'slate',
};

export function Layout() {
  const { officer, logout, can } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const visible = NAV.filter((item) => can(item.permission));

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-slate-200 bg-forensic-900 text-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="text-lg font-semibold tracking-tight">ForenSys</span>
            <span className="hidden text-xs text-slate-300 sm:inline">
              Crime Scene Evidence &amp; Investigation Management
            </span>
          </div>

          {officer && (
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-sm font-medium">{officer.fullName}</p>
                <p className="text-xs text-slate-300">{officer.badgeNumber}</p>
              </div>
              <Pill tone={ROLE_TONE[officer.role] ?? 'slate'}>{officer.role}</Pill>
              <button type="button" className="fs-btn-secondary fs-btn" onClick={handleLogout}>
                Sign out
              </button>
            </div>
          )}
        </div>

        <nav className="border-t border-white/10 bg-forensic-900">
          <div className="mx-auto flex max-w-7xl flex-wrap gap-1 px-4">
            {visible.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `border-b-2 px-3 py-2 text-sm transition-colors ${
                    isActive
                      ? 'border-amber-400 font-medium text-white'
                      : 'border-transparent text-slate-300 hover:text-white'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </div>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
        <Outlet />
      </main>

      <footer className="border-t border-slate-200 bg-white px-4 py-3">
        <p className="mx-auto max-w-7xl text-xs text-slate-400">
          ForenSys — DBMS DA-2 implementation (Oracle 11g design ported to PostgreSQL)
        </p>
      </footer>
    </div>
  );
}
