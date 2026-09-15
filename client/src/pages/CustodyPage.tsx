import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { useAuth } from '../auth/AuthContext';
import type { CaseSummary, CustodyLog, Officer } from '../lib/types';
import { EmptyState, ErrorBanner, PageHeader, Pill, Spinner, formatDateTime } from '../components/ui';

/**
 * Use case 4: Log Chain of Custody.
 *
 * The current holder is derived from the most recent CUSTODY_LOG row and shown
 * before submitting, so the operator can see who the item is being released from.
 * The server independently rejects a transfer whose releaser is not the holder.
 */
export function CustodyPage() {
  const { officer } = useAuth();
  const [params] = useSearchParams();

  const [caseId, setCaseId] = useState('');
  const [evidenceId, setEvidenceId] = useState(params.get('evidenceId') ?? '');
  const [releasedById, setReleasedById] = useState('');
  const [receivedById, setReceivedById] = useState('');
  const [mongoDocRef, setMongoDocRef] = useState('');
  const [transferTimestamp, setTransferTimestamp] = useState(() => {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  });

  const [error, setError] = useState<unknown>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const cases = useAsync(() => api.get<{ cases: CaseSummary[] }>('/api/cases'), []);
  const officers = useAsync(() => api.get<{ officers: Officer[] }>('/api/officers'), []);

  // Every evidence item, so a preselected ?evidenceId= can be resolved.
  const allEvidence = useAsync(() => api.get<{ evidence: { evidenceId: string; caseId: string; evidenceType: string }[] }>('/api/evidence'), []);

  const evidenceForCase = useMemo(() => {
    const items = allEvidence.data?.evidence ?? [];
    return caseId ? items.filter((e) => e.caseId === caseId) : items;
  }, [allEvidence.data, caseId]);

  // If a transfer was deep-linked, derive the case from the evidence item.
  useEffect(() => {
    if (caseId || !evidenceId) return;
    const found = (allEvidence.data?.evidence ?? []).find((e) => e.evidenceId === evidenceId);
    if (found) setCaseId(found.caseId);
  }, [allEvidence.data, evidenceId, caseId]);

  // Who holds it right now.
  const holder = useAsync(
    () =>
      evidenceId
        ? api.get<{ currentHolder: Officer | null }>(`/api/custody/holder/${evidenceId}`)
        : Promise.resolve({ currentHolder: null }),
    [evidenceId],
  );

  const currentHolder = holder.data?.currentHolder ?? null;

  // Default the releasing officer to whoever actually holds the item. When it
  // has never been transferred there is no holder yet, so default to the signed-in
  // officer -- they are the one logging the first movement.
  useEffect(() => {
    if (currentHolder) setReleasedById(currentHolder.officerId);
    else if (officer) setReleasedById(officer.officerId);
  }, [currentHolder, officer]);

  const history = useAsync(
    () => api.get<{ custodyLogs: CustodyLog[] }>(`/api/custody?evidenceId=${evidenceId}`),
    [evidenceId, success],
  );

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);

    try {
      const res = await api.post<{ custodyLog: CustodyLog; currentHolder: Officer }>('/api/custody', {
        evidenceId,
        releasedById,
        receivedById,
        transferTimestamp: new Date(transferTimestamp).toISOString(),
        ...(mongoDocRef.trim() ? { mongoDocRef: mongoDocRef.trim() } : {}),
      });
      setSuccess(`Transfer ${res.custodyLog.logId} logged. ${evidenceId} is now held by ${res.currentHolder.fullName}.`);
      setMongoDocRef('');
      holder.reload();
      history.reload();
      allEvidence.reload();
    } catch (err) {
      setError(err);
    } finally {
      setSubmitting(false);
    }
  }

  if (cases.loading || officers.loading) return <Spinner label="Loading…" />;

  return (
    <>
      <PageHeader
        title="Log Chain of Custody"
        subtitle="Records an evidence transfer between two officers. The current holder is derived from the latest log entry."
      />

      {success && (
        <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {success}
        </div>
      )}
      <ErrorBanner error={error} />
      <ErrorBanner error={cases.error ?? officers.error ?? allEvidence.error} />

      <div className="grid gap-4 lg:grid-cols-3">
        <form className="fs-card space-y-4 lg:col-span-2" onSubmit={handleSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="fs-label" htmlFor="case">
                Case
              </label>
              <select
                id="case"
                className="fs-input"
                value={caseId}
                onChange={(e) => {
                  setCaseId(e.target.value);
                  setEvidenceId('');
                }}
              >
                <option value="">All cases</option>
                {(cases.data?.cases ?? []).map((c) => (
                  <option key={c.caseId} value={c.caseId}>
                    {c.caseId} — {c.title}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="fs-label" htmlFor="evidence">
                Evidence item <span className="text-red-600">*</span>
              </label>
              <select
                id="evidence"
                className="fs-input"
                value={evidenceId}
                onChange={(e) => setEvidenceId(e.target.value)}
                required
              >
                <option value="">Select an evidence item…</option>
                {evidenceForCase.map((e) => (
                  <option key={e.evidenceId} value={e.evidenceId}>
                    {e.evidenceId} — {e.evidenceType}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {evidenceId && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
              <p className="font-medium text-amber-900">Current holder</p>
              {holder.loading ? (
                <p className="text-amber-800">Checking…</p>
              ) : currentHolder ? (
                <p className="text-amber-800">
                  {currentHolder.fullName} ({currentHolder.badgeNumber}) — must be the releasing officer.
                </p>
              ) : (
                <p className="text-amber-800">
                  No transfers yet, so any officer may release this item.
                </p>
              )}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="fs-label" htmlFor="releasedBy">
                Released by <span className="text-red-600">*</span>
              </label>
              <select
                id="releasedBy"
                className="fs-input"
                value={releasedById}
                onChange={(e) => setReleasedById(e.target.value)}
                required
              >
                <option value="">Select officer…</option>
                {(officers.data?.officers ?? []).map((o) => (
                  <option key={o.officerId} value={o.officerId}>
                    {o.fullName} ({o.badgeNumber}) — {o.role}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="fs-label" htmlFor="receivedBy">
                Received by <span className="text-red-600">*</span>
              </label>
              <select
                id="receivedBy"
                className="fs-input"
                value={receivedById}
                onChange={(e) => setReceivedById(e.target.value)}
                required
              >
                <option value="">Select officer…</option>
                {(officers.data?.officers ?? [])
                  .filter((o) => o.officerId !== releasedById)
                  .map((o) => (
                    <option key={o.officerId} value={o.officerId}>
                      {o.fullName} ({o.badgeNumber}) — {o.role}
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label className="fs-label" htmlFor="transferTimestamp">
                Transfer date &amp; time
              </label>
              <input
                id="transferTimestamp"
                type="datetime-local"
                className="fs-input"
                value={transferTimestamp}
                onChange={(e) => setTransferTimestamp(e.target.value)}
              />
            </div>

            <div>
              <label className="fs-label" htmlFor="mongoDocRef">
                Document reference
              </label>
              <input
                id="mongoDocRef"
                className="fs-input font-mono text-xs"
                placeholder="65b2f11a9a8c123456789a01"
                value={mongoDocRef}
                onChange={(e) => setMongoDocRef(e.target.value)}
              />
              <p className="mt-1 text-xs text-slate-500">
                Stored in <code>mongo_doc_ref</code>: an external ObjectId or a report pointer.
              </p>
            </div>
          </div>

          <div className="flex gap-3 pt-1">
            <button type="submit" className="fs-btn-primary" disabled={submitting || !evidenceId}>
              {submitting ? 'Logging…' : 'Log transfer'}
            </button>
          </div>
        </form>

        <div className="fs-card">
          <h2 className="mb-3 font-semibold text-forensic-900">Transfer history</h2>

          {!evidenceId ? (
            <EmptyState title="Select an evidence item." hint="Its full custody chain will appear here." />
          ) : history.loading ? (
            <Spinner label="Loading history…" />
          ) : (history.data?.custodyLogs.length ?? 0) === 0 ? (
            <EmptyState title="No transfers recorded." />
          ) : (
            <ol className="space-y-3">
              {history.data!.custodyLogs.map((log) => (
                <li key={log.logId} className="rounded-md border border-slate-200 px-3 py-2">
                  <p className="text-sm">
                    <span className="font-medium">{log.releasedBy?.fullName}</span>
                    <span className="mx-1 text-slate-400">→</span>
                    <span className="font-medium">{log.receivedBy?.fullName}</span>
                  </p>
                  <p className="text-xs text-slate-500">{formatDateTime(log.transferTimestamp)}</p>
                  {log.mongoDocRef && (
                    <p className="mt-1">
                      <Pill tone="slate">{log.mongoDocRef}</Pill>
                    </p>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </>
  );
}
