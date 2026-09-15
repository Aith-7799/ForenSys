import type { ReactNode } from 'react';
import { ApiError } from '../lib/api';
import { STATUS_LABELS } from '../lib/permissions';

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 py-8 text-slate-500">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-forensic-700" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function ErrorBanner({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  if (!error) return null;

  const message =
    error instanceof ApiError
      ? error.message
      : error instanceof Error
        ? error.message
        : String(error);

  const status = error instanceof ApiError ? error.status : undefined;

  return (
    <div
      role="alert"
      className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-medium">
            {status === 403 ? 'Not permitted' : status === 401 ? 'Authentication failed' : 'Request failed'}
          </p>
          <p className="mt-0.5">{message}</p>
        </div>
        {onRetry && (
          <button type="button" className="fs-btn-secondary shrink-0" onClick={onRetry}>
            Retry
          </button>
        )}
      </div>
    </div>
  );
}

const STATUS_STYLES: Record<string, string> = {
  open: 'bg-sky-100 text-sky-800 border-sky-200',
  under_investigation: 'bg-amber-100 text-amber-800 border-amber-200',
  in_court: 'bg-violet-100 text-violet-800 border-violet-200',
  closed: 'bg-slate-200 text-slate-700 border-slate-300',
  archived: 'bg-slate-100 text-slate-500 border-slate-200',
};

export function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${
        STATUS_STYLES[status] ?? 'bg-slate-100 text-slate-700 border-slate-200'
      }`}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

export function Pill({ children, tone = 'slate' }: { children: ReactNode; tone?: 'slate' | 'green' | 'indigo' | 'rose' }) {
  const tones = {
    slate: 'bg-slate-100 text-slate-700 border-slate-200',
    green: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    indigo: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    rose: 'bg-rose-100 text-rose-800 border-rose-200',
  } as const;

  return (
    <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center">
      <p className="text-sm font-medium text-slate-600">{title}</p>
      {hint && <p className="mt-1 text-sm text-slate-500">{hint}</p>}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-forensic-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
