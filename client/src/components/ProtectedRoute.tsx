import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import type { Permission } from '../lib/permissions';
import { Spinner } from './ui';

/**
 * Guards a route by session and (optionally) permission.
 *
 * This is convenience only -- navigating around it just produces a 403 from the
 * API, which is where the real enforcement lives.
 */
export function ProtectedRoute({
  permission,
  children,
}: {
  permission?: Permission;
  children: ReactNode;
}) {
  const { officer, loading, can } = useAuth();
  const location = useLocation();

  if (loading) return <Spinner label="Restoring session…" />;

  if (!officer) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  if (permission && !can(permission)) {
    return (
      <div className="fs-card mx-auto max-w-lg text-center">
        <h2 className="text-lg font-semibold text-forensic-900">Access denied</h2>
        <p className="mt-2 text-sm text-slate-600">
          Your role (<strong>{officer.role}</strong>) is not permitted to open this page.
        </p>
        <p className="mt-1 text-xs text-slate-400">
          The server enforces this independently — the check here is only navigation.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
