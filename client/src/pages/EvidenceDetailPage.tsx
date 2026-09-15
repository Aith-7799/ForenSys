import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { useAuth } from '../auth/AuthContext';
import type { EvidenceDetail } from '../lib/types';
import {
  EmptyState,
  ErrorBanner,
  PageHeader,
  Pill,
  Spinner,
  formatBytes,
  formatDateTime,
} from '../components/ui';

export function EvidenceDetailPage() {
  const { evidenceId = '' } = useParams();
  const { can } = useAuth();

  const { data, error, loading, reload } = useAsync(
    () => api.get<EvidenceDetail>(`/api/evidence/${evidenceId}`),
    [evidenceId],
  );

  if (loading) return <Spinner label="Loading evidence…" />;

  if (error || !data) {
    return (
      <>
        <PageHeader title="Evidence" />
        <ErrorBanner error={error ?? new Error('Evidence not found.')} onRetry={reload} />
      </>
    );
  }

  const item = data.evidence;

  return (
    <>
      <PageHeader
        title={`${item.evidenceType} — ${item.evidenceId}`}
        subtitle={`Collected ${formatDateTime(item.collectionTimestamp)}`}
        actions={
          <>
            <Pill tone={item.digital ? 'indigo' : 'green'}>
              {item.digital ? 'DIGITAL_EVIDENCE' : 'PHYSICAL_EVIDENCE'}
            </Pill>
            {item.case && (
              <Link to={`/cases/${item.case.caseId}`} className="fs-btn-secondary">
                Open case {item.case.caseId}
              </Link>
            )}
            {can('LOG_CUSTODY') && (
              <Link to={`/custody?evidenceId=${item.evidenceId}`} className="fs-btn-primary">
                Log custody transfer
              </Link>
            )}
          </>
        }
      />

      <div className="mb-4 grid gap-4 md:grid-cols-3">
        <div className="fs-card">
          <p className="text-xs font-medium tracking-wide text-slate-400 uppercase">Current holder</p>
          {data.currentHolder ? (
            <>
              <p className="mt-1 text-sm font-medium text-forensic-900">{data.currentHolder.fullName}</p>
              <p className="text-xs text-slate-500">
                {data.currentHolder.badgeNumber} · since {formatDateTime(data.currentHolderSince)}
              </p>
            </>
          ) : (
            <>
              <p className="mt-1 text-sm font-medium text-slate-600">Never transferred</p>
              <p className="text-xs text-slate-500">
                No CUSTODY_LOG entry exists, so the item is still with its collecting officer.
              </p>
            </>
          )}
        </div>

        <div className="fs-card">
          <p className="text-xs font-medium tracking-wide text-slate-400 uppercase">Chain length</p>
          <p className="mt-1 text-2xl font-semibold text-forensic-900">{data.transferCount}</p>
          <p className="text-xs text-slate-500">
            Matches Oracle <code>FN_COUNT_CUSTODY_TRANSFERS</code>
          </p>
        </div>

        <div className="fs-card">
          <p className="text-xs font-medium tracking-wide text-slate-400 uppercase">Attached reports</p>
          <p className="mt-1 text-2xl font-semibold text-forensic-900">{item.reports.length}</p>
          <p className="text-xs text-slate-500">Laboratory / witness documents</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="fs-card">
          <h2 className="mb-3 font-semibold text-forensic-900">
            {item.digital ? 'Digital evidence attributes' : 'Physical storage attributes'}
          </h2>

          {item.digital ? (
            <dl className="space-y-2 text-sm">
              <Row label="Media type" value={item.digital.mediaType} />
              <Row label="Size" value={`${item.digital.sizeMb} MB`} />
              <Row label="Device serial" value={item.digital.deviceSerial} mono />
              <Row label="SHA-256" value={item.digital.fileHashSha256} mono small />
            </dl>
          ) : item.physical ? (
            <dl className="space-y-2 text-sm">
              <Row label="Storage locker" value={item.physical.storageLockerNumber} mono />
              <Row label="Seal number" value={item.physical.sealNumber} mono />
              <Row label="Container type" value={item.physical.containerType} />
            </dl>
          ) : (
            <p className="text-sm text-slate-500">No subtype row is attached to this evidence item.</p>
          )}
        </div>

        <div className="fs-card">
          <h2 className="mb-3 font-semibold text-forensic-900">Custody trail</h2>

          {item.custodyLogs.length === 0 ? (
            <EmptyState title="No transfers recorded." />
          ) : (
            <ol className="space-y-3">
              {item.custodyLogs.map((log) => (
                <li key={log.logId} className="rounded-md border border-slate-200 px-3 py-2">
                  <p className="text-sm">
                    <span className="font-medium">{log.releasedBy?.fullName}</span>
                    <span className="mx-1 text-slate-400">→</span>
                    <span className="font-medium">{log.receivedBy?.fullName}</span>
                  </p>
                  <p className="text-xs text-slate-500">
                    {formatDateTime(log.transferTimestamp)} · {log.logId}
                  </p>
                  {log.mongoDocRef && (
                    <p className="mt-1 font-mono text-xs text-slate-400">ref: {log.mongoDocRef}</p>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>

      {item.reports.length > 0 && (
        <div className="fs-card mt-4">
          <h2 className="mb-3 font-semibold text-forensic-900">Attached reports</h2>
          <ul className="divide-y divide-slate-100">
            {item.reports.map((r) => (
              <li key={r.reportId} className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm font-medium">{r.fileName}</p>
                  <p className="text-xs text-slate-500">
                    {r.reportType} · {formatBytes(r.sizeBytes)} · {formatDateTime(r.uploadedAt)} ·{' '}
                    {r.uploadedBy?.fullName}
                  </p>
                </div>
                <Pill tone={r.reportType === 'Laboratory' ? 'green' : 'slate'}>{r.reportType}</Pill>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

function Row({ label, value, mono, small }: { label: string; value: string; mono?: boolean; small?: boolean }) {
  return (
    <div className="flex flex-wrap gap-x-3">
      <dt className="w-36 shrink-0 text-xs font-medium tracking-wide text-slate-400 uppercase">{label}</dt>
      <dd className={`min-w-0 flex-1 break-all ${mono ? 'font-mono' : ''} ${small ? 'text-xs' : ''}`}>{value}</dd>
    </div>
  );
}
