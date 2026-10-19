import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { useAuth } from '../auth/AuthContext';
import { CASE_STATUSES, STATUS_LABELS } from '../lib/permissions';
import type {
  CaseSummary,
  EvidenceItem,
  ReportItem,
  TimelineResponse,
  SimilarCaseItem,
  DuplicateEvidenceAlertItem,
} from '../lib/types';
import {
  EmptyState,
  ErrorBanner,
  PageHeader,
  Pill,
  Spinner,
  StatusPill,
  formatBytes,
  formatDateTime,
} from '../components/ui';

const EVENT_STYLES: Record<string, { dot: string; label: string }> = {
  case_registered: { dot: 'bg-sky-500', label: 'Case' },
  evidence_collected: { dot: 'bg-emerald-500', label: 'Evidence' },
  custody_transfer: { dot: 'bg-amber-500', label: 'Custody' },
  status_change: { dot: 'bg-violet-500', label: 'Status' },
};

type Tab = 'timeline' | 'evidence' | 'custody' | 'reports' | 'similar';

export function CaseDetailPage() {
  const { caseId = '' } = useParams();
  const { can } = useAuth();
  const [tab, setTab] = useState<Tab>('timeline');
  const [statusError, setStatusError] = useState<unknown>(null);
  const [expandedCaseId, setExpandedCaseId] = useState<string | null>(null);

  const timeline = useAsync(() => api.get<TimelineResponse>(`/api/cases/${caseId}/timeline`), [caseId]);
  const evidence = useAsync(() => api.get<{ evidence: EvidenceItem[] }>(`/api/evidence?caseId=${caseId}`), [caseId]);
  const reports = useAsync(() => api.get<{ reports: ReportItem[] }>(`/api/reports?caseId=${caseId}`), [caseId]);
  const similar = useAsync(
    () =>
      can('VIEW_INTELLIGENCE')
        ? api.get<{ similar: SimilarCaseItem[] }>(`/api/cases/${caseId}/similar?excludeClosed=false`)
        : Promise.resolve({ similar: [] }),
    [caseId, can('VIEW_INTELLIGENCE')],
  );
  const alerts = useAsync(
    () =>
      can('VIEW_INTELLIGENCE')
        ? api.get<{ alerts: DuplicateEvidenceAlertItem[] }>(`/api/alerts/duplicate-evidence?caseId=${caseId}`)
        : Promise.resolve({ alerts: [] }),
    [caseId, can('VIEW_INTELLIGENCE')],
  );

  const custodyLogs = (timeline.data?.timeline ?? []).filter((e) => e.kind === 'custody_transfer');
  const auditRows = timeline.data?.auditLog ?? [];

  if (timeline.loading) return <Spinner label="Loading case…" />;

  if (timeline.error) {
    return (
      <>
        <PageHeader title="Case" />
        <ErrorBanner error={timeline.error} onRetry={timeline.reload} />
      </>
    );
  }

  const theCase: CaseSummary | undefined = timeline.data?.case;

  async function changeStatus(next: string) {
    setStatusError(null);
    try {
      await api.patch(`/api/cases/${caseId}`, { status: next });
      timeline.reload();
      similar.reload();
    } catch (err) {
      setStatusError(err);
    }
  }

  const dupAlertsCount = alerts.data?.alerts?.length ?? 0;
  const similarCount = similar.data?.similar?.length ?? 0;

  const tabs: { id: Tab; label: string; count?: number; highlight?: boolean }[] = [
    { id: 'timeline', label: 'Timeline', count: timeline.data?.timeline.length },
    { id: 'evidence', label: 'Evidence', count: evidence.data?.evidence.length },
    { id: 'custody', label: 'Custody transfers', count: custodyLogs.length },
    { id: 'reports', label: 'Reports', count: reports.data?.reports.length },
    ...(can('VIEW_INTELLIGENCE')
      ? [
          {
            id: 'similar' as const,
            label: 'Similar Cases & Linkage',
            count: similarCount,
            highlight: dupAlertsCount > 0,
          },
        ]
      : []),
  ];

  return (
    <>
      <PageHeader
        title={theCase?.title ?? 'Case'}
        subtitle={`${caseId} — incident ${formatDateTime(theCase?.incidentTimestamp)} at ${theCase?.locationPoint}`}
        actions={
          <>
            {theCase && <StatusPill status={theCase.status} />}
            {can('REGISTER_EVIDENCE') && theCase?.status !== 'closed' && theCase?.status !== 'archived' && (
              <Link to={`/cases/${caseId}/evidence/new`} className="fs-btn-primary">
                + Register evidence
              </Link>
            )}
          </>
        }
      />

      <div className="mb-4 grid gap-4 md:grid-cols-3">
        <div className="fs-card">
          <p className="text-xs font-medium tracking-wide text-slate-400 uppercase">Lead officer</p>
          <p className="mt-1 text-sm font-medium text-forensic-900">
            {theCase?.leadOfficer?.fullName ?? theCase?.leadOfficerId}
          </p>
          <p className="text-xs text-slate-500">{theCase?.leadOfficer?.badgeNumber}</p>
        </div>

        <div className="fs-card">
          <p className="text-xs font-medium tracking-wide text-slate-400 uppercase">Evidence items</p>
          <p className="mt-1 text-2xl font-semibold text-forensic-900">{evidence.data?.evidence.length ?? 0}</p>
          <p className="text-xs text-slate-500">{custodyLogs.length} custody transfer(s)</p>
        </div>

        <div className="fs-card">
          <p className="text-xs font-medium tracking-wide text-slate-400 uppercase">Change status</p>
          {can('CREATE_CASE') ? (
            <select
              className="fs-input mt-1"
              value={theCase?.status ?? ''}
              onChange={(e) => changeStatus(e.target.value)}
            >
              {CASE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s] ?? s}
                </option>
              ))}
            </select>
          ) : (
            <p className="mt-1 text-sm text-slate-500">Only an Investigating Officer may change status.</p>
          )}
          <p className="mt-1 text-xs text-slate-400">
            Every change is written to CASE_AUDIT_LOG by a database trigger.
          </p>
        </div>
      </div>

      <ErrorBanner error={statusError} />

      <div className="mb-4 flex flex-wrap gap-1 border-b border-slate-200">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`border-b-2 px-4 py-2 text-sm transition-colors ${
              tab === t.id
                ? 'border-forensic-700 font-medium text-forensic-900'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
            {t.count !== undefined && <span className="ml-2 text-xs text-slate-400">{t.count}</span>}
          </button>
        ))}
      </div>

      {/* ---------------------------------------------------------------- */}
      {tab === 'timeline' && (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="fs-card lg:col-span-2">
            <h2 className="mb-4 font-semibold text-forensic-900">Case timeline</h2>

            {(timeline.data?.timeline.length ?? 0) === 0 ? (
              <EmptyState title="Nothing recorded yet." />
            ) : (
              <ol className="relative border-l border-slate-200 pl-6">
                {timeline.data!.timeline.map((event, index) => {
                  const style = EVENT_STYLES[event.kind] ?? { dot: 'bg-slate-400', label: 'Event' };
                  return (
                    <li key={`${event.kind}-${event.refId}-${index}`} className="mb-5 last:mb-0">
                      <span
                        className={`absolute -left-[7px] mt-1.5 h-3.5 w-3.5 rounded-full border-2 border-white ${style.dot}`}
                      />
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-medium tracking-wide text-slate-400 uppercase">
                          {formatDateTime(event.at)}
                        </span>
                        <Pill tone="slate">{style.label}</Pill>
                      </div>
                      <p className="mt-1 text-sm font-medium text-forensic-900">{event.title}</p>
                      {event.detail && <p className="text-sm text-slate-500">{event.detail}</p>}
                    </li>
                  );
                })}
              </ol>
            )}
          </div>

          <div className="fs-card">
            <h2 className="mb-1 font-semibold text-forensic-900">CASE_AUDIT_LOG</h2>
            <p className="mb-4 text-xs text-slate-500">
              Written automatically by the <code>trg_audit_case_status</code> trigger.
            </p>

            {auditRows.length === 0 ? (
              <EmptyState title="No status changes yet." />
            ) : (
              <ul className="space-y-3">
                {auditRows.map((row) => (
                  <li key={row.auditId} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                    <p className="text-sm">
                      <span className="font-medium">{row.oldStatus}</span>
                      <span className="mx-1 text-slate-400">→</span>
                      <span className="font-medium">{row.newStatus}</span>
                    </p>
                    <p className="text-xs text-slate-500">
                      #{row.auditId} · {formatDateTime(row.changeTimestamp)}
                    </p>
                    <p className="text-xs text-slate-500">by {row.changedBy}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {tab === 'evidence' && (
        <div className="fs-table-card overflow-x-auto p-0">
          {evidence.loading ? (
            <Spinner label="Loading evidence…" />
          ) : (evidence.data?.evidence.length ?? 0) === 0 ? (
            <div className="p-5">
              <EmptyState
                title="No evidence registered for this case."
                hint={can('REGISTER_EVIDENCE') ? 'Use “Register evidence” to add the first item.' : undefined}
              />
            </div>
          ) : (
            <table className="min-w-full divide-y divide-white/10">
              <thead className="bg-white/5">
                <tr>
                  <th className="fs-th">Evidence ID</th>
                  <th className="fs-th">Type</th>
                  <th className="fs-th">Collected</th>
                  <th className="fs-th">Subtype detail</th>
                  <th className="fs-th" />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {evidence.data!.evidence.map((item) => (
                  <tr key={item.evidenceId} className="hover:bg-white/5">
                    <td className="fs-td font-mono text-xs">{item.evidenceId}</td>
                    <td className="fs-td">
                      <Pill tone={item.digital ? 'indigo' : 'green'}>{item.evidenceType}</Pill>
                    </td>
                    <td className="fs-td whitespace-nowrap">{formatDateTime(item.collectionTimestamp)}</td>
                    <td className="fs-td text-xs">
                      {item.digital ? (
                        <>
                          <span className="font-medium">{item.digital.mediaType}</span> · {item.digital.sizeMb} MB ·
                          serial {item.digital.deviceSerial}
                          <br />
                          <span className="font-mono text-slate-400">
                            {item.digital.fileHashSha256.slice(0, 24)}…
                          </span>
                        </>
                      ) : item.physical ? (
                        <>
                          {item.physical.containerType} · locker {item.physical.storageLockerNumber} · seal{' '}
                          {item.physical.sealNumber}
                        </>
                      ) : (
                        <span className="text-slate-400">No subtype row</span>
                      )}
                    </td>
                    <td className="fs-td text-right">
                      <Link
                        to={`/evidence/${item.evidenceId}`}
                        className="font-medium text-forensic-600 hover:underline"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {tab === 'custody' && (
        <div className="fs-table-card overflow-x-auto p-0">
          {custodyLogs.length === 0 ? (
            <div className="p-5">
              <EmptyState title="No custody transfers recorded for this case." />
            </div>
          ) : (
            <table className="min-w-full divide-y divide-white/10">
              <thead className="bg-white/5">
                <tr>
                  <th className="fs-th">Log ID</th>
                  <th className="fs-th">When</th>
                  <th className="fs-th">Transfer</th>
                  <th className="fs-th">Reference</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {custodyLogs.map((log) => (
                  <tr key={log.refId}>
                    <td className="fs-td font-mono text-xs">{log.refId}</td>
                    <td className="fs-td whitespace-nowrap">{formatDateTime(log.at)}</td>
                    <td className="fs-td">{log.title}</td>
                    <td className="fs-td font-mono text-xs text-slate-400">{log.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Duplicate Evidence Alert Banner */}
      {(alerts.data?.alerts?.length ?? 0) > 0 && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900 shadow-sm">
          <div className="flex items-start gap-3">
            <span className="text-xl">⚠️</span>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-amber-950">
                Cross-Case Duplicate Evidence Detected ({alerts.data!.alerts.length} Match{alerts.data!.alerts.length > 1 ? 'es' : ''})
              </h3>
              <p className="mt-1 text-xs text-amber-800">
                Automated database trigger detected identical digital evidence hashes or device serials across separate cases.
              </p>
              <div className="mt-3 divide-y divide-amber-200 border-t border-amber-200">
                {alerts.data!.alerts.map((alt) => {
                  const isIncoming = alt.caseIdNew === caseId;
                  const otherCase = isIncoming ? alt.caseExisting : alt.caseNew;
                  const otherCaseId = isIncoming ? alt.caseIdExisting : alt.caseIdNew;
                  const matchedEv = isIncoming ? alt.matchedEvidence : alt.newEvidence;

                  return (
                    <div key={alt.alertId} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs">
                      <div>
                        <span className="font-semibold uppercase tracking-wider text-amber-900">
                          {alt.matchType === 'file_hash_sha256' ? 'Shared SHA-256 File Hash' : 'Matching Device Serial'}:
                        </span>{' '}
                        <span className="font-mono text-amber-950 font-medium">
                          {matchedEv?.digital?.fileHashSha256
                            ? `${matchedEv.digital.fileHashSha256.slice(0, 16)}...`
                            : matchedEv?.digital?.deviceSerial}
                        </span>{' '}
                        <span>
                          linking with{' '}
                          <Link to={`/cases/${otherCaseId}`} className="font-semibold text-amber-900 underline hover:text-amber-950">
                            {otherCase?.title ?? otherCaseId} ({otherCaseId})
                          </Link>
                        </span>
                      </div>
                      <Link
                        to={`/cases/${otherCaseId}`}
                        className="rounded bg-amber-200 px-2 py-1 text-xs font-medium text-amber-900 hover:bg-amber-300"
                      >
                        Inspect Linked Case →
                      </Link>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'reports' && (
        <div className="fs-table-card overflow-x-auto p-0">
          {reports.loading ? (
            <Spinner label="Loading reports…" />
          ) : (reports.data?.reports.length ?? 0) === 0 ? (
            <div className="p-5">
              <EmptyState
                title="No laboratory or witness reports attached."
                hint={can('UPLOAD_REPORT') ? 'Upload one from the “Lab & Witness Reports” page.' : undefined}
              />
            </div>
          ) : (
            <table className="min-w-full divide-y divide-white/10">
              <thead className="bg-white/5">
                <tr>
                  <th className="fs-th">File</th>
                  <th className="fs-th">Type</th>
                  <th className="fs-th">Attached to</th>
                  <th className="fs-th">Size</th>
                  <th className="fs-th">Uploaded</th>
                  <th className="fs-th" />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {reports.data!.reports.map((r) => (
                  <tr key={r.reportId}>
                    <td className="fs-td font-medium">{r.fileName}</td>
                    <td className="fs-td">
                      <Pill tone={r.reportType === 'Laboratory' ? 'green' : 'slate'}>{r.reportType}</Pill>
                    </td>
                    <td className="fs-td font-mono text-xs">{r.evidenceId ?? r.caseId}</td>
                    <td className="fs-td">{formatBytes(r.sizeBytes)}</td>
                    <td className="fs-td whitespace-nowrap text-xs">
                      {formatDateTime(r.uploadedAt)}
                      <br />
                      <span className="text-slate-400">{r.uploadedBy?.fullName ?? r.uploadedById}</span>
                    </td>
                    <td className="fs-td text-right">
                      <ReportDownloadLink reportId={r.reportId} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {tab === 'similar' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg bg-slate-900 p-4 text-white shadow">
            <div>
              <h2 className="text-base font-semibold">Case Correlation &amp; Pattern Intelligence</h2>
              <p className="mt-0.5 text-xs text-slate-300">
                Automated multi-vector scoring analyzing Digital Fingerprints (40%), Geospatial Proximity (25%), M.O. Evidence Overlap (20%), and Temporal Clustering (15%).
              </p>
            </div>
            <Link
              to={`/intelligence?caseId=${caseId}`}
              className="inline-flex items-center gap-1.5 rounded-md bg-amber-500 px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-amber-400"
            >
              <span>Explore Network Graph</span> →
            </Link>
          </div>

          {similar.loading ? (
            <div className="fs-card">
              <Spinner label="Computing multi-vector similarity matrix…" />
            </div>
          ) : (similar.data?.similar?.length ?? 0) === 0 ? (
            <div className="fs-card p-6 text-center">
              <EmptyState
                title="No cross-case correlations found."
                hint="No other cases meet the minimum similarity threshold for digital hashes, geographic proximity, or evidence profiles."
              />
            </div>
          ) : (
            <div className="space-y-3">
              {similar.data!.similar.map((item) => {
                const isExpanded = expandedCaseId === item.caseId;
                const matchTone =
                  item.matchPercentage >= 70
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                    : item.matchPercentage >= 35
                    ? 'bg-amber-50 text-amber-800 border-amber-300'
                    : 'bg-slate-50 text-slate-700 border-slate-300';

                return (
                  <div
                    key={item.caseId}
                    className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm transition hover:border-slate-300"
                  >
                    <div
                      className="flex cursor-pointer flex-wrap items-center justify-between gap-4 p-4 hover:bg-slate-50"
                      onClick={() => setExpandedCaseId(isExpanded ? null : item.caseId)}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`flex h-12 w-12 flex-shrink-0 flex-col items-center justify-center rounded-lg border font-bold ${matchTone}`}
                        >
                          <span className="text-sm font-extrabold">{item.matchPercentage}%</span>
                          <span className="text-[9px] uppercase tracking-tighter">Match</span>
                        </div>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-xs font-semibold text-slate-500">{item.caseId}</span>
                            <StatusPill status={item.status} />
                            {item.hasDuplicateEvidenceAlert && (
                              <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-rose-800 uppercase">
                                Duplicate Hash/Serial Alert
                              </span>
                            )}
                          </div>
                          <h3 className="mt-0.5 font-semibold text-slate-900">{item.title}</h3>
                          <p className="mt-0.5 text-xs text-slate-500">
                            Lead Officer: <span className="font-medium text-slate-700">{item.leadOfficer.fullName}</span> ({item.leadOfficer.badgeNumber}) • Incident:{' '}
                            {formatDateTime(item.incidentTimestamp)}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Link
                          to={`/cases/${item.caseId}`}
                          className="fs-btn-secondary fs-btn text-xs"
                          onClick={(e) => e.stopPropagation()}
                        >
                          View Case →
                        </Link>
                        <button
                          type="button"
                          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                          aria-label="Toggle details"
                        >
                          <span className="text-sm">{isExpanded ? '▲' : '▼'}</span>
                        </button>
                      </div>
                    </div>

                    {/* Breakdown details */}
                    <div className={`border-t border-slate-100 bg-slate-50 px-4 py-3 ${isExpanded ? 'block' : 'hidden'}`}>
                      <h4 className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
                        Correlation Breakdown &amp; Forensic Signals
                      </h4>
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                        {item.breakdown.map((vec) => (
                          <div key={vec.vector} className="rounded-md border border-slate-200 bg-white p-2.5 shadow-2xs">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-medium text-slate-600">{vec.vector}</span>
                              <span className="text-[11px] font-bold text-forensic-800">
                                {vec.weightedScore} / {Math.round(vec.weight * 100)} pts
                              </span>
                            </div>
                            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                              <div
                                className={`h-full ${
                                  vec.score > 0.7 ? 'bg-emerald-500' : vec.score > 0.3 ? 'bg-amber-500' : 'bg-slate-300'
                                }`}
                                style={{ width: `${Math.round(vec.score * 100)}%` }}
                              />
                            </div>
                            <p className="mt-2 text-xs font-medium text-slate-800">{vec.evidence}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </>
  );
}

/**
 * Downloads go through fetch (not a bare href) so the bearer token is attached,
 * then the blob is handed to the browser as a file.
 */
export function ReportDownloadLink({ reportId }: { reportId: string }) {
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    try {
      const res = await fetch(`/api/reports/${reportId}/download`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('forensys.accessToken') ?? ''}` },
      });
      if (!res.ok) throw new Error(`Download failed (${res.status}).`);

      const blob = await res.blob();
      const disposition = res.headers.get('content-disposition') ?? '';
      const match = /filename="?([^"]+)"?/.exec(disposition);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = match?.[1] ?? 'report';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Download failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" className="text-sm font-medium text-forensic-600 hover:underline" onClick={download} disabled={busy}>
      {busy ? '…' : 'Download'}
    </button>
  );
}
