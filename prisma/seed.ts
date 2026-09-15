/**
 * ForenSys seed script.
 *
 * Loads the real-world forensic dataset from section 3 of the DA-2 report
 * (docs/oracle-11g-reference.sql) and, because the report used plaintext
 * placeholder strings ('hash_vance_9081'), replaces every password_hash with a
 * real bcrypt hash of the demo password below.
 *
 * It then re-runs the report's own trigger tests:
 *   TC-03 -> TRG_AUDIT_CASE_STATUS   (status change writes a CASE_AUDIT_LOG row)
 *   TC-04 -> TRG_PREVENT_CLOSED_CASE_EVID (insert into a closed case is blocked)
 *
 * Run with: npm run seed
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

/** Every seeded account shares this password. Documented in the README. */
const DEMO_PASSWORD = 'Forensys@123';
const BCRYPT_ROUNDS = 10;

/** Build a JS Date whose UTC wall-clock matches the Oracle TIMESTAMP literal. */
const ts = (y: number, m: number, d: number, h = 0, min = 0) =>
  new Date(Date.UTC(y, m - 1, d, h, min, 0));

// ---------------------------------------------------------------------------
// Section 3.1 -- DML data insertion statements, verbatim from the report
// ---------------------------------------------------------------------------

const OFFICERS = [
  { officerId: 'OFF-101', badgeNumber: 'BADGE-9081', fullName: 'Det. Robert Vance', role: 'Investigating Officer' },
  { officerId: 'OFF-102', badgeNumber: 'BADGE-9082', fullName: 'Dr. Sarah Connor', role: 'Lab Analyst' },
  { officerId: 'OFF-103', badgeNumber: 'BADGE-9083', fullName: 'Admin Marcus Wright', role: 'System Administrator' },
  { officerId: 'OFF-104', badgeNumber: 'BADGE-9084', fullName: 'Det. Elena Rostova', role: 'Investigating Officer' },
  { officerId: 'OFF-105', badgeNumber: 'BADGE-9085', fullName: 'Judge Arthur Pendelton', role: 'Judicial Authority' },
  { officerId: 'OFF-106', badgeNumber: 'BADGE-9086', fullName: 'Dr. Alan Turing', role: 'Lab Analyst' },
];

/**
 * CASE-2024-05 ends the seed run as 'closed', exactly as the report's dataset says.
 *
 * It cannot START closed, though. The dataset puts EV-807 inside this case, and
 * trg_prevent_closed_case_evid would block that insert -- correctly, it is a real
 * business rule. In the Oracle report this never surfaced because section 3 (data)
 * ran before section 8 (triggers); here the trigger is part of the migration and is
 * always present.
 *
 * So we load the case as 'open', collect its evidence, and then close it through
 * sp_change_case_status(). That honours the rule and, as a bonus, the closure shows
 * up in CASE_AUDIT_LOG as a genuine audited status transition.
 */
const CASE_CLOSED_DURING_SEED = 'CASE-2024-05';

const CASES = [
  { caseId: 'CASE-2024-01', title: 'Downtown Bank Cyber Attack', incidentTimestamp: ts(2024, 1, 15, 8, 30), locationPoint: '40.7128,-74.0060', status: 'under_investigation', leadOfficerId: 'OFF-101' },
  { caseId: 'CASE-2024-02', title: 'Westside Homicide Investigation', incidentTimestamp: ts(2024, 2, 10, 21, 15), locationPoint: '34.0522,-118.2437', status: 'open', leadOfficerId: 'OFF-104' },
  { caseId: 'CASE-2024-03', title: 'Corporate Financial Fraud Audit', incidentTimestamp: ts(2024, 3, 1, 11, 0), locationPoint: '41.8781,-87.6298', status: 'in_court', leadOfficerId: 'OFF-101' },
  { caseId: 'CASE-2024-04', title: 'Harbor Warehouse Narcotics Seizure', incidentTimestamp: ts(2024, 3, 20, 2, 45), locationPoint: '25.7617,-80.1918', status: 'open', leadOfficerId: 'OFF-104' },
  { caseId: 'CASE-2024-05', title: 'Metro Jewelry Store Robbery', incidentTimestamp: ts(2024, 4, 5, 14, 20), locationPoint: '37.7749,-122.4194', status: 'closed', leadOfficerId: 'OFF-101' },
];

const EVIDENCE = [
  { evidenceId: 'EV-801', caseId: 'CASE-2024-01', evidenceType: 'Digital Device', collectionTimestamp: ts(2024, 1, 15, 10, 0) },
  { evidenceId: 'EV-802', caseId: 'CASE-2024-01', evidenceType: 'Document', collectionTimestamp: ts(2024, 1, 15, 11, 30) },
  { evidenceId: 'EV-803', caseId: 'CASE-2024-02', evidenceType: 'Weapon', collectionTimestamp: ts(2024, 2, 10, 22, 45) },
  { evidenceId: 'EV-804', caseId: 'CASE-2024-02', evidenceType: 'Biological', collectionTimestamp: ts(2024, 2, 10, 23, 15) },
  { evidenceId: 'EV-805', caseId: 'CASE-2024-03', evidenceType: 'Digital Device', collectionTimestamp: ts(2024, 3, 1, 14, 0) },
  { evidenceId: 'EV-806', caseId: 'CASE-2024-04', evidenceType: 'Other', collectionTimestamp: ts(2024, 3, 20, 4, 0) },
  { evidenceId: 'EV-807', caseId: 'CASE-2024-05', evidenceType: 'Fingerprint', collectionTimestamp: ts(2024, 4, 5, 16, 30) },
];

const PHYSICAL_EVIDENCE = [
  { evidenceId: 'EV-803', storageLockerNumber: 'LOCKER-A12', sealNumber: 'SEAL-99401', containerType: 'Heavy Metal Vault Container' },
  { evidenceId: 'EV-804', storageLockerNumber: 'LOCKER-B04', sealNumber: 'SEAL-99402', containerType: 'Sterile Biohazard Refrigerated Pack' },
  { evidenceId: 'EV-806', storageLockerNumber: 'LOCKER-C09', sealNumber: 'SEAL-99403', containerType: 'Sealed Narcotics Evidence Bag' },
];

const DIGITAL_EVIDENCE = [
  { evidenceId: 'EV-801', fileHashSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', mediaType: 'Disk Image (.raw)', sizeMb: new Prisma.Decimal('1500.50'), deviceSerial: 'SN-SERVER-9921' },
  { evidenceId: 'EV-805', fileHashSha256: '8f434346648f6b96df89dda901c5176b10a6d83961dd3c1ac88b59b2dc327aa4', mediaType: 'Database Dump (.sql)', sizeMb: new Prisma.Decimal('450.75'), deviceSerial: 'SN-LAPTOP-4410' },
];

const CUSTODY_LOG = [
  { logId: 'LOG-5001', evidenceId: 'EV-801', releasedById: 'OFF-101', receivedById: 'OFF-102', transferTimestamp: ts(2024, 1, 15, 14, 0), mongoDocRef: '65b2f11a9a8c123456789a01' },
  { logId: 'LOG-5002', evidenceId: 'EV-801', releasedById: 'OFF-102', receivedById: 'OFF-106', transferTimestamp: ts(2024, 1, 16, 9, 30), mongoDocRef: '65b2f11a9a8c123456789a02' },
  { logId: 'LOG-5003', evidenceId: 'EV-803', releasedById: 'OFF-104', receivedById: 'OFF-102', transferTimestamp: ts(2024, 2, 11, 8, 0), mongoDocRef: '65b2f11a9a8c123456789a03' },
  { logId: 'LOG-5004', evidenceId: 'EV-804', releasedById: 'OFF-104', receivedById: 'OFF-102', transferTimestamp: ts(2024, 2, 11, 8, 30), mongoDocRef: '65b2f11a9a8c123456789a04' },
  { logId: 'LOG-5005', evidenceId: 'EV-805', releasedById: 'OFF-101', receivedById: 'OFF-106', transferTimestamp: ts(2024, 3, 2, 10, 15), mongoDocRef: '65b2f11a9a8c123456789a05' },
];

// ---------------------------------------------------------------------------

async function wipe() {
  // Order matters: children before parents. case_audit_log has no FK (by design,
  // matching Oracle) so it must be cleared explicitly.
  await prisma.report.deleteMany();
  await prisma.caseAuditLog.deleteMany();
  await prisma.custodyLog.deleteMany();
  await prisma.digitalEvidence.deleteMany();
  await prisma.physicalEvidence.deleteMany();
  await prisma.evidence.deleteMany();
  await prisma.case.deleteMany();
  await prisma.officer.deleteMany();
  await prisma.$executeRawUnsafe('ALTER SEQUENCE seq_audit_id RESTART WITH 1');
}

async function main() {
  console.log('ForenSys seed -- wiping existing rows');
  await wipe();

  console.log('ForenSys seed -- hashing passwords with bcrypt');
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, BCRYPT_ROUNDS);

  console.log('ForenSys seed -- inserting OFFICERS');
  for (const o of OFFICERS) {
    await prisma.officer.create({ data: { ...o, passwordHash } });
  }

  console.log('ForenSys seed -- inserting CASES');
  for (const c of CASES) {
    // CASE-2024-05 is loaded open and closed later; see CASE_CLOSED_DURING_SEED.
    const status = c.caseId === CASE_CLOSED_DURING_SEED ? 'open' : c.status;
    await prisma.case.create({ data: { ...c, status } });
  }

  console.log('ForenSys seed -- inserting EVIDENCE (+ physical/digital subtypes)');
  for (const e of EVIDENCE) {
    await prisma.evidence.create({ data: e });
  }
  for (const p of PHYSICAL_EVIDENCE) {
    await prisma.physicalEvidence.create({ data: p });
  }
  for (const d of DIGITAL_EVIDENCE) {
    await prisma.digitalEvidence.create({ data: d });
  }

  console.log('ForenSys seed -- inserting CUSTODY_LOG');
  for (const l of CUSTODY_LOG) {
    await prisma.custodyLog.create({ data: l });
  }

  // Now that EV-807 exists, close CASE-2024-05 the legitimate way. The trigger writes
  // the audit row, so the dataset ends up with the report's status AND a real audit trail.
  console.log('ForenSys seed -- closing CASE-2024-05 via sp_change_case_status');
  await prisma.$executeRawUnsafe(
    `SELECT sp_change_case_status('${CASE_CLOSED_DURING_SEED}', 'closed', 'Det. Robert Vance')`,
  );

  // -------------------------------------------------------------------------
  // TC-03: TRG_AUDIT_CASE_STATUS
  // The report runs: UPDATE CASES SET status='in_court' WHERE case_id='CASE-2024-02'.
  // We drive it through sp_change_case_status() so the audit row is attributed to
  // the acting officer rather than to the Postgres connection role.
  // -------------------------------------------------------------------------
  console.log('\nTC-03: exercising trg_audit_case_status');
  await prisma.$executeRawUnsafe(
    `SELECT sp_change_case_status('CASE-2024-02', 'in_court', 'Admin Marcus Wright')`,
  );
  // Restore the dataset's intended status. This is a second, real status change,
  // so the trigger writes a second audit row -- the log is append-only on purpose.
  await prisma.$executeRawUnsafe(
    `SELECT sp_change_case_status('CASE-2024-02', 'open', 'Admin Marcus Wright')`,
  );
  const auditRows = await prisma.caseAuditLog.findMany({ orderBy: { auditId: 'asc' } });
  for (const r of auditRows) {
    console.log(`  audit_id=${r.auditId} ${r.caseId}: ${r.oldStatus} -> ${r.newStatus} by ${r.changedBy}`);
  }

  // -------------------------------------------------------------------------
  // TC-04: TRG_PREVENT_CLOSED_CASE_EVID
  // The report's commented-out test: inserting into closed CASE-2024-05 must fail
  // with ORA-20001. Here that is SQLSTATE P0001.
  // -------------------------------------------------------------------------
  console.log('\nTC-04: exercising trg_prevent_closed_case_evid (expected to be blocked)');
  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO evidence (evidence_id, case_id, evidence_type, collection_timestamp)
       VALUES ('EV-FAIL-01', 'CASE-2024-05', 'Weapon', CURRENT_TIMESTAMP)`,
    );
    console.log('  UNEXPECTED: insert succeeded, trigger did not fire!');
    process.exitCode = 1;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const line = msg.split('\n').map((l) => l.trim()).filter(Boolean).pop() ?? msg;
    console.log(`  blocked as expected -> ${line}`);
  }

  // -------------------------------------------------------------------------
  // Section 11.1 -- final verification script
  // -------------------------------------------------------------------------
  const counts: Array<[string, number]> = [
    ['OFFICERS', await prisma.officer.count()],
    ['CASES', await prisma.case.count()],
    ['EVIDENCE', await prisma.evidence.count()],
    ['PHYSICAL_EVIDENCE', await prisma.physicalEvidence.count()],
    ['DIGITAL_EVIDENCE', await prisma.digitalEvidence.count()],
    ['CUSTODY_LOG', await prisma.custodyLog.count()],
    ['CASE_AUDIT_LOG', await prisma.caseAuditLog.count()],
    ['REPORTS', await prisma.report.count()],
  ];

  console.log('\n--- Final verification script (DA-2 section 11.1) ---');
  console.log('Table name'.padEnd(20) + 'Rows');
  for (const [name, n] of counts) {
    console.log(name.padEnd(20) + n);
  }

  console.log(`\nSeed complete. Sign in with any badge number above and the password: ${DEMO_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
