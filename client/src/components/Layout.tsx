import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import type { Permission } from '../lib/permissions';
import { Pill } from './ui';
import Velaris from './ui/velaris';

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
  { to: '/intelligence', label: 'Intelligence Graph', permission: 'VIEW_INTELLIGENCE' },
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

/**
 * Velaris aurora palette, tuned to the ForenSys blue/amber brand.
 * Module-level so the array identity stays stable: the Velaris shader
 * re-initialises its WebGL program whenever the `colors` prop changes.
 */
const AURORA_BG = '#070b16';
const AURORA_COLORS = ['#3f5a86', '#0ea5e9', '#d97706', '#1a2740'];

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
      {/*
       * Velaris aurora: a fixed, click-through WebGL background. It lives in its
       * own wrapper div whose positioning is set with INLINE styles — inline
       * `position/inset/zIndex` cannot be overridden by the component's own
       * className/style props, so the canvas can never leak into document flow
       * and push the page content down.
       */}
      <div
        aria-hidden="true"
        className="pointer-events-none"
        style={{ position: 'fixed', inset: 0, zIndex: -10 }}
      >
        <Velaris
          bg={AURORA_BG}
          colors={AURORA_COLORS}
          speed={1.5}
          grain={0.25}
          height="100%"
        />
      </div>

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
                  `border-b-2 px-3 py-2 text-sm transition-colors ${isActive
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
          ForenSys- "Trust me, its Insane!"
        </p>
      </footer>
    </div>
  );
}
