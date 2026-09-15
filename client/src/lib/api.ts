/**
 * Thin fetch wrapper around the ForenSys API.
 *
 * Tokens live in localStorage. On a 401 the client tries the refresh endpoint
 * exactly once, then replays the original request; if refresh also fails the
 * session is cleared and the app falls back to the login screen.
 */

const BASE = import.meta.env.VITE_API_URL ?? '';

const ACCESS_KEY = 'forensys.accessToken';
const REFRESH_KEY = 'forensys.refreshToken';

export const tokenStore = {
  get access() {
    return localStorage.getItem(ACCESS_KEY);
  },
  get refresh() {
    return localStorage.getItem(REFRESH_KEY);
  },
  set(access: string, refresh: string) {
    localStorage.setItem(ACCESS_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code = 'error',
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Notified when the session is lost, so the app can redirect to /login. */
let onSessionExpired: (() => void) | null = null;
export function setSessionExpiredHandler(fn: () => void) {
  onSessionExpired = fn;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  /** Multipart upload; skips JSON headers and passes the FormData through. */
  form?: FormData;
  /** Internal: prevents an infinite refresh loop. */
  isRetry?: boolean;
}

async function rawRequest(path: string, options: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = {};
  const token = tokenStore.access;
  if (token) headers.Authorization = `Bearer ${token}`;

  let body: BodyInit | undefined;
  if (options.form) {
    body = options.form;
  } else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }

  return fetch(`${BASE}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body,
  });
}

async function tryRefresh(): Promise<boolean> {
  const refreshToken = tokenStore.refresh;
  if (!refreshToken) return false;

  try {
    const res = await fetch(`${BASE}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return false;

    const data = (await res.json()) as { accessToken: string; refreshToken: string };
    tokenStore.set(data.accessToken, data.refreshToken);
    return true;
  } catch {
    return false;
  }
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const res = await rawRequest(path, options);

  if (res.status === 401 && !options.isRetry) {
    if (await tryRefresh()) {
      return request<T>(path, { ...options, isRetry: true });
    }
    tokenStore.clear();
    onSessionExpired?.();
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  if (!res.ok) {
    const err = payload as { message?: string; error?: string; details?: unknown } | null;
    throw new ApiError(
      res.status,
      err?.message ?? `Request failed with status ${res.status}.`,
      err?.error ?? 'error',
      err?.details,
    );
  }

  return payload as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  upload: <T>(path: string, form: FormData) => request<T>(path, { method: 'POST', form }),
};
