import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { useAuth } from '../auth/AuthContext';
import { CASE_STATUSES, STATUS_LABELS } from '../lib/permissions';
import type { CaseSummary } from '../lib/types';
import { EmptyState, ErrorBanner, PageHeader, Spinner, StatusPill, formatDateTime } from '../components/ui';

export function CasesPage() {
  const { officer, can } = useAuth();
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');

  const { data, error, loading, reload } = useAsync(
    () => {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (appliedSearch) params.set('q', appliedSearch);
      const qs = params.toString();
      return api.get<{ cases: CaseSummary[] }>(`/api/cases${qs ? `?${qs}` : ''}`);
    },
    [status, appliedSearch],
  );

  const mine = officer ? data?.cases.filter((c) => c.leadOfficerId === officer.officerId) : [];

  return (
    <>
      <PageHeader
        title="Cases"
        subtitle="Open a case to see its full evidence, custody and status-change timeline."
        actions={
          can('CREATE_CASE') && (
            <Link to="/cases/new" className="fs-btn-primary">
              + Create Crime Report
            </Link>
          )
        }
      />

      <div className="fs-card mb-4">
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setAppliedSearch(search.trim());
          }}
        >
          <div className="min-w-[16rem] flex-1">
            <label className="fs-label" htmlFor="search">
              Search
            </label>
            <input
              id="search"
              className="fs-input"
              placeholder="Title, case ID or location…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div>
            <label className="fs-label" htmlFor="status">
              Status
            </label>
            <select
              id="status"
              className="fs-input"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">All statuses</option>
              {CASE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s] ?? s}
                </option>
              ))}
            </select>
          </div>

          <button type="submit" className="fs-btn-secondary">
            Apply
          </button>
          {(status || appliedSearch) && (
            <button
              type="button"
              className="fs-btn-secondary"
              onClick={() => {
                setStatus('');
                setSearch('');
                setAppliedSearch('');
              }}
            >
              Clear
            </button>
          )}
        </form>
      </div>

      {officer && (
        <p className="mb-3 text-sm text-slate-500">
          {mine && mine.length > 0
            ? `${mine.length} of the listed case(s) are led by you.`
            : 'None of the listed cases are assigned to you as lead officer.'}
        </p>
      )}

      <ErrorBanner error={error} onRetry={reload} />

      {loading ? (
        <Spinner label="Loading cases…" />
      ) : !data || data.cases.length === 0 ? (
        <EmptyState title="No cases match these filters." hint="Try clearing the search or status filter." />
      ) : (
        <div className="fs-table-card overflow-x-auto p-0">
          <table className="min-w-full divide-y divide-white/10">
            <thead className="bg-white/5">
              <tr>
                <th className="fs-th">Case ID</th>
                <th className="fs-th">Title</th>
                <th className="fs-th">Incident</th>
                <th className="fs-th">Location</th>
                <th className="fs-th">Lead officer</th>
                <th className="fs-th">Evidence</th>
                <th className="fs-th">Status</th>
                <th className="fs-th" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {data.cases.map((c) => (
                <tr key={c.caseId} className="hover:bg-white/5">
                  <td className="fs-td font-mono text-xs text-sky-300">{c.caseId}</td>
                  <td className="fs-td font-medium text-white">{c.title}</td>
                  <td className="fs-td whitespace-nowrap">{formatDateTime(c.incidentTimestamp)}</td>
                  <td className="fs-td font-mono text-xs">{c.locationPoint}</td>
                  <td className="fs-td">{c.leadOfficer?.fullName ?? c.leadOfficerId}</td>
                  <td className="fs-td">{c.evidenceCount ?? 0}</td>
                  <td className="fs-td">
                    <StatusPill status={c.status} />
                  </td>
                  <td className="fs-td text-right">
                    <Link to={`/cases/${c.caseId}`} className="font-medium text-sky-300 hover:underline">
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
