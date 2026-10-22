import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { STATUS_LABELS } from '../lib/permissions';
import type { DashboardSummary, RollupRow } from '../lib/types';
import { EmptyState, ErrorBanner, PageHeader, Pill, Spinner } from '../components/ui';

/**
 * Use case 7: View Analytics Dashboard (System Administrator only).
 *
 * Each panel maps to one of the aggregate queries in the DA-2 report
 * (section 5.3): GROUP BY / HAVING, AVG-MAX-MIN, and GROUP BY ROLLUP.
 */
export function DashboardPage() {
  const summary = useAsync(() => api.get<DashboardSummary>('/api/dashboard/summary'), []);
  const rollup = useAsync(() => api.get<{ rollup: RollupRow[] }>('/api/dashboard/rollup'), []);

  if (summary.loading) return <Spinner label="Loading analyticsâ€¦" />;

  return (
    <>
      <PageHeader
        title="Analytics Dashboard"
        subtitle="Aggregate reporting over cases, evidence and officer workload."
      />

      <ErrorBanner error={summary.error ?? rollup.error} onRetry={summary.reload} />

      {summary.data && (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Stat label="Cases" value={summary.data.totals.cases} />
            <Stat label="Evidence items" value={summary.data.totals.evidence} />
            <Stat label="Officers" value={summary.data.totals.officers} />
            <Stat label="Custody transfers" value={summary.data.totals.custodyTransfers} />
            <Stat label="Reports" value={summary.data.totals.reports} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* GROUP BY c.status */}
            <section className="fs-table-card">
              <h2 className="font-semibold text-white">Cases by status</h2>
              <p className="mb-4 text-xs text-slate-400">
                Cases categorized by current judicial and investigative lifecycle status
              </p>

              {summary.data.caseCountsByStatus.length === 0 ? (
                <EmptyState title="No cases yet." />
              ) : (
                <BarList
                  rows={summary.data.caseCountsByStatus.map((r) => ({
                    key: r.status,
                    label: STATUS_LABELS[r.status] ?? r.status,
                    value: r.totalCases,
                    secondary: `${r.totalEvidenceItems} evidence item(s)`,
                  }))}
                />
              )}
            </section>

            {/* GROUP BY e.evidence_type */}
            <section className="fs-table-card">
              <h2 className="font-semibold text-white">Evidence by type</h2>
              <p className="mb-4 text-xs text-slate-400">
                Distribution of physical, biological, and digital evidence categories
              </p>

              {summary.data.evidenceCountsByType.length === 0 ? (
                <EmptyState title="No evidence registered yet." />
              ) : (
                <BarList
                  rows={summary.data.evidenceCountsByType.map((r) => ({
                    key: r.evidenceType,
                    label: r.evidenceType,
                    value: r.totalItems,
                    secondary: `across ${r.totalCases} case(s)`,
                  }))}
                />
              )}
            </section>

            {/* AVG / MAX / MIN by media type */}
            <section className="fs-table-card lg:col-span-2">
              <h2 className="font-semibold text-white">Digital evidence size by media type</h2>
              <p className="mb-4 text-xs text-slate-400">
                Storage and size metrics across seized digital storage media with AVG / MAX / MIN / SUM over{' '}
                <code>digital_evidence.size_mb</code>
              </p>

              {summary.data.digitalSizeByMediaType.length === 0 ? (
                <EmptyState title="No digital evidence registered yet." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-white/10">
                    <thead className="bg-white/5">
                      <tr>
                        <th className="fs-th">Media type</th>
                        <th className="fs-th">Files</th>
                        <th className="fs-th">Avg MB</th>
                        <th className="fs-th">Max MB</th>
                        <th className="fs-th">Min MB</th>
                        <th className="fs-th">Total MB</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {summary.data.digitalSizeByMediaType.map((row) => (
                        <tr key={row.mediaType}>
                          <td className="fs-td font-medium">{row.mediaType}</td>
                          <td className="fs-td">{row.totalFiles}</td>
                          <td className="fs-td">{row.avgSizeMb.toFixed(2)}</td>
                          <td className="fs-td">{row.maxSizeMb.toFixed(2)}</td>
                          <td className="fs-td">{row.minSizeMb.toFixed(2)}</td>
                          <td className="fs-td">{row.totalStorageMb.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Officer workload â€” Oracle FN_GET_OFFICER_WORKLOAD */}
            <section className="fs-table-card">
              <h2 className="font-semibold text-white">Officer workload</h2>
              <p className="mb-4 text-xs text-slate-400">
                Open + under-investigation cases per officer
              </p>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-white/10">
                  <thead className="bg-white/5">
                    <tr>
                      <th className="fs-th">Officer</th>
                      <th className="fs-th">Role</th>
                      <th className="fs-th">Open</th>
                      <th className="fs-th">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {summary.data.officerWorkload.map((row) => (
                      <tr key={row.officerId}>
                        <td className="fs-td">
                          <span className="font-medium">{row.fullName}</span>
                          <span className="block text-xs text-slate-500">{row.badgeNumber}</span>
                        </td>
                        <td className="fs-td text-xs">{row.role}</td>
                        <td className="fs-td">
                          <strong>{row.openCaseCount}</strong>
                        </td>
                        <td className="fs-td text-slate-400">{row.totalCaseCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* GROUP BY ROLLUP */}
            <section className="fs-table-card">
              <h2 className="font-semibold text-white">Status Ã— type rollup</h2>
              <p className="mb-4 text-xs text-slate-400">
                Multi-dimensional cross-tabulation of evidence categories across case statuses
              </p>

              {rollup.loading ? (
                <Spinner label="Running rollupâ€¦" />
              ) : (rollup.data?.rollup.length ?? 0) === 0 ? (
                <EmptyState title="Not enough data for a rollup." />
              ) : (
                <div className="max-h-80 overflow-auto">
                  <table className="min-w-full divide-y divide-white/10">
                    <thead className="sticky top-0 bg-slate-900">
                      <tr>
                        <th className="fs-th">Status</th>
                        <th className="fs-th">Evidence type</th>
                        <th className="fs-th">Items</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {rollup.data!.rollup.map((row, index) => {
                        const isTotal = row.caseStatus === 'TOTAL ALL STATUSES';
                        const isSubtotal = row.evidenceType === 'SUBTOTAL TYPE';
                        return (
                          <tr
                            key={`${row.caseStatus}-${row.evidenceType}-${index}`}
                            className={isTotal ? 'bg-white/10 font-medium text-white' : isSubtotal ? 'bg-white/5' : ''}
                          >
                            <td className="fs-td">
                              {isSubtotal && !isTotal ? '' : row.caseStatus}
                              {isTotal && row.evidenceType !== 'SUBTOTAL TYPE' ? '' : ''}
                            </td>
                            <td className="fs-td text-xs">{isSubtotal ? 'Subtotal' : row.evidenceType}</td>
                            <td className="fs-td">{row.itemCount}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="fs-table-card lg:col-span-2">
              <h2 className="font-semibold text-white">Chain-of-custody activity</h2>
              <p className="mb-4 text-xs text-slate-400">
                Transfers per evidence item â€” the equivalent of Oracle{' '}
                <code>FN_COUNT_CUSTODY_TRANSFERS</code>
              </p>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-white/10">
                  <thead className="bg-white/5">
                    <tr>
                      <th className="fs-th">Evidence ID</th>
                      <th className="fs-th">Type</th>
                      <th className="fs-th">Transfers</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {summary.data.custodyActivity.map((row) => (
                      <tr key={row.evidenceId}>
                        <td className="fs-td font-mono text-xs">{row.evidenceId}</td>
                        <td className="fs-td">
                          <Pill tone="slate">{row.evidenceType}</Pill>
                        </td>
                        <td className="fs-td">{row.totalTransfers}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </>
      )}
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="fs-card">
      <p className="text-xs font-medium tracking-wide text-slate-400 uppercase">{label}</p>
      <p className="mt-1 text-3xl font-semibold text-white">{value}</p>
    </div>
  );
}

function BarList({
  rows,
}: {
  rows: { key: string; label: string; value: number; secondary?: string }[];
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));

  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li key={row.key}>
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-medium text-slate-200">{row.label}</span>
            <span className="text-slate-400">{row.value}</span>
          </div>
          <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-forensic-600"
              style={{ width: `${Math.round((row.value / max) * 100)}%` }}
            />
          </div>
          {row.secondary && <p className="mt-0.5 text-xs text-slate-400">{row.secondary}</p>}
        </li>
      ))}
    </ul>
  );
}
