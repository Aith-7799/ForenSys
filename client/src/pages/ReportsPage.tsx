import { useMemo, useRef, useState, type FormEvent } from 'react';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { REPORT_TYPES } from '../lib/permissions';
import type { CaseSummary, EvidenceItem, ReportItem } from '../lib/types';
import { EmptyState, ErrorBanner, PageHeader, Pill, Spinner, formatBytes, formatDateTime } from '../components/ui';
import { ReportDownloadLink } from './CaseDetailPage';

/**
 * Use case 5: Upload Laboratory and Witness Reports.
 *
 * Restricted to the Forensic Laboratory Analyst role on the server; this page is
 * reachable only through a route guarded by the same permission.
 */
export function ReportsPage() {
  const [caseId, setCaseId] = useState('');
  const [evidenceId, setEvidenceId] = useState('');
  const [reportType, setReportType] = useState<string>('Laboratory');
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [error, setError] = useState<unknown>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const cases = useAsync(() => api.get<{ cases: CaseSummary[] }>('/api/cases'), []);
  const allEvidence = useAsync(() => api.get<{ evidence: EvidenceItem[] }>('/api/evidence'), []);
  const reports = useAsync(
    () => api.get<{ reports: ReportItem[] }>(`/api/reports${caseId ? `?caseId=${caseId}` : ''}`),
    [caseId, success],
  );

  const evidenceForCase = useMemo(() => {
    const items = allEvidence.data?.evidence ?? [];
    return caseId ? items.filter((e) => e.caseId === caseId) : items;
  }, [allEvidence.data, caseId]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (!file) {
      setError(new Error('Choose a file to upload.'));
      return;
    }
    if (!caseId && !evidenceId) {
      setError(new Error('Attach the report to a case or an evidence item.'));
      return;
    }

    setSubmitting(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('reportType', reportType);
      if (caseId) form.append('caseId', caseId);
      if (evidenceId) form.append('evidenceId', evidenceId);

      const res = await api.upload<{ report: ReportItem }>('/api/reports', form);
      setSuccess(`Uploaded "${res.report.fileName}" (${res.report.reportType}).`);
      setFile(null);
      // An <input type="file"> is uncontrolled, so clearing state alone would
      // leave the chosen filename visible.
      if (fileInputRef.current) fileInputRef.current.value = '';
      reports.reload();
    } catch (err) {
      setError(err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Laboratory & Witness Reports"
        subtitle="Upload forensic reports and attach them to a case, an evidence item, or both."
      />

      {success && (
        <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {success}
        </div>
      )}
      <ErrorBanner error={error} />

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
                <option value="">Not attached to a case</option>
                {(cases.data?.cases ?? []).map((c) => (
                  <option key={c.caseId} value={c.caseId}>
                    {c.caseId} — {c.title}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="fs-label" htmlFor="evidence">
                Evidence item
              </label>
              <select
                id="evidence"
                className="fs-input"
                value={evidenceId}
                onChange={(e) => {
                  const next = e.target.value;
                  setEvidenceId(next);
                  const found = evidenceForCase.find((ev) => ev.evidenceId === next);
                  if (found && !caseId) setCaseId(found.caseId);
                }}
              >
                <option value="">Not attached to an evidence item</option>
                {evidenceForCase.map((e) => (
                  <option key={e.evidenceId} value={e.evidenceId}>
                    {e.evidenceId} — {e.evidenceType}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="fs-label" htmlFor="reportType">
                Report type <span className="text-red-600">*</span>
              </label>
              <select
                id="reportType"
                className="fs-input"
                value={reportType}
                onChange={(e) => setReportType(e.target.value)}
              >
                {REPORT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="fs-label" htmlFor="file">
                File <span className="text-red-600">*</span>
              </label>
              <input
                id="file"
                ref={fileInputRef}
                type="file"
                className="fs-input"
                accept=".pdf,.doc,.docx,.txt,.rtf,.csv,.json,.xml,.jpg,.jpeg,.png,.tif,.tiff"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <p className="mt-1 text-xs text-slate-500">
                PDF, DOC/DOCX, TXT, CSV, JSON, XML or image. Max 25 MB.
              </p>
            </div>
          </div>

          <button type="submit" className="fs-btn-primary" disabled={submitting}>
            {submitting ? 'Uploading…' : 'Upload report'}
          </button>
        </form>

        <div className="fs-card">
          <h2 className="mb-3 font-semibold text-forensic-900">
            {caseId ? `Reports for ${caseId}` : 'All reports'}
          </h2>

          {reports.loading ? (
            <Spinner label="Loading…" />
          ) : (reports.data?.reports.length ?? 0) === 0 ? (
            <EmptyState title="No reports uploaded yet." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {reports.data!.reports.map((r) => (
                <li key={r.reportId} className="py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{r.fileName}</p>
                      <p className="text-xs text-slate-500">
                        {formatBytes(r.sizeBytes)} · {formatDateTime(r.uploadedAt)}
                      </p>
                      <p className="font-mono text-xs text-slate-400">
                        {r.evidenceId ?? r.caseId ?? '—'}
                      </p>
                    </div>
                    <Pill tone={r.reportType === 'Laboratory' ? 'green' : 'slate'}>{r.reportType}</Pill>
                  </div>
                  <div className="mt-1">
                    <ReportDownloadLink reportId={r.reportId} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
