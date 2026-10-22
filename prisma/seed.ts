/**
 * ForenSys seed script — Real case data from 8 case files.
 *
 * Sources: Pramod @ Bhoko v. State of Chhattisgarh; Antoney @ Kuttiyachan v. State of Kerala;
 *          Aftab Ahmad Chowdhary v. UT J&K; Zala Mahendrasinh v. Gujarat;
 *          Ketan Lalbhai Rathod v. Gujarat; Narendrabhai Chelabhai Patel v. Gujarat;
 *          Bhimabhai Makvana v. Gujarat; PCIT-2 v. Krishna Gajanan Kesarkar.
 *
 * Fields explicitly stated in case files are used as-is.
 * Fields marked "Not stated / NULL" in the extraction document are filled with
 * operationally plausible values (lockers, serials, hashes) so the DB is fully
 * populated and all UI features work. Those values are noted with [GENERATED].
 *
 * Run:  npm run seed
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { prisma } from '../src/lib/prisma.js';

const DEMO_PASSWORD = 'Forensys@123';
const BCRYPT_ROUNDS = 10;

const ts = (y: number, m: number, d: number, h = 0, min = 0) =>
  new Date(Date.UTC(y, m - 1, d, h, min, 0));

// ---------------------------------------------------------------------------
// OFFICERS
// Cases 1 & 2 have named officers. Cases 3–8 list authorities without personal
// data. Lab Analyst and Judicial Authority roles are added so every system role
// is represented for login/demo purposes. [GENERATED] = badge/password not in source.
// ---------------------------------------------------------------------------
const OFFICERS = [
  // --- From Case 1 (Chhattisgarh) ---
  { officerId: 'OFF-001', badgeNumber: 'IO-001', fullName: 'R.P. Shukla',                            role: 'Investigating Officer' },
  // --- From Case 2 (Kerala) ---
  { officerId: 'OFF-002', badgeNumber: 'IO-002', fullName: 'PW30 Sub Inspector, Thidanadu PS',        role: 'Investigating Officer' },
  { officerId: 'OFF-003', badgeNumber: 'IO-003', fullName: 'PW31 Circle Inspector, Erattupetta',      role: 'Investigating Officer' },
  // --- From Case 3 (J&K) ---
  { officerId: 'OFF-004', badgeNumber: 'SA-001', fullName: 'SSP Srinagar',                            role: 'System Administrator' },
  { officerId: 'OFF-005', badgeNumber: 'IO-004', fullName: 'SHO Police Station Batamaloo',            role: 'Investigating Officer' },
  // --- [GENERATED] Lab Analyst – required for custody transfers & lab role ---
  { officerId: 'OFF-006', badgeNumber: 'LA-001', fullName: 'Dr. Meera Nair',                          role: 'Lab Analyst' },
  // --- [GENERATED] Judicial Authority – required for in_court case review ---
  { officerId: 'OFF-007', badgeNumber: 'JA-001', fullName: 'Judge Priya Mehta',                       role: 'Judicial Authority' },
];

// Cases that must start 'open' so evidence can be inserted, then get closed via trigger
const CLOSE_AFTER_SEED: Record<string, string> = {
  'CASE-001': 'closed',   // Pramod @ Bhoko — appeal decided 18-07-2023
  'CASE-002': 'closed',   // Antoney — appeal decided 15-06-2020
  'CASE-003': 'archived', // Aftab Ahmad — writ disposed 21-10-2026
  'CASE-004': 'archived', // Zala Mahendrasinh — withdrawn 21-10-2026
  'CASE-008': 'archived', // PCIT-2 v. Kesarkar — withdrawn 21-10-2026
};

// ---------------------------------------------------------------------------
// CASES
// location_point: lat,lng (from address in case file; [GENERATED] where only
// a district/city name was given).
// ---------------------------------------------------------------------------
const CASES = [
  {
    caseId: 'CASE-001',
    title: 'Pramod @ Bhoko v. State of Chhattisgarh — Criminal Appeal No. 403 of 2015',
    incidentTimestamp: ts(2013, 10, 12, 20, 0),       // 12-10-2013, between 8–9 PM
    locationPoint: '21.1938,81.2962',                  // [GENERATED] Durg district, CG
    status: 'open',                                    // will be closed after evidence insertion
    leadOfficerId: 'OFF-001',
  },
  {
    caseId: 'CASE-002',
    title: 'Antoney @ Kuttiyachan v. State of Kerala — Crl.A. No. 47 of 2016',
    incidentTimestamp: ts(2014, 4, 16, 9, 30),         // 16-04-2014, around 9:30 AM
    locationPoint: '9.5916,76.5222',                   // [GENERATED] Thidanadu, Kottayam
    status: 'open',                                    // will be closed after evidence insertion
    leadOfficerId: 'OFF-003',
  },
  {
    caseId: 'CASE-003',
    title: 'Aftab Ahmad Chowdhary v. UT of J&K (Home) — WP(C) 2615/2026',
    incidentTimestamp: ts(2026, 10, 21, 10, 0),        // [GENERATED] date of order
    locationPoint: '34.0837,74.7973',                  // Srinagar
    status: 'open',                                    // will be archived after seed
    leadOfficerId: 'OFF-004',
  },
  {
    caseId: 'CASE-004',
    title: 'Zala Mahendrasinh Navalsinh Laxmansinh v. State of Gujarat — Bail App. 24950/2026',
    incidentTimestamp: ts(2026, 10, 21, 11, 0),        // [GENERATED] date of order
    locationPoint: '22.2587,71.1924',                  // [GENERATED] Gujarat
    status: 'open',                                    // will be archived after seed
    leadOfficerId: 'OFF-001',
  },
  {
    caseId: 'CASE-005',
    title: 'Ketan Lalbhai Rathod v. State of Gujarat — Anticipatory Bail App. 24930/2026',
    incidentTimestamp: ts(2026, 8, 1, 0, 0),           // FIR registered 01-08-2026
    locationPoint: '21.5222,70.4579',                  // Junagadh
    status: 'in_court',                                // anticipatory bail granted; in court
    leadOfficerId: 'OFF-002',
  },
  {
    caseId: 'CASE-006',
    title: 'Narendrabhai Chelabhai Patel v. State of Gujarat — Anticipatory Bail App. 24158/2026',
    incidentTimestamp: ts(2026, 1, 1, 0, 0),           // [GENERATED] FIR filed 2026
    locationPoint: '23.8493,72.1266',                  // Patan, Gujarat
    status: 'in_court',                                // anticipatory bail granted
    leadOfficerId: 'OFF-003',
  },
  {
    caseId: 'CASE-007',
    title: 'Bhimabhai s/o Kama Makvana v. State of Gujarat — Bail App. 23039/2026',
    incidentTimestamp: ts(2026, 1, 1, 0, 0),           // [GENERATED] — exact date not stated
    locationPoint: '22.4707,70.0577',                  // Jamnagar
    status: 'in_court',                                // regular bail granted
    leadOfficerId: 'OFF-001',
  },
  {
    caseId: 'CASE-008',
    title: 'Principal Commissioner of Income Tax-2 v. Krishna Gajanan Kesarkar — IT Appeal 127/2016',
    incidentTimestamp: ts(2016, 1, 1, 0, 0),           // [GENERATED] — case filed 2016
    locationPoint: '16.7050,74.2433',                  // Kolhapur
    status: 'open',                                    // will be archived after seed
    leadOfficerId: 'OFF-007',
  },
];

// ---------------------------------------------------------------------------
// EVIDENCE  (only Cases 1 & 2 have explicit evidence in the source files)
// ---------------------------------------------------------------------------
const EVIDENCE = [
  // === CASE-001: Pramod @ Bhoko v. State of Chhattisgarh ===
  { evidenceId: 'EV-001', caseId: 'CASE-001', evidenceType: 'Other',        collectionTimestamp: ts(2013, 10, 13, 8, 0)  }, // Plain soil from spot
  { evidenceId: 'EV-002', caseId: 'CASE-001', evidenceType: 'Biological',   collectionTimestamp: ts(2013, 10, 13, 8, 30) }, // Blood-stained soil
  { evidenceId: 'EV-003', caseId: 'CASE-001', evidenceType: 'Clothing',     collectionTimestamp: ts(2013, 10, 13, 9, 0)  }, // Slippers worn by deceased (Ex. P/14)
  { evidenceId: 'EV-004', caseId: 'CASE-001', evidenceType: 'Weapon',       collectionTimestamp: ts(2013, 10, 13, 9, 30) }, // Axe recovered from appellant (Ex. P/16)
  { evidenceId: 'EV-005', caseId: 'CASE-001', evidenceType: 'Document',     collectionTimestamp: ts(2013, 10, 20, 10, 0) }, // FSL Report (Ex. P/35)
  { evidenceId: 'EV-006', caseId: 'CASE-001', evidenceType: 'Document',     collectionTimestamp: ts(2013, 10, 13, 12, 0) }, // Postmortem Report (Ex. P/33)

  // === CASE-002: Antoney @ Kuttiyachan v. State of Kerala ===
  { evidenceId: 'EV-007', caseId: 'CASE-002', evidenceType: 'Weapon',       collectionTimestamp: ts(2014, 4, 16, 11, 0)  }, // MO1 dagger
  { evidenceId: 'EV-008', caseId: 'CASE-002', evidenceType: 'Weapon',       collectionTimestamp: ts(2014, 4, 16, 11, 10) }, // MO14 knife
  { evidenceId: 'EV-009', caseId: 'CASE-002', evidenceType: 'Other',        collectionTimestamp: ts(2014, 4, 16, 11, 15) }, // MO15 outer cover for dagger
  { evidenceId: 'EV-010', caseId: 'CASE-002', evidenceType: 'Other',        collectionTimestamp: ts(2014, 4, 16, 11, 20) }, // MO16 white button
  { evidenceId: 'EV-011', caseId: 'CASE-002', evidenceType: 'Clothing',     collectionTimestamp: ts(2014, 4, 16, 11, 25) }, // MO17 chappals
  { evidenceId: 'EV-012', caseId: 'CASE-002', evidenceType: 'Document',     collectionTimestamp: ts(2014, 4, 16, 11, 30) }, // MO18 hospital prescription
  { evidenceId: 'EV-013', caseId: 'CASE-002', evidenceType: 'Clothing',     collectionTimestamp: ts(2014, 4, 16, 11, 35) }, // MO2 dhothi (deceased)
  { evidenceId: 'EV-014', caseId: 'CASE-002', evidenceType: 'Digital Device',collectionTimestamp: ts(2014, 4, 16, 11, 40) }, // MO19 mobile phone (deceased)
  { evidenceId: 'EV-015', caseId: 'CASE-002', evidenceType: 'Clothing',     collectionTimestamp: ts(2014, 4, 16, 11, 45) }, // MO12 clothing removed during inquest
  { evidenceId: 'EV-016', caseId: 'CASE-002', evidenceType: 'Clothing',     collectionTimestamp: ts(2014, 4, 16, 17, 30) }, // MO21 dhothi (accused)
  { evidenceId: 'EV-017', caseId: 'CASE-002', evidenceType: 'Clothing',     collectionTimestamp: ts(2014, 4, 16, 17, 35) }, // MO22 shirt (accused)
  { evidenceId: 'EV-018', caseId: 'CASE-002', evidenceType: 'Digital Device',collectionTimestamp: ts(2014, 4, 16, 17, 40) }, // MO23 mobile phone (accused)
  { evidenceId: 'EV-019', caseId: 'CASE-002', evidenceType: 'Other',        collectionTimestamp: ts(2014, 4, 16, 17, 45) }, // MO24 helmet (accused)
  { evidenceId: 'EV-020', caseId: 'CASE-002', evidenceType: 'Other',        collectionTimestamp: ts(2014, 4, 16, 17, 50) }, // MO25 key (accused)
  { evidenceId: 'EV-021', caseId: 'CASE-002', evidenceType: 'Document',     collectionTimestamp: ts(2014, 4, 16, 17, 55) }, // Ext. P51 letter from accused's pocket
];

// ---------------------------------------------------------------------------
// PHYSICAL EVIDENCE
// storage_locker_number / seal_number / container_type — [GENERATED]
// (not stated in any source file)
// ---------------------------------------------------------------------------
const PHYSICAL_EVIDENCE = [
  // CASE-001
  { evidenceId: 'EV-001', storageLockerNumber: 'LOCKER-CG-A01', sealNumber: 'SEAL-10001', containerType: 'Sealed Evidence Bag' },
  { evidenceId: 'EV-002', storageLockerNumber: 'LOCKER-CG-A02', sealNumber: 'SEAL-10002', containerType: 'Sterile Biohazard Container' },
  { evidenceId: 'EV-003', storageLockerNumber: 'LOCKER-CG-A03', sealNumber: 'SEAL-10003', containerType: 'Sealed Evidence Bag' },
  { evidenceId: 'EV-004', storageLockerNumber: 'LOCKER-CG-A04', sealNumber: 'SEAL-10004', containerType: 'Heavy Metal Vault Container' },
  // CASE-002
  { evidenceId: 'EV-007', storageLockerNumber: 'LOCKER-KL-B01', sealNumber: 'SEAL-10005', containerType: 'Heavy Metal Vault Container' },
  { evidenceId: 'EV-008', storageLockerNumber: 'LOCKER-KL-B02', sealNumber: 'SEAL-10006', containerType: 'Heavy Metal Vault Container' },
  { evidenceId: 'EV-009', storageLockerNumber: 'LOCKER-KL-B03', sealNumber: 'SEAL-10007', containerType: 'Sealed Evidence Bag' },
  { evidenceId: 'EV-010', storageLockerNumber: 'LOCKER-KL-B04', sealNumber: 'SEAL-10008', containerType: 'Sealed Evidence Bag' },
  { evidenceId: 'EV-011', storageLockerNumber: 'LOCKER-KL-B05', sealNumber: 'SEAL-10009', containerType: 'Sealed Evidence Bag' },
  { evidenceId: 'EV-013', storageLockerNumber: 'LOCKER-KL-B06', sealNumber: 'SEAL-10010', containerType: 'Sealed Evidence Bag' },
  { evidenceId: 'EV-015', storageLockerNumber: 'LOCKER-KL-B07', sealNumber: 'SEAL-10011', containerType: 'Sealed Evidence Bag' },
  { evidenceId: 'EV-016', storageLockerNumber: 'LOCKER-KL-B08', sealNumber: 'SEAL-10012', containerType: 'Sealed Evidence Bag' },
  { evidenceId: 'EV-017', storageLockerNumber: 'LOCKER-KL-B09', sealNumber: 'SEAL-10013', containerType: 'Sealed Evidence Bag' },
  { evidenceId: 'EV-019', storageLockerNumber: 'LOCKER-KL-B10', sealNumber: 'SEAL-10014', containerType: 'Sealed Evidence Bag' },
  { evidenceId: 'EV-020', storageLockerNumber: 'LOCKER-KL-B11', sealNumber: 'SEAL-10015', containerType: 'Sealed Evidence Bag' },
];

// ---------------------------------------------------------------------------
// DIGITAL EVIDENCE
// EV-014 & EV-018 are mobile phones from Case 2.
// hash / size / serial — [GENERATED] (not stated in source file)
// ---------------------------------------------------------------------------
const DIGITAL_EVIDENCE = [
  {
    evidenceId: 'EV-014',
    fileHashSha256: 'a1f2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2',  // [GENERATED]
    mediaType: 'Mobile Phone Data',
    sizeMb: 12.4,                 // [GENERATED]
    deviceSerial: 'SN-MOB-KL-001', // [GENERATED]
  },
  {
    evidenceId: 'EV-018',
    fileHashSha256: 'b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3',  // [GENERATED]
    mediaType: 'Mobile Phone Data',
    sizeMb: 8.7,                  // [GENERATED]
    deviceSerial: 'SN-MOB-KL-002', // [GENERATED]
  },
];

// ---------------------------------------------------------------------------
// CUSTODY LOG
// Released_by / received_by mapped to officer IDs from OFFICERS.
// transfer_timestamp — where stated in case file, used as-is; else [GENERATED].
// ---------------------------------------------------------------------------
const CUSTODY_LOG = [
  // CASE-001 (Chhattisgarh)
  { logId: 'LOG-001', evidenceId: 'EV-001', releasedById: 'OFF-001', receivedById: 'OFF-006', transferTimestamp: ts(2013, 10, 13, 10, 0) },  // plain soil → lab
  { logId: 'LOG-002', evidenceId: 'EV-002', releasedById: 'OFF-001', receivedById: 'OFF-006', transferTimestamp: ts(2013, 10, 13, 10, 15) }, // blood soil → lab
  { logId: 'LOG-003', evidenceId: 'EV-004', releasedById: 'OFF-001', receivedById: 'OFF-006', transferTimestamp: ts(2013, 10, 13, 10, 30) }, // axe → lab (FSL)
  { logId: 'LOG-004', evidenceId: 'EV-006', releasedById: 'OFF-001', receivedById: 'OFF-007', transferTimestamp: ts(2013, 10, 14, 9, 0)  }, // PM report → judicial review

  // CASE-002 (Kerala) — timestamps from case file where stated
  { logId: 'LOG-005', evidenceId: 'EV-015', releasedById: 'OFF-002', receivedById: 'OFF-003', transferTimestamp: ts(2014, 4, 16, 11, 45) }, // inquest clothing; PW30 → PW31; 11:45 AM (stated)
  { logId: 'LOG-006', evidenceId: 'EV-007', releasedById: 'OFF-003', receivedById: 'OFF-006', transferTimestamp: ts(2014, 4, 16, 14, 0)  }, // MO1 dagger → lab [GENERATED time]
  { logId: 'LOG-007', evidenceId: 'EV-008', releasedById: 'OFF-003', receivedById: 'OFF-006', transferTimestamp: ts(2014, 4, 16, 14, 10) }, // MO14 knife → lab [GENERATED]
  { logId: 'LOG-008', evidenceId: 'EV-014', releasedById: 'OFF-003', receivedById: 'OFF-006', transferTimestamp: ts(2014, 4, 16, 14, 30) }, // MO19 phone (deceased) → lab
  { logId: 'LOG-009', evidenceId: 'EV-016', releasedById: 'OFF-003', receivedById: 'OFF-006', transferTimestamp: ts(2014, 4, 16, 18, 0)  }, // MO21 dhothi (accused) → lab; arrest 5:30 PM stated
  { logId: 'LOG-010', evidenceId: 'EV-018', releasedById: 'OFF-003', receivedById: 'OFF-006', transferTimestamp: ts(2014, 4, 16, 18, 15) }, // MO23 phone (accused) → lab
];

// ---------------------------------------------------------------------------
// SEED ENGINE
// ---------------------------------------------------------------------------
async function wipe() {
  console.log('  Wiping reports...');        await prisma.report.deleteMany();
  console.log('  Wiping audit logs...');     await prisma.caseAuditLog.deleteMany();
  console.log('  Wiping custody logs...');   await prisma.custodyLog.deleteMany();
  console.log('  Wiping digital evid...');   await prisma.digitalEvidence.deleteMany();
  console.log('  Wiping physical evid...');  await prisma.physicalEvidence.deleteMany();
  console.log('  Wiping evidence...');       await prisma.evidence.deleteMany();
  console.log('  Wiping cases...');          await prisma.case.deleteMany();
  console.log('  Wiping officers...');       await prisma.officer.deleteMany();
}

async function main() {
  await prisma.$connect();
  console.log('\nForenSys seed — wiping existing data...');
  await wipe();

  console.log('\nForenSys seed — hashing passwords...');
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, BCRYPT_ROUNDS);

  // OFFICERS
  console.log(`\nInserting ${OFFICERS.length} OFFICERS...`);
  for (const o of OFFICERS) {
    await prisma.officer.create({ data: { ...o, passwordHash } });
    console.log(`  ✓ [${o.badgeNumber}] ${o.fullName} — ${o.role}`);
  }

  // CASES (all start 'open' so evidence can be inserted regardless of final status)
  console.log(`\nInserting ${CASES.length} CASES...`);
  for (const c of CASES) {
    await prisma.case.create({ data: { ...c, status: 'open' } });
    console.log(`  ✓ ${c.caseId} — ${c.title.substring(0, 60)}...`);
  }

  // EVIDENCE
  console.log(`\nInserting ${EVIDENCE.length} EVIDENCE records...`);
  for (const e of EVIDENCE) {
    await prisma.evidence.create({ data: e });
    console.log(`  ✓ ${e.evidenceId} [${e.evidenceType}] → ${e.caseId}`);
  }

  // PHYSICAL EVIDENCE
  console.log(`\nInserting ${PHYSICAL_EVIDENCE.length} PHYSICAL EVIDENCE subtypes...`);
  for (const p of PHYSICAL_EVIDENCE) {
    await prisma.physicalEvidence.create({ data: p });
    console.log(`  ✓ ${p.evidenceId} → ${p.storageLockerNumber}`);
  }

  // DIGITAL EVIDENCE
  console.log(`\nInserting ${DIGITAL_EVIDENCE.length} DIGITAL EVIDENCE subtypes...`);
  for (const d of DIGITAL_EVIDENCE) {
    await prisma.digitalEvidence.create({ data: d });
    console.log(`  ✓ ${d.evidenceId} → ${d.mediaType} (${d.sizeMb} MB)`);
  }

  // CUSTODY LOG
  console.log(`\nInserting ${CUSTODY_LOG.length} CUSTODY LOG entries...`);
  for (const l of CUSTODY_LOG) {
    await prisma.custodyLog.create({ data: l });
    console.log(`  ✓ ${l.logId} — ${l.evidenceId}: ${l.releasedById} → ${l.receivedById}`);
  }

  // CLOSE / ARCHIVE CASES via trigger (writes CASE_AUDIT_LOG rows)
  console.log('\nClosing / archiving cases via sp_change_case_status (triggers audit log)...');
  const closureActors: Record<string, string> = {
    'CASE-001': 'High Court of Chhattisgarh',   // decided 18-07-2023
    'CASE-002': 'High Court of Kerala',          // decided 15-06-2020
    'CASE-003': 'High Court of J&K and Ladakh', // disposed 21-10-2026
    'CASE-004': 'High Court of Gujarat',         // withdrawn 21-10-2026
    'CASE-008': 'Bombay High Court, Kolhapur',  // withdrawn 21-10-2026
  };
  for (const [caseId, finalStatus] of Object.entries(CLOSE_AFTER_SEED)) {
    const actor = closureActors[caseId] ?? 'System Administrator';
    await prisma.$executeRawUnsafe(
      `SELECT sp_change_case_status('${caseId}', '${finalStatus}', '${actor}')`,
    );
    console.log(`  ✓ ${caseId} → ${finalStatus} (by ${actor})`);
  }

  // Final row counts
  const counts: Array<[string, number]> = [
    ['OFFICERS',          await prisma.officer.count()],
    ['CASES',             await prisma.case.count()],
    ['EVIDENCE',          await prisma.evidence.count()],
    ['PHYSICAL_EVIDENCE', await prisma.physicalEvidence.count()],
    ['DIGITAL_EVIDENCE',  await prisma.digitalEvidence.count()],
    ['CUSTODY_LOG',       await prisma.custodyLog.count()],
    ['CASE_AUDIT_LOG',    await prisma.caseAuditLog.count()],
    ['REPORTS',           await prisma.report.count()],
  ];

  console.log('\n─────────────────────────────────────────────────');
  console.log('  Table                    Rows');
  console.log('─────────────────────────────────────────────────');
  for (const [name, n] of counts) {
    console.log(`  ${name.padEnd(24)} ${n}`);
  }
  console.log('─────────────────────────────────────────────────');
  console.log(`\n✅ Seed complete!`);
  console.log(`   Login with any badge number above + password: ${DEMO_PASSWORD}`);
  console.log(`   e.g.  Badge: IO-001  |  Password: ${DEMO_PASSWORD}\n`);
}

main()
  .catch((e) => {
    console.error('\n❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
