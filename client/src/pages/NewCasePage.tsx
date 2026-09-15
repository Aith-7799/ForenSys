import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../auth/AuthContext';
import type { CaseSummary, Officer } from '../lib/types';
import { ErrorBanner, PageHeader } from '../components/ui';
import { useAsync } from '../lib/useAsync';

/**
 * Use case 2: Create Crime Report.
 *
 * The lead officer defaults to the signed-in officer, which is what the use case
 * specifies. An alternative lead can be chosen for cases handed to someone else.
 */
export function NewCasePage() {
  const { officer } = useAuth();
  const navigate = useNavigate();

  const [title, setTitle] = useState('');
  const [incidentTimestamp, setIncidentTimestamp] = useState(() => {
    // datetime-local needs a local ISO string without the timezone suffix.
    const now = new Date();
    const offset = now.getTimezoneOffset() * 60_000;
    return new Date(now.getTime() - offset).toISOString().slice(0, 16);
  });
  const [locationPoint, setLocationPoint] = useState('');
  const [leadOfficerId, setLeadOfficerId] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);

  const officers = useAsync(() => api.get<{ officers: Officer[] }>('/api/officers'), []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await api.post<{ case: CaseSummary }>('/api/cases', {
        title: title.trim(),
        incidentTimestamp: new Date(incidentTimestamp).toISOString(),
        locationPoint: locationPoint.trim(),
        ...(leadOfficerId ? { leadOfficerId } : {}),
      });
      navigate(`/cases/${res.case.caseId}`, { replace: true });
    } catch (err) {
      setError(err);
      setSubmitting(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Create Crime Report"
        subtitle="Registers a new case. The lead officer is assigned automatically unless you choose one."
      />

      <form className="fs-card max-w-2xl space-y-4" onSubmit={handleSubmit}>
        <ErrorBanner error={error} />

        <div>
          <label className="fs-label" htmlFor="title">
            Case title <span className="text-red-600">*</span>
          </label>
          <input
            id="title"
            className="fs-input"
            placeholder="Downtown Bank Cyber Attack"
            maxLength={255}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </div>

        <div>
          <label className="fs-label" htmlFor="incidentTimestamp">
            Incident date &amp; time <span className="text-red-600">*</span>
          </label>
          <input
            id="incidentTimestamp"
            type="datetime-local"
            className="fs-input"
            value={incidentTimestamp}
            onChange={(e) => setIncidentTimestamp(e.target.value)}
            required
          />
        </div>

        <div>
          <label className="fs-label" htmlFor="locationPoint">
            Location <span className="text-red-600">*</span>
          </label>
          <input
            id="locationPoint"
            className="fs-input font-mono"
            placeholder="40.7128,-74.0060"
            maxLength={100}
            value={locationPoint}
            onChange={(e) => setLocationPoint(e.target.value)}
            required
          />
          <p className="mt-1 text-xs text-slate-500">
            Stored in <code>cases.location_point</code> (VARCHAR(100)), matching the Oracle schema.
          </p>
        </div>

        <div>
          <label className="fs-label" htmlFor="leadOfficer">
            Lead officer
          </label>
          <select
            id="leadOfficer"
            className="fs-input"
            value={leadOfficerId}
            onChange={(e) => setLeadOfficerId(e.target.value)}
          >
            <option value="">
              Me — {officer?.fullName} ({officer?.badgeNumber})
            </option>
            {(officers.data?.officers ?? [])
              .filter((o) => o.officerId !== officer?.officerId)
              .map((o) => (
                <option key={o.officerId} value={o.officerId}>
                  {o.fullName} ({o.badgeNumber}) — {o.role}
                </option>
              ))}
          </select>
        </div>

        <div className="flex gap-3 pt-2">
          <button type="submit" className="fs-btn-primary" disabled={submitting}>
            {submitting ? 'Creating…' : 'Create case'}
          </button>
          <button type="button" className="fs-btn-secondary" onClick={() => navigate(-1)}>
            Cancel
          </button>
        </div>
      </form>
    </>
  );
}
