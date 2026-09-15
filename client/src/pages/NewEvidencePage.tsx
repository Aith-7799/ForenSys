import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { DIGITAL_EVIDENCE_TYPE, EVIDENCE_TYPES } from '../lib/permissions';
import type { CaseSummary, EvidenceItem } from '../lib/types';
import { ErrorBanner, PageHeader, Spinner } from '../components/ui';

/**
 * Use case 3: Register Evidence Item.
 *
 * The sub-form switches on evidence_type, exactly like the schema: 'Digital Device'
 * writes a DIGITAL_EVIDENCE row, every other category writes a PHYSICAL_EVIDENCE
 * row. The server validates the same rule, so this is a convenience, not the guard.
 */
export function NewEvidencePage() {
  const { caseId = '' } = useParams();
  const navigate = useNavigate();

  const [evidenceType, setEvidenceType] = useState<string>('Weapon');
  const [collectionTimestamp, setCollectionTimestamp] = useState(() => {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  });

  // Physical subtype fields
  const [storageLockerNumber, setStorageLockerNumber] = useState('');
  const [sealNumber, setSealNumber] = useState('');
  const [containerType, setContainerType] = useState('');

  // Digital subtype fields
  const [fileHashSha256, setFileHashSha256] = useState('');
  const [mediaType, setMediaType] = useState('');
  const [sizeMb, setSizeMb] = useState('');
  const [deviceSerial, setDeviceSerial] = useState('');

  const [error, setError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);

  const theCase = useAsync(() => api.get<{ case: CaseSummary }>(`/api/cases/${caseId}`), [caseId]);

  const isDigital = evidenceType === DIGITAL_EVIDENCE_TYPE;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const payload = {
      caseId,
      evidenceType,
      collectionTimestamp: new Date(collectionTimestamp).toISOString(),
      ...(isDigital
        ? {
            digital: {
              fileHashSha256: fileHashSha256.trim(),
              mediaType: mediaType.trim(),
              sizeMb: Number(sizeMb),
              deviceSerial: deviceSerial.trim(),
            },
          }
        : {
            physical: {
              storageLockerNumber: storageLockerNumber.trim(),
              sealNumber: sealNumber.trim(),
              containerType: containerType.trim(),
            },
          }),
    };

    try {
      const res = await api.post<{ evidence: EvidenceItem }>('/api/evidence', payload);
      navigate(`/evidence/${res.evidence.evidenceId}`, { replace: true });
    } catch (err) {
      setError(err);
      setSubmitting(false);
    }
  }

  if (theCase.loading) return <Spinner label="Loading case…" />;

  return (
    <>
      <PageHeader
        title="Register Evidence Item"
        subtitle={
          theCase.data
            ? `Into ${theCase.data.case.caseId} — ${theCase.data.case.title} (status: ${theCase.data.case.status})`
            : `Into case ${caseId}`
        }
      />

      <form className="fs-card max-w-3xl space-y-5" onSubmit={handleSubmit}>
        <ErrorBanner error={error} />

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="fs-label" htmlFor="evidenceType">
              Evidence type <span className="text-red-600">*</span>
            </label>
            <select
              id="evidenceType"
              className="fs-input"
              value={evidenceType}
              onChange={(e) => setEvidenceType(e.target.value)}
            >
              {EVIDENCE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="fs-label" htmlFor="collectionTimestamp">
              Collection date &amp; time <span className="text-red-600">*</span>
            </label>
            <input
              id="collectionTimestamp"
              type="datetime-local"
              className="fs-input"
              value={collectionTimestamp}
              onChange={(e) => setCollectionTimestamp(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-2 text-sm">
          <span className="font-medium text-slate-700">
            {isDigital ? 'DIGITAL_EVIDENCE' : 'PHYSICAL_EVIDENCE'}
          </span>{' '}
          <span className="text-slate-500">
            subtype row will be created
            {isDigital
              ? ' — chosen because the type is “Digital Device”.'
              : ` — “${evidenceType}” is not a digital device, so physical storage details are required.`}
          </span>
        </div>

        {isDigital ? (
          <fieldset className="grid gap-4 sm:grid-cols-2">
            <legend className="mb-2 text-sm font-semibold text-forensic-900">Digital evidence details</legend>

            <div className="sm:col-span-2">
              <label className="fs-label" htmlFor="fileHashSha256">
                SHA-256 file hash <span className="text-red-600">*</span>
              </label>
              <input
                id="fileHashSha256"
                className="fs-input font-mono text-xs"
                placeholder="64 hexadecimal characters"
                pattern="[a-fA-F0-9]{64}"
                title="Exactly 64 hexadecimal characters."
                value={fileHashSha256}
                onChange={(e) => setFileHashSha256(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="fs-label" htmlFor="mediaType">
                Media type <span className="text-red-600">*</span>
              </label>
              <input
                id="mediaType"
                className="fs-input"
                placeholder="Disk Image (.raw)"
                maxLength={50}
                value={mediaType}
                onChange={(e) => setMediaType(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="fs-label" htmlFor="sizeMb">
                Size (MB) <span className="text-red-600">*</span>
              </label>
              <input
                id="sizeMb"
                type="number"
                step="0.01"
                min="0.01"
                className="fs-input"
                placeholder="1500.50"
                value={sizeMb}
                onChange={(e) => setSizeMb(e.target.value)}
                required
              />
              <p className="mt-1 text-xs text-slate-500">Must be greater than 0 (chk_digital_size).</p>
            </div>

            <div className="sm:col-span-2">
              <label className="fs-label" htmlFor="deviceSerial">
                Device serial <span className="text-red-600">*</span>
              </label>
              <input
                id="deviceSerial"
                className="fs-input"
                placeholder="SN-SERVER-9921"
                maxLength={50}
                value={deviceSerial}
                onChange={(e) => setDeviceSerial(e.target.value)}
                required
              />
            </div>
          </fieldset>
        ) : (
          <fieldset className="grid gap-4 sm:grid-cols-2">
            <legend className="mb-2 text-sm font-semibold text-forensic-900">Physical storage details</legend>

            <div>
              <label className="fs-label" htmlFor="storageLockerNumber">
                Storage locker number <span className="text-red-600">*</span>
              </label>
              <input
                id="storageLockerNumber"
                className="fs-input"
                placeholder="LOCKER-A12"
                maxLength={50}
                value={storageLockerNumber}
                onChange={(e) => setStorageLockerNumber(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="fs-label" htmlFor="sealNumber">
                Seal number <span className="text-red-600">*</span>
              </label>
              <input
                id="sealNumber"
                className="fs-input"
                placeholder="SEAL-99401"
                maxLength={50}
                value={sealNumber}
                onChange={(e) => setSealNumber(e.target.value)}
                required
              />
            </div>

            <div className="sm:col-span-2">
              <label className="fs-label" htmlFor="containerType">
                Container type <span className="text-red-600">*</span>
              </label>
              <input
                id="containerType"
                className="fs-input"
                placeholder="Heavy Metal Vault Container"
                maxLength={50}
                value={containerType}
                onChange={(e) => setContainerType(e.target.value)}
                required
              />
            </div>
          </fieldset>
        )}

        <div className="flex gap-3 pt-2">
          <button type="submit" className="fs-btn-primary" disabled={submitting}>
            {submitting ? 'Registering…' : 'Register evidence'}
          </button>
          <button type="button" className="fs-btn-secondary" onClick={() => navigate(`/cases/${caseId}`)}>
            Cancel
          </button>
        </div>
      </form>
    </>
  );
}
