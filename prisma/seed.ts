/**
 * ForenSys seed script — Real case data from 16 case files.
 *
 * Sources: 
 *   Cases 1-8: Chhattisgarh, Kerala, J&K, Gujarat, Bombay High Court
 *   Cases 9-12: Gayatri Tiwari (Bombay), Irfankhan Pathan (Gujarat), 
 *               Kiranji Thakor (Gujarat), Savitaben Thakor (Gujarat)
 *   Cases 13-16: Sahejadkhan Pathan (Gujarat), Kiran Bhanushali (Bombay), 
 *                Ajaykumar Saroj (Bombay), Pritam Sonone (Bombay)
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
// Extracted named officers from all 16 case files + role representatives.
// ---------------------------------------------------------------------------
const OFFICERS = [
  // --- Case 1 (Chhattisgarh) ---
  { officerId: 'OFF-001', badgeNumber: 'IO-001', fullName: 'R.P. Shukla',                            role: 'Investigating Officer' },
  // --- Case 2 (Kerala) ---
  { officerId: 'OFF-002', badgeNumber: 'IO-002', fullName: 'PW30 Sub Inspector, Thidanadu PS',        role: 'Investigating Officer' },
  { officerId: 'OFF-003', badgeNumber: 'IO-003', fullName: 'PW31 Circle Inspector, Erattupetta',      role: 'Investigating Officer' },
  // --- Case 3 (J&K) ---
  { officerId: 'OFF-004', badgeNumber: 'SA-001', fullName: 'SSP Srinagar',                            role: 'System Administrator' },
  { officerId: 'OFF-005', badgeNumber: 'IO-004', fullName: 'SHO Police Station Batamaloo',            role: 'Investigating Officer' },
  // --- Case 9 (Maharashtra) ---
  { officerId: 'OFF-006', badgeNumber: 'IO-005', fullName: 'Harshal Raut, PSI Tulinj PS',            role: 'Investigating Officer' },
  // --- Lab Analyst — required for evidence analysis & custody transfers ---
  { officerId: 'OFF-007', badgeNumber: 'LA-001', fullName: 'Dr. Meera Nair',                          role: 'Lab Analyst' },
  // --- Judicial Authority — required for court hearings & disposal ---
  { officerId: 'OFF-008', badgeNumber: 'JA-001', fullName: 'Judge Priya Mehta',                       role: 'Judicial Authority' },
];

// Cases to close or archive after seed insertion (triggers CASE_AUDIT_LOG via sp_change_case_status)
const CLOSE_AFTER_SEED: Record<string, string> = {
  'CASE-001': 'closed',   // Pramod @ Bhoko — appeal decided 18-07-2023
  'CASE-002': 'closed',   // Antoney — appeal decided 15-06-2020
  'CASE-003': 'archived', // Aftab Ahmad — writ disposed 21-10-2026
  'CASE-004': 'archived', // Zala Mahendrasinh — withdrawn 21-10-2026
  'CASE-008': 'archived', // PCIT-2 v. Kesarkar — withdrawn 21-10-2026
  'CASE-009': 'archived', // Gayatri Tiwari — disposed as infructuous 21-10-2026
  'CASE-010': 'archived', // Irfankhan Pathan — not pressed / disposed 21-10-2026
  'CASE-011': 'archived', // Kiranji Thakor — withdrawn 21-10-2026
  'CASE-014': 'archived', // Kiran Bhanushali — interim app allowed/disposed 21-10-2026
  'CASE-015': 'archived', // Ajaykumar Saroj — acquitted / disposed as infructuous 21-10-2026
  'CASE-016': 'archived', // Pritam Sonone — surety modified / disposed 21-10-2026
};

// ---------------------------------------------------------------------------
// CASES (All 16 Cases)
// ---------------------------------------------------------------------------
const CASES = [
  // Case 1
  {
    caseId: 'CASE-001',
    title: 'Pramod @ Bhoko v. State of Chhattisgarh — Criminal Appeal No. 403 of 2015',
    incidentTimestamp: ts(2013, 10, 12, 20, 0),
    locationPoint: '21.1938,81.2962', // Durg district, CG
    status: 'open',
    leadOfficerId: 'OFF-001',
  },
  // Case 2
  {
    caseId: 'CASE-002',
    title: 'Antoney @ Kuttiyachan v. State of Kerala — Crl.A. No. 47 of 2016',
    incidentTimestamp: ts(2014, 4, 16, 9, 30),
    locationPoint: '9.5916,76.5222', // Kottayam, Kerala
    status: 'open',
    leadOfficerId: 'OFF-003',
  },
  // Case 3
  {
    caseId: 'CASE-003',
    title: 'Aftab Ahmad Chowdhary v. UT of J&K (Home) — WP(C) 2615/2026',
    incidentTimestamp: ts(2026, 10, 21, 10, 0),
    locationPoint: '34.0837,74.7973', // Srinagar, J&K
    status: 'open',
    leadOfficerId: 'OFF-004',
  },
  // Case 4
  {
    caseId: 'CASE-004',
    title: 'Zala Mahendrasinh Navalsinh Laxmansinh v. State of Gujarat — Bail App. 24950/2026',
    incidentTimestamp: ts(2026, 10, 21, 11, 0),
    locationPoint: '22.2587,71.1924', // Gujarat
    status: 'open',
    leadOfficerId: 'OFF-001',
  },
  // Case 5
  {
    caseId: 'CASE-005',
    title: 'Ketan Lalbhai Rathod v. State of Gujarat — Anticipatory Bail App. 24930/2026',
    incidentTimestamp: ts(2026, 8, 1, 0, 0),
    locationPoint: '21.5222,70.4579', // Junagadh, Gujarat
    status: 'in_court',
    leadOfficerId: 'OFF-002',
  },
  // Case 6
  {
    caseId: 'CASE-006',
    title: 'Narendrabhai Chelabhai Patel v. State of Gujarat — Anticipatory Bail App. 24158/2026',
    incidentTimestamp: ts(2026, 1, 1, 0, 0),
    locationPoint: '23.8493,72.1266', // Patan, Gujarat
    status: 'in_court',
    leadOfficerId: 'OFF-003',
  },
  // Case 7
  {
    caseId: 'CASE-007',
    title: 'Bhimabhai s/o Kama Makvana v. State of Gujarat — Bail App. 23039/2026',
    incidentTimestamp: ts(2026, 1, 1, 0, 0),
    locationPoint: '22.4707,70.0577', // Jamnagar, Gujarat
    status: 'in_court',
    leadOfficerId: 'OFF-001',
  },
  // Case 8
  {
    caseId: 'CASE-008',
    title: 'Principal Commissioner of Income Tax-2 v. Krishna Gajanan Kesarkar — IT Appeal 127/2016',
    incidentTimestamp: ts(2016, 1, 1, 0, 0),
    locationPoint: '16.7050,74.2433', // Kolhapur, Maharashtra
    status: 'open',
    leadOfficerId: 'OFF-008',
  },
  // Case 9
  {
    caseId: 'CASE-009',
    title: 'Gayatri Achhelal Tiwari v. State of Maharashtra — Anticipatory Bail App. 707/2023',
    incidentTimestamp: ts(2023, 5, 11, 10, 0),
    locationPoint: '19.4184,72.8258', // Tulinj, Palghar/Thane
    status: 'open',
    leadOfficerId: 'OFF-006',
  },
  // Case 10
  {
    caseId: 'CASE-010',
    title: 'Irfankhan Kalekhan Pathan v. State of Gujarat — Bail App. 20892/2026',
    incidentTimestamp: ts(2026, 10, 21, 11, 30),
    locationPoint: '23.0225,72.5714', // Ahmedabad / Gujarat
    status: 'open',
    leadOfficerId: 'OFF-001',
  },
  // Case 11
  {
    caseId: 'CASE-011',
    title: 'Kiranji Babuji Thakor & Another v. State of Gujarat — Anticipatory Bail App. 23629/2026',
    incidentTimestamp: ts(2026, 10, 21, 12, 0),
    locationPoint: '23.2156,72.6369', // Gandhinagar / Gujarat
    status: 'open',
    leadOfficerId: 'OFF-001',
  },
  // Case 12
  {
    caseId: 'CASE-012',
    title: 'Savitaben W/o Cheharbhai Thakor v. State of Gujarat — Bail App. 22476/2026',
    incidentTimestamp: ts(2026, 5, 12, 10, 0),
    locationPoint: '22.9124,72.4287', // Changodar PS, Ahmedabad Rural
    status: 'in_court',
    leadOfficerId: 'OFF-002',
  },
  // Case 13
  {
    caseId: 'CASE-013',
    title: 'Sahejadkhan Nazirullakhan Sherali Pathan v. State of Gujarat — Bail App. 22826/2026',
    incidentTimestamp: ts(2026, 8, 9, 14, 0),
    locationPoint: '23.3644,73.1722', // Dhanshura PS, Arvalli, Gujarat
    status: 'in_court',
    leadOfficerId: 'OFF-003',
  },
  // Case 14
  {
    caseId: 'CASE-014',
    title: 'Kiran Lakhamsi Bhanushali v. State of Maharashtra — Interim App. 565/2026',
    incidentTimestamp: ts(2025, 3, 10, 10, 0),
    locationPoint: '18.9220,72.8347', // Bombay High Court
    status: 'open',
    leadOfficerId: 'OFF-006',
  },
  // Case 15
  {
    caseId: 'CASE-015',
    title: 'Ajaykumar @ Mithunkumar Baramdin Saroj v. State of Maharashtra — Bail App. 1272/2026',
    incidentTimestamp: ts(2023, 1, 1, 0, 0),
    locationPoint: '18.9667,72.8333', // Greater Mumbai Sessions Court
    status: 'open',
    leadOfficerId: 'OFF-006',
  },
  // Case 16
  {
    caseId: 'CASE-016',
    title: 'Pritam Pratap Sonone v. State of Maharashtra — Interim App. 2513/2026',
    incidentTimestamp: ts(2023, 6, 15, 10, 0),
    locationPoint: '18.6672,73.8055', // Chikhali PS, Pune, Maharashtra
    status: 'open',
    leadOfficerId: 'OFF-006',
  },
];

// ---------------------------------------------------------------------------
// EVIDENCE (Cases 1 & 2 forensic material + Case 13 forged number plate)
// ---------------------------------------------------------------------------
const EVIDENCE = [
  // === CASE-001: Pramod @ Bhoko v. State of Chhattisgarh ===
  { evidenceId: 'EV-001', caseId: 'CASE-001', evidenceType: 'Other',        collectionTimestamp: ts(2013, 10, 13, 8, 0)  },
  { evidenceId: 'EV-002', caseId: 'CASE-001', evidenceType: 'Biological',   collectionTimestamp: ts(2013, 10, 13, 8, 30) },
  { evidenceId: 'EV-003', caseId: 'CASE-001', evidenceType: 'Clothing',     collectionTimestamp: ts(2013, 10, 13, 9, 0)  },
  { evidenceId: 'EV-004', caseId: 'CASE-001', evidenceType: 'Weapon',       collectionTimestamp: ts(2013, 10, 13, 9, 30) },
  { evidenceId: 'EV-005', caseId: 'CASE-001', evidenceType: 'Document',     collectionTimestamp: ts(2013, 10, 20, 10, 0) },
  { evidenceId: 'EV-006', caseId: 'CASE-001', evidenceType: 'Document',     collectionTimestamp: ts(2013, 10, 13, 12, 0) },

  // === CASE-002: Antoney @ Kuttiyachan v. State of Kerala ===
  { evidenceId: 'EV-007', caseId: 'CASE-002', evidenceType: 'Weapon',       collectionTimestamp: ts(2014, 4, 16, 11, 0)  },
  { evidenceId: 'EV-008', caseId: 'CASE-002', evidenceType: 'Weapon',       collectionTimestamp: ts(2014, 4, 16, 11, 10) },
  { evidenceId: 'EV-009', caseId: 'CASE-002', evidenceType: 'Other',        collectionTimestamp: ts(2014, 4, 16, 11, 15) },
  { evidenceId: 'EV-010', caseId: 'CASE-002', evidenceType: 'Other',        collectionTimestamp: ts(2014, 4, 16, 11, 20) },
  { evidenceId: 'EV-011', caseId: 'CASE-002', evidenceType: 'Clothing',     collectionTimestamp: ts(2014, 4, 16, 11, 25) },
  { evidenceId: 'EV-012', caseId: 'CASE-002', evidenceType: 'Document',     collectionTimestamp: ts(2014, 4, 16, 11, 30) },
  { evidenceId: 'EV-013', caseId: 'CASE-002', evidenceType: 'Clothing',     collectionTimestamp: ts(2014, 4, 16, 11, 35) },
  { evidenceId: 'EV-014', caseId: 'CASE-002', evidenceType: 'Digital Device',collectionTimestamp: ts(2014, 4, 16, 11, 40) },
  { evidenceId: 'EV-015', caseId: 'CASE-002', evidenceType: 'Clothing',     collectionTimestamp: ts(2014, 4, 16, 11, 45) },
  { evidenceId: 'EV-016', caseId: 'CASE-002', evidenceType: 'Clothing',     collectionTimestamp: ts(2014, 4, 16, 17, 30) },
  { evidenceId: 'EV-017', caseId: 'CASE-002', evidenceType: 'Clothing',     collectionTimestamp: ts(2014, 4, 16, 17, 35) },
  { evidenceId: 'EV-018', caseId: 'CASE-002', evidenceType: 'Digital Device',collectionTimestamp: ts(2014, 4, 16, 17, 40) },
  { evidenceId: 'EV-019', caseId: 'CASE-002', evidenceType: 'Other',        collectionTimestamp: ts(2014, 4, 16, 17, 45) },
  { evidenceId: 'EV-020', caseId: 'CASE-002', evidenceType: 'Other',        collectionTimestamp: ts(2014, 4, 16, 17, 50) },
  { evidenceId: 'EV-021', caseId: 'CASE-002', evidenceType: 'Document',     collectionTimestamp: ts(2014, 4, 16, 17, 55) },

  // === CASE-013: Sahejadkhan Pathan v. Gujarat ===
  { evidenceId: 'EV-022', caseId: 'CASE-013', evidenceType: 'Other',        collectionTimestamp: ts(2026, 8, 9, 15, 0)   }, // Forged number plate
];

// ---------------------------------------------------------------------------
// PHYSICAL EVIDENCE
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
  // CASE-013
  { evidenceId: 'EV-022', storageLockerNumber: 'LOCKER-GJ-C01', sealNumber: 'SEAL-10016', containerType: 'Rigid Plastic Storage Case' },
];

// ---------------------------------------------------------------------------
// DIGITAL EVIDENCE
// ---------------------------------------------------------------------------
const DIGITAL_EVIDENCE = [
  {
    evidenceId: 'EV-014',
    fileHashSha256: 'a1f2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2',
    mediaType: 'Mobile Phone Data',
    sizeMb: 12.4,
    deviceSerial: 'SN-MOB-KL-001',
  },
  {
    evidenceId: 'EV-018',
    fileHashSha256: 'b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3',
    mediaType: 'Mobile Phone Data',
    sizeMb: 8.7,
    deviceSerial: 'SN-MOB-KL-002',
  },
];

// ---------------------------------------------------------------------------
// CUSTODY LOG
// ---------------------------------------------------------------------------
const CUSTODY_LOG = [
  // CASE-001 (Chhattisgarh)
  { logId: 'LOG-001', evidenceId: 'EV-001', releasedById: 'OFF-001', receivedById: 'OFF-007', transferTimestamp: ts(2013, 10, 13, 10, 0) },
  { logId: 'LOG-002', evidenceId: 'EV-002', releasedById: 'OFF-001', receivedById: 'OFF-007', transferTimestamp: ts(2013, 10, 13, 10, 15) },
  { logId: 'LOG-003', evidenceId: 'EV-004', releasedById: 'OFF-001', receivedById: 'OFF-007', transferTimestamp: ts(2013, 10, 13, 10, 30) },
  { logId: 'LOG-004', evidenceId: 'EV-006', releasedById: 'OFF-001', receivedById: 'OFF-008', transferTimestamp: ts(2013, 10, 14, 9, 0)  },

  // CASE-002 (Kerala)
  { logId: 'LOG-005', evidenceId: 'EV-015', releasedById: 'OFF-002', receivedById: 'OFF-003', transferTimestamp: ts(2014, 4, 16, 11, 45) },
  { logId: 'LOG-006', evidenceId: 'EV-007', releasedById: 'OFF-003', receivedById: 'OFF-007', transferTimestamp: ts(2014, 4, 16, 14, 0)  },
  { logId: 'LOG-007', evidenceId: 'EV-008', releasedById: 'OFF-003', receivedById: 'OFF-007', transferTimestamp: ts(2014, 4, 16, 14, 10) },
  { logId: 'LOG-008', evidenceId: 'EV-014', releasedById: 'OFF-003', receivedById: 'OFF-007', transferTimestamp: ts(2014, 4, 16, 14, 30) },
  { logId: 'LOG-009', evidenceId: 'EV-016', releasedById: 'OFF-003', receivedById: 'OFF-007', transferTimestamp: ts(2014, 4, 16, 18, 0)  },
  { logId: 'LOG-010', evidenceId: 'EV-018', releasedById: 'OFF-003', receivedById: 'OFF-007', transferTimestamp: ts(2014, 4, 16, 18, 15) },

  // CASE-013 (Gujarat)
  { logId: 'LOG-011', evidenceId: 'EV-022', releasedById: 'OFF-003', receivedById: 'OFF-007', transferTimestamp: ts(2026, 8, 9, 16, 0)   },
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

  // CASES
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

  // CLOSE / ARCHIVE CASES via trigger (creates CASE_AUDIT_LOG rows)
  console.log('\nClosing / archiving cases via sp_change_case_status (triggers audit log)...');
  const closureDetails: Record<string, { status: string; actor: string; timestamp: Date }> = {
    'CASE-001': { status: 'closed',   actor: 'High Court of Chhattisgarh',      timestamp: ts(2023, 7, 18, 14, 30) },
    'CASE-002': { status: 'closed',   actor: 'High Court of Kerala',             timestamp: ts(2020, 6, 15, 11, 0)  },
    'CASE-003': { status: 'archived', actor: 'High Court of J&K and Ladakh',    timestamp: ts(2026, 10, 21, 10, 30) },
    'CASE-004': { status: 'archived', actor: 'High Court of Gujarat',            timestamp: ts(2026, 10, 21, 11, 15) },
    'CASE-008': { status: 'archived', actor: 'Bombay High Court, Kolhapur',     timestamp: ts(2026, 10, 21, 12, 0)  },
    'CASE-009': { status: 'archived', actor: 'High Court of Judicature at Bombay', timestamp: ts(2026, 10, 21, 12, 15) },
    'CASE-010': { status: 'archived', actor: 'High Court of Gujarat',            timestamp: ts(2026, 10, 21, 12, 30) },
    'CASE-011': { status: 'archived', actor: 'High Court of Gujarat',            timestamp: ts(2026, 10, 21, 12, 45) },
    'CASE-014': { status: 'archived', actor: 'High Court of Judicature at Bombay', timestamp: ts(2026, 10, 21, 13, 15) },
    'CASE-015': { status: 'archived', actor: 'Sessions Court, Greater Mumbai',   timestamp: ts(2026, 8, 14, 15, 0)   },
    'CASE-016': { status: 'archived', actor: 'High Court of Judicature at Bombay', timestamp: ts(2026, 10, 21, 13, 30) },
  };

  for (const [caseId, detail] of Object.entries(closureDetails)) {
    const isoTimestamp = detail.timestamp.toISOString();
    await prisma.$executeRawUnsafe(
      `SELECT sp_change_case_status('${caseId}', '${detail.status}', '${detail.actor}', '${isoTimestamp}')`,
    );
    console.log(`  ✓ ${caseId} → ${detail.status} (by ${detail.actor} at ${detail.timestamp.toISOString()})`);
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
  console.log(`\n✅ 16-Case Seed complete!`);
  console.log(`   Login password for all accounts: ${DEMO_PASSWORD}\n`);
}

main()
  .catch((e) => {
    console.error('\n❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
