import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, setSessionExpiredHandler, tokenStore } from '../lib/api';
import { roleHasPermission, type Permission } from '../lib/permissions';
import type { Officer } from '../lib/types';

interface AuthState {
  officer: Officer | null;
  /** True until the initial token check has finished, so routes don't flash. */
  loading: boolean;
  login: (badgeNumber: string, password: string) => Promise<Officer>;
  logout: () => Promise<void>;
  can: (permission: Permission) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [officer, setOfficer] = useState<Officer | null>(null);
  const [loading, setLoading] = useState(true);

  const logout = useCallback(async () => {
    try {
      if (tokenStore.access) await api.post('/api/auth/logout');
    } catch {
      // Stateless tokens: a failed logout call must not block clearing the session.
    }
    tokenStore.clear();
    setOfficer(null);
  }, []);

  // The API client calls this when a refresh attempt fails.
  useEffect(() => {
    setSessionExpiredHandler(() => setOfficer(null));
  }, []);

  // Restore the session from a stored token on first load.
  useEffect(() => {
    let cancelled = false;

    async function restore() {
      if (!tokenStore.access) {
        setLoading(false);
        return;
      }
      try {
        const res = await api.get<{ officer: Officer }>('/api/auth/me');
        if (!cancelled) setOfficer(res.officer);
      } catch {
        tokenStore.clear();
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void restore();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (badgeNumber: string, password: string) => {
    const res = await api.post<{ accessToken: string; refreshToken: string; officer: Officer }>(
      '/api/auth/login',
      { badgeNumber, password },
    );
    tokenStore.set(res.accessToken, res.refreshToken);
    setOfficer(res.officer);
    return res.officer;
  }, []);

  const can = useCallback(
    (permission: Permission) => roleHasPermission(officer?.role, permission),
    [officer],
  );

  const value = useMemo<AuthState>(
    () => ({ officer, loading, login, logout, can }),
    [officer, loading, login, logout, can],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside an AuthProvider.');
  return ctx;
}
