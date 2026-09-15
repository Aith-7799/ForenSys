/**
 * ForenSys end-to-end smoke test.
 *
 * Exercises every use-case ellipse from the design diagram and -- just as
 * importantly -- asserts that the WRONG role is actually blocked by the server,
 * not merely hidden in the UI.
 *
 * Usage:
 *   node scripts/smoke-test.mjs                # expects the API on :4000
 *   API_URL=http://localhost:4000 node scripts/smoke-test.mjs
 *
 * Assumes a freshly seeded database (npm run seed).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const API = process.env.API_URL ?? 'http://localhost:4000';

const ACCOUNTS = {
  io: { badgeNumber: 'BADGE-9081', password: 'Forensys@123', label: 'Investigating Officer' },
  lab: { badgeNumber: 'BADGE-9082', password: 'Forensys@123', label: 'Lab Analyst' },
  admin: { badgeNumber: 'BADGE-9083', password: 'Forensys@123', label: 'System Administrator' },
  judicial: { badgeNumber: 'BADGE-9085', password: 'Forensys@123', label: 'Judicial Authority' },
};

const results = [];
let createdCaseId = null;
let createdEvidenceId = null;

function record(name, ok, detail) {
  results.push({ name, ok, detail });
  const badge = ok ? 'PASS' : 'FAIL';
  console.log(`  [${badge}] ${name}${detail ? ` -- ${detail}` : ''}`);
}

function check(name, condition, detail = '') {
  record(name, Boolean(condition), detail);
}

async function api(method, urlPath, { token, body, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) {
    payload = form;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  const res = await fetch(`${API}${urlPath}`, { method, headers, body: payload });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json };
}

async function login(key) {
  const account = ACCOUNTS[key];
  const res = await api('POST', '/api/auth/login', {
    body: { badgeNumber: account.badgeNumber, password: account.password },
  });
  if (res.status !== 200) throw new Error(`Login failed for ${key}: ${res.status} ${JSON.stringify(res.json)}`);
  return res.json;
}

async function main() {
  console.log(`ForenSys smoke test against ${API}\n`);

  // ---------------------------------------------------------------------
  // 1. Authenticate User
  // ---------------------------------------------------------------------
  console.log('1. Authenticate User');

  const health = await api('GET', '/api/health');
  check('API health endpoint responds', health.status === 200);

  const badLogin = await api('POST', '/api/auth/login', {
    body: { badgeNumber: 'BADGE-9081', password: 'definitely-wrong' },
  });
  check('Login rejects a wrong password', badLogin.status === 401, `status ${badLogin.status}`);

  const unknownUser = await api('POST', '/api/auth/login', {
    body: { badgeNumber: 'BADGE-DOES-NOT-EXIST', password: 'whatever' },
  });
  check('Login rejects an unknown badge number', unknownUser.status === 401, `status ${unknownUser.status}`);

  const sessions = {};
  for (const key of Object.keys(ACCOUNTS)) {
    sessions[key] = await login(key);
  }
  check('All four roles can log in', Object.keys(sessions).length === 4);

  const io = sessions.io.accessToken;
  const lab = sessions.lab.accessToken;
  const admin = sessions.admin.accessToken;
  const judicial = sessions.judicial.accessToken;

  const me = await api('GET', '/api/auth/me', { token: io });
  check(
    'GET /auth/me returns the caller profile with role',
    me.status === 200 && me.json?.officer?.role === 'Investigating Officer',
  );

  const refresh = await api('POST', '/api/auth/refresh', {
    body: { refreshToken: sessions.io.refreshToken },
  });
  check('Refresh token issues a new token pair', refresh.status === 200 && !!refresh.json?.accessToken);

  const refreshMisuse = await api('POST', '/api/auth/refresh', {
    body: { refreshToken: io },
  });
  check('Refresh rejects an access token used as a refresh token', refreshMisuse.status === 401, `status ${refreshMisuse.status}`);

  const noToken = await api('GET', '/api/cases');
  check('Protected route rejects a request with no token', noToken.status === 401, `status ${noToken.status}`);

  const logout = await api('POST', '/api/auth/logout', { token: io });
  check('Logout succeeds for an authenticated caller', logout.status === 204, `status ${logout.status}`);

  // ---------------------------------------------------------------------
  // 2. Create Crime Report
  // ---------------------------------------------------------------------
  console.log('\n2. Create Crime Report');

  const created = await api('POST', '/api/cases', {
    token: io,
    body: {
      title: 'Smoke Test Case',
      incidentTimestamp: new Date().toISOString(),
      locationPoint: '51.5074,-0.1278',
    },
  });
  createdCaseId = created.json?.case?.caseId ?? null;
  check('Investigating Officer can create a case', created.status === 201, `status ${created.status}`);
  check(
    'Lead officer auto-assigned to the logged-in officer',
    created.json?.case?.leadOfficerId === me.json?.officer?.officerId,
  );
  check('New case defaults to status "open"', created.json?.case?.status === 'open');

  const labCreate = await api('POST', '/api/cases', {
    token: lab,
    body: { title: 'Lab cannot do this', incidentTimestamp: new Date().toISOString(), locationPoint: '0,0' },
  });
  check('Lab Analyst is BLOCKED from creating a case', labCreate.status === 403, `status ${labCreate.status}`);

  const adminCreate = await api('POST', '/api/cases', {
    token: admin,
    body: { title: 'Admin cannot do this', incidentTimestamp: new Date().toISOString(), locationPoint: '0,0' },
  });
  check('System Administrator is BLOCKED from creating a case', adminCreate.status === 403, `status ${adminCreate.status}`);

  const badCase = await api('POST', '/api/cases', { token: io, body: { title: '' } });
  check('Case creation validates required fields', badCase.status === 400, `status ${badCase.status}`);

  // ---------------------------------------------------------------------
  // 3. Register Evidence Item (physical + digital branches)
  // ---------------------------------------------------------------------
  console.log('\n3. Register Evidence Item');

  const physical = await api('POST', '/api/evidence', {
    token: io,
    body: {
      caseId: createdCaseId,
      evidenceType: 'Weapon',
      collectionTimestamp: new Date().toISOString(),
      physical: { storageLockerNumber: 'LOCKER-Z01', sealNumber: 'SEAL-77777', containerType: 'Steel Case' },
    },
  });
  check('Physical evidence registers', physical.status === 201, `status ${physical.status}`);
  check('Physical subtype row was written', !!physical.json?.evidence?.physical);

  const sha = 'a'.repeat(64);
  const digital = await api('POST', '/api/evidence', {
    token: io,
    body: {
      caseId: createdCaseId,
      evidenceType: 'Digital Device',
      collectionTimestamp: new Date().toISOString(),
      digital: { fileHashSha256: sha, mediaType: 'Disk Image (.raw)', sizeMb: 250.5, deviceSerial: 'SN-TEST-0001' },
    },
  });
  check('Digital evidence registers', digital.status === 201, `status ${digital.status}`);
  check('Digital subtype row was written', !!digital.json?.evidence?.digital);
  createdEvidenceId = digital.json?.evidence?.evidenceId ?? null;

  const wrongSubtype = await api('POST', '/api/evidence', {
    token: io,
    body: {
      caseId: createdCaseId,
      evidenceType: 'Digital Device',
      collectionTimestamp: new Date().toISOString(),
      physical: { storageLockerNumber: 'X', sealNumber: 'Y', containerType: 'Z' },
    },
  });
  check(
    'Digital evidence type rejects physical-only payload',
    wrongSubtype.status === 400,
    `status ${wrongSubtype.status}`,
  );

  const badHash = await api('POST', '/api/evidence', {
    token: io,
    body: {
      caseId: createdCaseId,
      evidenceType: 'Digital Device',
      collectionTimestamp: new Date().toISOString(),
      digital: { fileHashSha256: 'too-short', mediaType: 'x', sizeMb: 1, deviceSerial: 's' },
    },
  });
  check('SHA-256 hash format is validated', badHash.status === 400, `status ${badHash.status}`);

  const badSize = await api('POST', '/api/evidence', {
    token: io,
    body: {
      caseId: createdCaseId,
      evidenceType: 'Digital Device',
      collectionTimestamp: new Date().toISOString(),
      digital: { fileHashSha256: sha, mediaType: 'x', sizeMb: -5, deviceSerial: 's' },
    },
  });
  check('Non-positive size_mb is rejected', badSize.status === 400, `status ${badSize.status}`);

  const labEvidence = await api('POST', '/api/evidence', {
    token: lab,
    body: {
      caseId: createdCaseId,
      evidenceType: 'Document',
      collectionTimestamp: new Date().toISOString(),
      physical: { storageLockerNumber: 'X', sealNumber: 'Y', containerType: 'Z' },
    },
  });
  check('Lab Analyst is BLOCKED from registering evidence', labEvidence.status === 403, `status ${labEvidence.status}`);

  // TRG_PREVENT_CLOSED_CASE_EVID -- CASE-2024-05 is seeded as 'closed'.
  const closedCase = await api('POST', '/api/evidence', {
    token: io,
    body: {
      caseId: 'CASE-2024-05',
      evidenceType: 'Other',
      collectionTimestamp: new Date().toISOString(),
      physical: { storageLockerNumber: 'X', sealNumber: 'Y', containerType: 'Z' },
    },
  });
  check(
    'Evidence into a CLOSED case is blocked',
    closedCase.status === 409,
    `status ${closedCase.status}: ${closedCase.json?.message ?? ''}`,
  );

  // ---------------------------------------------------------------------
  // 4. Log Chain of Custody
  // ---------------------------------------------------------------------
  console.log('\n4. Log Chain of Custody');

  const ioId = me.json.officer.officerId;
  const labId = sessions.lab.officer.officerId;

  const custody = await api('POST', '/api/custody', {
    token: io,
    body: { evidenceId: createdEvidenceId, releasedById: ioId, receivedById: labId, mongoDocRef: '65b2f11a9a8c123456789ff' },
  });
  check('Investigating Officer can log a custody transfer', custody.status === 201, `status ${custody.status}`);

  const holder = await api('GET', `/api/custody/holder/${createdEvidenceId}`, { token: io });
  check(
    'Current holder is computed from the latest log entry',
    holder.json?.currentHolder?.officerId === labId,
    holder.json?.currentHolder?.fullName,
  );

  const secondTransfer = await api('POST', '/api/custody', {
    token: lab,
    body: { evidenceId: createdEvidenceId, releasedById: labId, receivedById: ioId },
  });
  check('Lab Analyst can log a custody transfer', secondTransfer.status === 201, `status ${secondTransfer.status}`);

  const wrongReleaser = await api('POST', '/api/custody', {
    token: io,
    body: { evidenceId: createdEvidenceId, releasedById: labId, receivedById: ioId },
  });
  check(
    'Transfer is rejected when the releaser is not the current holder',
    wrongReleaser.status === 400,
    `status ${wrongReleaser.status}`,
  );

  const selfTransfer = await api('POST', '/api/custody', {
    token: io,
    body: { evidenceId: createdEvidenceId, releasedById: ioId, receivedById: ioId },
  });
  check('Transfer to self is rejected', selfTransfer.status === 400, `status ${selfTransfer.status}`);

  const adminCustody = await api('POST', '/api/custody', {
    token: admin,
    body: { evidenceId: createdEvidenceId, releasedById: ioId, receivedById: labId },
  });
  check('System Administrator is BLOCKED from logging custody', adminCustody.status === 403, `status ${adminCustody.status}`);

  const judicialCustody = await api('POST', '/api/custody', {
    token: judicial,
    body: { evidenceId: createdEvidenceId, releasedById: ioId, receivedById: labId },
  });
  check('Judicial Authority is BLOCKED from logging custody', judicialCustody.status === 403, `status ${judicialCustody.status}`);

  // ---------------------------------------------------------------------
  // 5. Upload Laboratory and Witness Reports
  // ---------------------------------------------------------------------
  console.log('\n5. Upload Laboratory and Witness Reports');

  const tmpFile = path.join(os.tmpdir(), `forensys-smoke-${Date.now()}.txt`);
  fs.writeFileSync(tmpFile, 'Forensic laboratory report -- smoke test fixture.\n');

  async function uploadReport(token, reportType, extra = {}) {
    const form = new FormData();
    form.append('file', new Blob([fs.readFileSync(tmpFile)], { type: 'text/plain' }), 'lab-report.txt');
    form.append('reportType', reportType);
    for (const [k, v] of Object.entries(extra)) form.append(k, v);
    const res = await fetch(`${API}/api/reports`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const text = await res.text();
    return { status: res.status, json: text ? JSON.parse(text) : null };
  }

  const labUpload = await uploadReport(lab, 'Laboratory', { evidenceId: createdEvidenceId, caseId: createdCaseId });
  check('Lab Analyst can upload a report', labUpload.status === 201, `status ${labUpload.status}`);

  const ioUpload = await uploadReport(io, 'Witness', { caseId: createdCaseId });
  check('Investigating Officer is BLOCKED from uploading a report', ioUpload.status === 403, `status ${ioUpload.status}`);

  const noParent = await uploadReport(lab, 'Witness');
  check('Upload without a case or evidence parent is rejected', noParent.status === 400, `status ${noParent.status}`);

  const listReports = await api('GET', `/api/reports?caseId=${createdCaseId}`, { token: lab });
  check('Reports can be listed', listReports.status === 200 && listReports.json.reports.length >= 1);

  if (labUpload.json?.report?.reportId) {
    const dl = await fetch(`${API}/api/reports/${labUpload.json.report.reportId}/download`, {
      headers: { Authorization: `Bearer ${lab}` },
    });
    check('Uploaded report can be downloaded', dl.status === 200, `status ${dl.status}`);
  }

  fs.rmSync(tmpFile, { force: true });

  // ---------------------------------------------------------------------
  // 6. View Case Timeline
  // ---------------------------------------------------------------------
  console.log('\n6. View Case Timeline');

  const timeline = await api('GET', `/api/cases/${createdCaseId}/timeline`, { token: io });
  const kinds = new Set((timeline.json?.timeline ?? []).map((e) => e.kind));
  check('Timeline returns for the Investigating Officer', timeline.status === 200);
  check(
    'Timeline includes evidence + custody events',
    kinds.has('evidence_collected') && kinds.has('custody_transfer'),
    [...kinds].join(', '),
  );

  // A status change must produce a CASE_AUDIT_LOG row via the database trigger.
  const statusChange = await api('PATCH', `/api/cases/${createdCaseId}`, {
    token: io,
    body: { status: 'under_investigation' },
  });
  check('Case status can be changed', statusChange.status === 200 && statusChange.json?.case?.status === 'under_investigation');

  const afterStatus = await api('GET', `/api/cases/${createdCaseId}/timeline`, { token: io });
  const statusEvents = (afterStatus.json?.timeline ?? []).filter((e) => e.kind === 'status_change');
  check(
    'TRG_AUDIT_CASE_STATUS wrote an audit row on status change',
    statusEvents.length >= 1,
    statusEvents[0]?.title,
  );
  check(
    'Audit row attributes the change to the acting officer',
    (statusEvents[0]?.detail ?? '').includes('Det. Robert Vance'),
    statusEvents[0]?.detail,
  );

  // Seeded case: CASE-2024-05 was closed by the seed, so it must carry audit rows.
  const seededTimeline = await api('GET', '/api/cases/CASE-2024-01/timeline', { token: lab });
  check('Seeded case timeline is readable by the Lab Analyst', seededTimeline.status === 200);

  const judicialTimeline = await api('GET', '/api/cases/CASE-2024-01/timeline', { token: judicial });
  check('Judicial Authority has read-only timeline access', judicialTimeline.status === 200);

  // ---------------------------------------------------------------------
  // 7. View Analytics Dashboard
  // ---------------------------------------------------------------------
  console.log('\n7. View Analytics Dashboard');

  const summary = await api('GET', '/api/dashboard/summary', { token: admin });
  check('System Administrator can load the dashboard', summary.status === 200, `status ${summary.status}`);

  const s = summary.json ?? {};
  check('Case counts grouped by status', (s.caseCountsByStatus ?? []).length > 0);
  check('Evidence counts grouped by type', (s.evidenceCountsByType ?? []).length > 0);
  check('Digital size stats (avg/max/min) by media type', (s.digitalSizeByMediaType ?? []).length > 0);
  check('Officer workload computed', (s.officerWorkload ?? []).length > 0);

  const digitalRow = (s.digitalSizeByMediaType ?? [])[0];
  check(
    'Digital size stats carry avg, max and min',
    digitalRow && typeof digitalRow.avgSizeMb === 'number' && typeof digitalRow.maxSizeMb === 'number' && typeof digitalRow.minSizeMb === 'number',
    digitalRow ? `${digitalRow.mediaType}: avg ${digitalRow.avgSizeMb}, max ${digitalRow.maxSizeMb}, min ${digitalRow.minSizeMb}` : '',
  );

  const ioDash = await api('GET', '/api/dashboard/summary', { token: io });
  check('Investigating Officer is BLOCKED from the dashboard', ioDash.status === 403, `status ${ioDash.status}`);

  const labDash = await api('GET', '/api/dashboard/summary', { token: lab });
  check('Lab Analyst is BLOCKED from the dashboard', labDash.status === 403, `status ${labDash.status}`);

  const rollup = await api('GET', '/api/dashboard/rollup', { token: admin });
  check('GROUP BY ROLLUP endpoint responds', rollup.status === 200 && Array.isArray(rollup.json?.rollup));
  check(
    'ROLLUP emits grand-total and subtotal rows',
    (rollup.json?.rollup ?? []).some((r) => r.caseStatus === 'TOTAL ALL STATUSES') &&
      (rollup.json?.rollup ?? []).some((r) => r.evidenceType === 'SUBTOTAL TYPE'),
  );

  // ---------------------------------------------------------------------
  // System Administrator: manage users
  // ---------------------------------------------------------------------
  console.log('\n8. Manage Users (System Administrator)');

  const newBadge = `BADGE-SMOKE-${Date.now()}`;
  const newUser = await api('POST', '/api/officers', {
    token: admin,
    body: { badgeNumber: newBadge, fullName: 'Smoke Test Officer', role: 'Lab Analyst', password: 'SmokeTest@123' },
  });
  check('Admin can create a user', newUser.status === 201, `status ${newUser.status}`);

  const newLogin = await api('POST', '/api/auth/login', {
    body: { badgeNumber: newBadge, password: 'SmokeTest@123' },
  });
  check('The new user can authenticate', newLogin.status === 200, `status ${newLogin.status}`);

  const ioUserCreate = await api('POST', '/api/officers', {
    token: io,
    body: { badgeNumber: 'BADGE-NOPE', fullName: 'Nope', role: 'Lab Analyst', password: 'Nope@1234' },
  });
  check('Non-admin is BLOCKED from creating users', ioUserCreate.status === 403, `status ${ioUserCreate.status}`);

  const duplicate = await api('POST', '/api/officers', {
    token: admin,
    body: { badgeNumber: 'BADGE-9081', fullName: 'Duplicate', role: 'Lab Analyst', password: 'Duplicate@123' },
  });
  check('Duplicate badge number is rejected', duplicate.status === 409, `status ${duplicate.status}`);

  if (newUser.json?.officer?.officerId) {
    const del = await api('DELETE', `/api/officers/${newUser.json.officer.officerId}`, { token: admin });
    check('Admin can delete an unreferenced user', del.status === 204, `status ${del.status}`);
  }

  const delReferenced = await api('DELETE', `/api/officers/${ioId}`, { token: admin });
  check(
    'Deleting an officer still referenced by cases is refused',
    delReferenced.status === 409,
    `status ${delReferenced.status}`,
  );

  const roles = await api('GET', '/api/officers/roles', { token: io });
  check('Officer directory is readable for pickers', roles.status === 200 && roles.json.roles.length === 4);

  // ---------------------------------------------------------------------
  // Cleanup: remove the smoke-test case (cascades to its evidence + custody rows)
  // ---------------------------------------------------------------------
  if (createdCaseId) {
    await api('DELETE', `/api/cases/${createdCaseId}`, { token: admin });
  }

  // ---------------------------------------------------------------------
  // Report
  // ---------------------------------------------------------------------
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);

  console.log(`\n${'='.repeat(72)}`);
  console.log(`  ${passed}/${results.length} checks passed`);
  if (failed.length > 0) {
    console.log(`\n  Failures:`);
    for (const f of failed) console.log(`    - ${f.name}${f.detail ? ` (${f.detail})` : ''}`);
  }
  console.log('='.repeat(72));

  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('\nSmoke test crashed:', err);
  process.exit(1);
});
