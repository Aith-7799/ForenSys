/**
 * ForenSys seed script.
 *
 * Fill in your real data in the arrays below (OFFICERS, CASES, EVIDENCE, etc.)
 * then run:  npm run seed
 *
 * The wipe() function clears ALL existing records before inserting.
 * Trigger tests (TC-03, TC-04) run automatically after data insertion.
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { prisma } from '../src/lib/prisma.js';

/** Every seeded account shares this password. Change to your real password. */
const DEMO_PASSWORD = 'Forensys@123';
const BCRYPT_ROUNDS = 10;

/** Build a JS Date whose UTC wall-clock matches the Oracle TIMESTAMP literal. */
const ts = (y: number, m: number, d: number, h = 0, min = 0) =>
  new Date(Date.UTC(y, m - 1, d, h, min, 0));

// ---------------------------------------------------------------------------
// YOUR REAL DATA — fill these arrays with your actual records
// ---------------------------------------------------------------------------

/**
 * OFFICERS
 * roles: 'Investigating Officer' | 'Lab Analyst' | 'System Administrator' | 'Judicial Authority'
 *
 * Example:
 * { officerId: 'OFF-101', badgeNumber: 'IO-001', fullName: 'Det. Robert Vance', role: 'Investigating Officer' },
 */
const OFFICERS: Array<{
  officerId: string;
  badgeNumber: string;
  fullName: string;
  role: string;
}> = [
  // ↓ ADD YOUR OFFICERS HERE ↓
  // { officerId: 'OFF-101', badgeNumber: 'IO-001', fullName: 'Your Name', role: 'Investigating Officer' },
];

/**
 * CASES
 * status: 'open' | 'under_investigation' | 'in_court' | 'closed' | 'archived'
 * locationPoint: 'latitude,longitude'  e.g. '28.6139,77.2090'
 *
 * NOTE: If any case needs to be 'closed' AND also has evidence,
 * set status to 'open' here and use CASE_CLOSED_DURING_SEED below.
 */
// const CASE_CLOSED_DURING_SEED = 'CASE-XXXX-XX'; // set this if a case must be closed after evidence insertion

const CASES: Array<{
  caseId: string;
  title: string;
  incidentTimestamp: Date;
  locationPoint: string;
  status: string;
  leadOfficerId: string;
}> = [
  // ↓ ADD YOUR CASES HERE ↓
  // { caseId: 'CASE-2024-01', title: 'Your Case Title', incidentTimestamp: ts(2024, 1, 15, 8, 30), locationPoint: '28.6139,77.2090', status: 'open', leadOfficerId: 'OFF-101' },
];

/**
 * EVIDENCE (base records)
 * evidenceType: 'Weapon' | 'Biological' | 'Digital Device' | 'Document' | 'Clothing' | 'Fingerprint' | 'Other'
 */
const EVIDENCE: Array<{
  evidenceId: string;
  caseId: string;
  evidenceType: string;
  collectionTimestamp: Date;
}> = [
  // ↓ ADD YOUR EVIDENCE HERE ↓
  // { evidenceId: 'EV-801', caseId: 'CASE-2024-01', evidenceType: 'Digital Device', collectionTimestamp: ts(2024, 1, 15, 10, 0) },
];

/**
 * PHYSICAL EVIDENCE (linked to EVIDENCE by evidenceId)
 */
const PHYSICAL_EVIDENCE: Array<{
  evidenceId: string;
  storageLockerNumber: string;
  sealNumber: string;
  containerType: string;
}> = [
  // ↓ ADD YOUR PHYSICAL EVIDENCE HERE ↓
  // { evidenceId: 'EV-803', storageLockerNumber: 'LOCKER-A12', sealNumber: 'SEAL-99401', containerType: 'Heavy Metal Vault Container' },
];

/**
 * DIGITAL EVIDENCE (linked to EVIDENCE by evidenceId)
 * fileHashSha256: SHA-256 hash of the digital file
 * mediaType: e.g. 'Disk Image (.raw)', 'Database Dump (.sql)', etc.
 * sizeMb: file size in megabytes
 */
const DIGITAL_EVIDENCE: Array<{
  evidenceId: string;
  fileHashSha256: string;
  mediaType: string;
  sizeMb: number;
  deviceSerial: string;
}> = [
  // ↓ ADD YOUR DIGITAL EVIDENCE HERE ↓
  // { evidenceId: 'EV-801', fileHashSha256: 'abc123...', mediaType: 'Disk Image (.raw)', sizeMb: 1500.50, deviceSerial: 'SN-SERVER-9921' },
];

/**
 * CUSTODY LOG (chain of custody transfers)
 * releasedById / receivedById must be valid officerIds from OFFICERS above
 */
const CUSTODY_LOG: Array<{
  logId: string;
  evidenceId: string;
  releasedById: string;
  receivedById: string;
  transferTimestamp: Date;
  mongoDocRef?: string;
}> = [
  // ↓ ADD YOUR CUSTODY LOG ENTRIES HERE ↓
  // { logId: 'LOG-5001', evidenceId: 'EV-801', releasedById: 'OFF-101', receivedById: 'OFF-102', transferTimestamp: ts(2024, 1, 15, 14, 0) },
];

// ---------------------------------------------------------------------------
// SEED ENGINE — no need to edit below this line
// ---------------------------------------------------------------------------

async function wipe() {
  console.log('  Wiping reports...');       await prisma.report.deleteMany();
  console.log('  Wiping audit logs...');    await prisma.caseAuditLog.deleteMany();
  console.log('  Wiping custody logs...');  await prisma.custodyLog.deleteMany();
  console.log('  Wiping digital evid...');  await prisma.digitalEvidence.deleteMany();
  console.log('  Wiping physical evid...'); await prisma.physicalEvidence.deleteMany();
  console.log('  Wiping evidence...');      await prisma.evidence.deleteMany();
  console.log('  Wiping cases...');         await prisma.case.deleteMany();
  console.log('  Wiping officers...');      await prisma.officer.deleteMany();
}

async function main() {
  await prisma.$connect();
  console.log('\nForenSys seed — wiping existing data...');
  await wipe();

  console.log('\nForenSys seed — hashing passwords with bcrypt...');
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, BCRYPT_ROUNDS);

  // --- OFFICERS ---
  if (OFFICERS.length === 0) {
    console.log('\n⚠️  No officers defined — skipping. Add records to the OFFICERS array.');
  } else {
    console.log(`\nForenSys seed — inserting ${OFFICERS.length} OFFICERS...`);
    for (const o of OFFICERS) {
      await prisma.officer.create({ data: { ...o, passwordHash } });
      console.log(`  ✓ ${o.badgeNumber} — ${o.fullName} (${o.role})`);
    }
  }

  // --- CASES ---
  if (CASES.length === 0) {
    console.log('\n⚠️  No cases defined — skipping. Add records to the CASES array.');
  } else {
    console.log(`\nForenSys seed — inserting ${CASES.length} CASES...`);
    for (const c of CASES) {
      await prisma.case.create({ data: c });
      console.log(`  ✓ ${c.caseId} — ${c.title} [${c.status}]`);
    }
  }

  // --- EVIDENCE ---
  if (EVIDENCE.length === 0) {
    console.log('\n⚠️  No evidence defined — skipping. Add records to the EVIDENCE array.');
  } else {
    console.log(`\nForenSys seed — inserting ${EVIDENCE.length} EVIDENCE records...`);
    for (const e of EVIDENCE) {
      await prisma.evidence.create({ data: e });
      console.log(`  ✓ ${e.evidenceId} — ${e.evidenceType} (${e.caseId})`);
    }
  }

  // --- PHYSICAL EVIDENCE ---
  if (PHYSICAL_EVIDENCE.length > 0) {
    console.log(`\nForenSys seed — inserting ${PHYSICAL_EVIDENCE.length} PHYSICAL EVIDENCE subtypes...`);
    for (const p of PHYSICAL_EVIDENCE) {
      await prisma.physicalEvidence.create({ data: p });
      console.log(`  ✓ ${p.evidenceId} → locker ${p.storageLockerNumber}`);
    }
  }

  // --- DIGITAL EVIDENCE ---
  if (DIGITAL_EVIDENCE.length > 0) {
    console.log(`\nForenSys seed — inserting ${DIGITAL_EVIDENCE.length} DIGITAL EVIDENCE subtypes...`);
    for (const d of DIGITAL_EVIDENCE) {
      await prisma.digitalEvidence.create({ data: d });
      console.log(`  ✓ ${d.evidenceId} → ${d.mediaType} (${d.sizeMb} MB)`);
    }
  }

  // --- CUSTODY LOG ---
  if (CUSTODY_LOG.length === 0) {
    console.log('\n⚠️  No custody log entries defined — skipping.');
  } else {
    console.log(`\nForenSys seed — inserting ${CUSTODY_LOG.length} CUSTODY LOG entries...`);
    for (const l of CUSTODY_LOG) {
      await prisma.custodyLog.create({ data: l });
      console.log(`  ✓ ${l.logId} — ${l.evidenceId}: ${l.releasedById} → ${l.receivedById}`);
    }
  }

  // -------------------------------------------------------------------------
  // TC-03: TRG_AUDIT_CASE_STATUS — runs automatically if cases exist
  // -------------------------------------------------------------------------
  // Uncomment and edit to test the status-change audit trigger:
  //
  // if (CASES.length > 0) {
  //   const testCaseId = CASES[0].caseId;
  //   console.log(`\nTC-03: testing audit trigger on ${testCaseId}...`);
  //   await prisma.$executeRawUnsafe(
  //     `SELECT sp_change_case_status('${testCaseId}', 'in_court', 'Admin')`,
  //   );
  //   await prisma.$executeRawUnsafe(
  //     `SELECT sp_change_case_status('${testCaseId}', '${CASES[0].status}', 'Admin')`,
  //   );
  //   const auditRows = await prisma.caseAuditLog.findMany({ orderBy: { auditId: 'asc' } });
  //   for (const r of auditRows) {
  //     console.log(`  audit_id=${r.auditId} ${r.caseId}: ${r.oldStatus} -> ${r.newStatus} by ${r.changedBy}`);
  //   }
  // }

  // -------------------------------------------------------------------------
  // TC-04: TRG_PREVENT_CLOSED_CASE_EVID — evidence on closed case must be blocked
  // -------------------------------------------------------------------------
  // Uncomment and set closedCaseId to a real closed case to test the trigger:
  //
  // const closedCaseId = 'CASE-XXXX-XX';
  // console.log('\nTC-04: testing closed-case evidence block...');
  // try {
  //   await prisma.$executeRawUnsafe(
  //     `INSERT INTO evidence (evidence_id, case_id, evidence_type, collection_timestamp)
  //      VALUES ('EV-FAIL-01', '${closedCaseId}', 'Weapon', CURRENT_TIMESTAMP)`,
  //   );
  //   console.log('  ✗ UNEXPECTED: insert succeeded — trigger did not fire!');
  // } catch (err) {
  //   const msg = err instanceof Error ? err.message : String(err);
  //   console.log(`  ✓ blocked as expected → ${msg.split('\n')[0]}`);
  // }

  // --- Final counts ---
  const counts: Array<[string, number]> = [
    ['OFFICERS',         await prisma.officer.count()],
    ['CASES',            await prisma.case.count()],
    ['EVIDENCE',         await prisma.evidence.count()],
    ['PHYSICAL_EVIDENCE',await prisma.physicalEvidence.count()],
    ['DIGITAL_EVIDENCE', await prisma.digitalEvidence.count()],
    ['CUSTODY_LOG',      await prisma.custodyLog.count()],
    ['CASE_AUDIT_LOG',   await prisma.caseAuditLog.count()],
    ['REPORTS',          await prisma.report.count()],
  ];

  console.log('\n─────────────────────────────────────────');
  console.log('  Table                  Rows');
  console.log('─────────────────────────────────────────');
  for (const [name, n] of counts) {
    console.log(`  ${name.padEnd(22)} ${n}`);
  }
  console.log('─────────────────────────────────────────');
  console.log(`\n✅ Seed complete! Password for all accounts: ${DEMO_PASSWORD}\n`);
}

main()
  .catch((e) => {
    console.error('\n❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
