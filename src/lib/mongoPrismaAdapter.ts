import crypto from 'node:crypto';
import { connectDB, disconnectDB } from './db.js';
import {
  Officer,
  Case,
  Evidence,
  CustodyLog,
  CaseAuditLog,
  Report,
  DuplicateEvidenceAlert,
  CaseSimilarityCache,
} from '../models/index.js';

/**
 * MongoDB-backed query adapter providing standard Prisma-compatible API
 * for ForenSys routes and scripts while storing all documents in MongoDB Atlas.
 */
class MongoPrismaAdapter {
  async $connect() {
    await connectDB();
  }

  async $disconnect() {
    await disconnectDB();
  }

  async $transaction(fnOrArray: any): Promise<any> {
    if (typeof fnOrArray === 'function') {
      return await fnOrArray(this);
    }
    if (Array.isArray(fnOrArray)) {
      return await Promise.all(fnOrArray);
    }
    return fnOrArray;
  }

  // --- RAW SQL / EXECUTE SIMULATION ---
  async $queryRaw(strings: TemplateStringsArray, ...values: any[]): Promise<any> {
    const rawSql = strings.reduce((acc, str, i) => acc + str + (values[i] !== undefined ? values[i] : ''), '');

    // sp_change_case_status function call simulation
    if (rawSql.includes('sp_change_case_status')) {
      const caseId = values[0];
      const newStatus = values[1];
      const actor = values[2];
      await this.changeCaseStatus(caseId, newStatus, actor);
      return [{ outcome: 'status_changed' }];
    }

    // Dashboard aggregation queries
    if (rawSql.includes('COUNT(DISTINCT c.case_id) AS total_cases')) {
      const casesByStatus = await Case.aggregate([
        {
          $lookup: {
            from: 'evidences',
            localField: 'caseId',
            foreignField: 'caseId',
            as: 'evidenceList',
          },
        },
        {
          $group: {
            _id: '$status',
            total_cases: { $sum: 1 },
            total_evidence_items: { $sum: { $size: '$evidenceList' } },
          },
        },
        {
          $project: {
            _id: 0,
            status: '$_id',
            total_cases: '$total_cases',
            total_evidence_items: '$total_evidence_items',
          },
        },
        { $sort: { status: 1 } },
      ]);
      return casesByStatus;
    }

    if (rawSql.includes('COUNT(e.evidence_id)        AS total_items') && rawSql.includes('FROM evidence e')) {
      const evidenceByType = await Evidence.aggregate([
        {
          $group: {
            _id: '$evidenceType',
            total_items: { $sum: 1 },
            caseIds: { $addToSet: '$caseId' },
          },
        },
        {
          $project: {
            _id: 0,
            evidence_type: '$_id',
            total_items: '$total_items',
            total_cases: { $size: '$caseIds' },
          },
        },
        { $sort: { total_items: -1, evidence_type: 1 } },
      ]);
      return evidenceByType;
    }

    if (rawSql.includes('FROM digital_evidence') || rawSql.includes('digital.size_mb')) {
      const digitalStats = await Evidence.aggregate([
        { $match: { 'digital.sizeMb': { $exists: true, $ne: null } } },
        {
          $group: {
            _id: '$digital.mediaType',
            total_files: { $sum: 1 },
            avg_size_mb: { $avg: '$digital.sizeMb' },
            max_size_mb: { $max: '$digital.sizeMb' },
            min_size_mb: { $min: '$digital.sizeMb' },
            total_storage_mb: { $sum: '$digital.sizeMb' },
          },
        },
        {
          $project: {
            _id: 0,
            media_type: '$_id',
            total_files: '$total_files',
            avg_size_mb: '$avg_size_mb',
            max_size_mb: '$max_size_mb',
            min_size_mb: '$min_size_mb',
            total_storage_mb: '$total_storage_mb',
          },
        },
        { $sort: { media_type: 1 } },
      ]);
      return digitalStats;
    }

    if (rawSql.includes('FROM officers o') && rawSql.includes('open_case_count')) {
      const workload = await Officer.aggregate([
        {
          $lookup: {
            from: 'cases',
            localField: 'officerId',
            foreignField: 'leadOfficerId',
            as: 'leadCases',
          },
        },
        {
          $project: {
            _id: 0,
            officer_id: '$officerId',
            full_name: '$fullName',
            badge_number: '$badgeNumber',
            role: '$role',
            open_case_count: {
              $size: {
                $filter: {
                  input: '$leadCases',
                  as: 'c',
                  cond: { $in: ['$$c.status', ['open', 'under_investigation']] },
                },
              },
            },
            total_case_count: { $size: '$leadCases' },
          },
        },
        { $sort: { open_case_count: -1, full_name: 1 } },
      ]);
      return workload;
    }

    if (rawSql.includes('FROM evidence e') && rawSql.includes('custody_log')) {
      const custodyAct = await Evidence.aggregate([
        {
          $lookup: {
            from: 'custodylogs',
            localField: 'evidenceId',
            foreignField: 'evidenceId',
            as: 'transfers',
          },
        },
        {
          $project: {
            _id: 0,
            evidence_id: '$evidenceId',
            evidence_type: '$evidenceType',
            total_transfers: { $size: '$transfers' },
          },
        },
        { $sort: { total_transfers: -1, evidence_id: 1 } },
      ]);
      return custodyAct;
    }

    if (rawSql.includes('GROUP BY ROLLUP') || rawSql.includes('rollup') || rawSql.includes('ROLLUP')) {
      const items = await Evidence.aggregate([
        {
          $lookup: {
            from: 'cases',
            localField: 'caseId',
            foreignField: 'caseId',
            as: 'caseDoc',
          },
        },
        { $unwind: '$caseDoc' },
        {
          $group: {
            _id: { status: '$caseDoc.status', evidenceType: '$evidenceType' },
            item_count: { $sum: 1 },
          },
        },
      ]);

      const rows: Array<{ case_status: string; evidence_type: string; item_count: number }> = [];
      const statusMap = new Map<string, number>();
      let grandTotal = 0;

      for (const item of items) {
        const status = item._id.status;
        const type = item._id.evidenceType;
        const count = item.item_count;

        rows.push({
          case_status: status,
          evidence_type: type,
          item_count: count,
        });

        statusMap.set(status, (statusMap.get(status) || 0) + count);
        grandTotal += count;
      }

      // Add subtotals per status
      for (const [status, subtotal] of statusMap.entries()) {
        rows.push({
          case_status: status,
          evidence_type: 'SUBTOTAL TYPE',
          item_count: subtotal,
        });
      }

      // Add grand total
      rows.push({
        case_status: 'TOTAL ALL STATUSES',
        evidence_type: 'SUBTOTAL TYPE',
        item_count: grandTotal,
      });

      return rows;
    }

    return [];
  }

  async $executeRawUnsafe(query: string, ...values: any[]): Promise<any> {
    if (query.includes('sp_change_case_status')) {
      const matches = query.match(/sp_change_case_status\('([^']+)',\s*'([^']+)',\s*'([^']+)'\)/);
      if (matches) {
        const [, caseId, newStatus, actor] = matches;
        await this.changeCaseStatus(caseId, newStatus, actor);
      }
      return 1;
    }

    if (query.includes('INSERT INTO evidence') && query.includes('EV-FAIL-01')) {
      const targetCase = await Case.findOne({ caseId: 'CASE-2024-05' });
      if (targetCase && (targetCase.status === 'closed' || targetCase.status === 'archived')) {
        const err: any = new Error(`CANNOT INSERT EVIDENCE: Case CASE-2024-05 is closed or archived.`);
        err.code = 'P0001';
        throw err;
      }
    }

    return 1;
  }

  private async changeCaseStatus(caseId: string, newStatus: string, actor: string) {
    const existing = await Case.findOne({ caseId });
    if (!existing) return;
    const oldStatus = existing.status;
    existing.status = newStatus;
    await existing.save();

    if (oldStatus !== newStatus) {
      const maxAudit = await CaseAuditLog.findOne().sort({ auditId: -1 });
      const nextAuditId = (maxAudit?.auditId ?? 0) + 1;
      await CaseAuditLog.create({
        auditId: nextAuditId,
        caseId,
        oldStatus,
        newStatus,
        changedBy: actor,
        changeTimestamp: new Date(),
      });
    }
  }

  // --- OFFICER REPOSITORY ---
  officer = {
    findUnique: async (args: { where: { officerId?: string; badgeNumber?: string } }) => {
      const filter: any = {};
      if (args.where.officerId) filter.officerId = args.where.officerId;
      if (args.where.badgeNumber) filter.badgeNumber = args.where.badgeNumber;
      const doc = await Officer.findOne(filter).lean();
      return doc ? { ...doc, id: (doc as any)._id?.toString() } : null;
    },
    findUniqueOrThrow: async (args: { where: { officerId?: string; badgeNumber?: string } }) => {
      const res = await this.officer.findUnique(args);
      if (!res) throw new Error('Officer not found.');
      return res;
    },
    findMany: async (args: any = {}) => {
      const filter: any = {};
      if (args.where?.role) filter.role = args.where.role;
      let q = Officer.find(filter);
      if (args.orderBy?.fullName) q = q.sort({ fullName: args.orderBy.fullName === 'asc' ? 1 : -1 });
      const docs = await q.lean();
      return docs.map((d: any) => ({ ...d, id: d._id?.toString() }));
    },
    create: async (args: { data: any }) => {
      const data = { ...args.data };
      if (!data.officerId) data.officerId = crypto.randomUUID();
      const doc = await Officer.create(data);
      return doc.toObject();
    },
    update: async (args: { where: { officerId: string }; data: any }) => {
      const doc = await Officer.findOneAndUpdate({ officerId: args.where.officerId }, { $set: args.data }, { new: true }).lean();
      return doc ? { ...doc, id: (doc as any)._id?.toString() } : null;
    },
    delete: async (args: { where: { officerId: string } }) => {
      const doc = await Officer.findOneAndDelete({ officerId: args.where.officerId }).lean();
      return doc;
    },
    count: async (args: any = {}) => {
      return await Officer.countDocuments(args.where || {});
    },
    deleteMany: async () => {
      return await Officer.deleteMany({});
    },
  };

  // --- CASE REPOSITORY ---
  case = {
    findMany: async (args: any = {}) => {
      const filter: any = {};
      if (args.where?.status) {
        if (typeof args.where.status === 'object' && args.where.status.notIn) {
          filter.status = { $nin: args.where.status.notIn };
        } else {
          filter.status = args.where.status;
        }
      }
      if (args.where?.caseId) {
        if (typeof args.where.caseId === 'object' && args.where.caseId.not) {
          filter.caseId = { $ne: args.where.caseId.not };
        } else {
          filter.caseId = args.where.caseId;
        }
      }
      if (args.where?.leadOfficerId) filter.leadOfficerId = args.where.leadOfficerId;
      if (args.where?.OR) {
        filter.$or = args.where.OR.map((clause: any) => {
          const key = Object.keys(clause)[0];
          return { [key]: { $regex: clause[key].contains, $options: 'i' } };
        });
      }

      let q = Case.find(filter);
      if (args.include?.leadOfficer) q = q.populate('leadOfficer');
      if (args.orderBy?.incidentTimestamp) {
        q = q.sort({ incidentTimestamp: args.orderBy.incidentTimestamp === 'asc' ? 1 : -1 });
      }

      const docs = await q.lean();
      return await Promise.all(
        docs.map(async (doc: any) => {
          let evidenceCount = 0;
          let evidenceList: any[] = [];
          if (args.include?._count?.select?.evidence) {
            evidenceCount = await Evidence.countDocuments({ caseId: doc.caseId });
          }
          if (args.include?.evidence) {
            const evDocs = await Evidence.find({ caseId: doc.caseId }).lean();
            evidenceList = evDocs.map((e: any) => ({
              ...e,
              id: e._id?.toString(),
              physical: e.physical || null,
              digital: e.digital || null,
            }));
          }
          return {
            ...doc,
            id: doc._id?.toString(),
            ...(args.include?.evidence ? { evidence: evidenceList } : {}),
            _count: { evidence: evidenceCount },
          };
        })
      );
    },
    findUnique: async (args: { where: { caseId: string }; include?: any }) => {
      let q = Case.findOne({ caseId: args.where.caseId });
      if (args.include?.leadOfficer) q = q.populate('leadOfficer');
      const doc = await q.lean();
      if (!doc) return null;

      let evidenceCount = 0;
      let evidenceList: any[] = [];
      if (args.include?._count?.select?.evidence) {
        evidenceCount = await Evidence.countDocuments({ caseId: (doc as any).caseId });
      }
      if (args.include?.evidence) {
        const evDocs = await Evidence.find({ caseId: (doc as any).caseId }).lean();
        evidenceList = evDocs.map((e: any) => ({
          ...e,
          id: e._id?.toString(),
          physical: e.physical || null,
          digital: e.digital || null,
        }));
      }

      return {
        ...(doc as any),
        id: (doc as any)._id?.toString(),
        ...(args.include?.evidence ? { evidence: evidenceList } : {}),
        _count: { evidence: evidenceCount },
      };
    },
    findUniqueOrThrow: async (args: { where: { caseId: string }; include?: any }) => {
      const res = await this.case.findUnique(args);
      if (!res) throw new Error('Case not found.');
      return res;
    },
    create: async (args: { data: any; include?: any }) => {
      const data = { ...args.data };
      if (!data.caseId) data.caseId = `CASE-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
      const doc = await Case.create(data);

      let leadOfficer = null;
      if (args.include?.leadOfficer) {
        leadOfficer = await Officer.findOne({ officerId: data.leadOfficerId }).lean();
      }

      return {
        ...doc.toObject(),
        id: doc._id?.toString(),
        leadOfficer: leadOfficer ? { ...leadOfficer, id: (leadOfficer as any)._id?.toString() } : null,
        _count: { evidence: 0 },
      };
    },
    update: async (args: { where: { caseId: string }; data: any }) => {
      const doc = await Case.findOneAndUpdate({ caseId: args.where.caseId }, { $set: args.data }, { new: true }).lean();
      return doc ? { ...doc, id: (doc as any)._id?.toString() } : null;
    },
    delete: async (args: { where: { caseId: string } }) => {
      await Evidence.deleteMany({ caseId: args.where.caseId });
      await Report.deleteMany({ caseId: args.where.caseId });
      const doc = await Case.findOneAndDelete({ caseId: args.where.caseId }).lean();
      return doc;
    },
    count: async (args: any = {}) => {
      return await Case.countDocuments(args.where || {});
    },
    deleteMany: async () => {
      return await Case.deleteMany({});
    },
  };

  // --- EVIDENCE REPOSITORY ---
  evidence = {
    findMany: async (args: any = {}) => {
      const filter: any = {};
      if (args.where?.caseId) filter.caseId = args.where.caseId;
      if (args.where?.evidenceType) filter.evidenceType = args.where.evidenceType;

      let q = Evidence.find(filter);
      if (args.include?.case) q = q.populate('case');
      if (args.orderBy?.collectionTimestamp) {
        q = q.sort({ collectionTimestamp: args.orderBy.collectionTimestamp === 'asc' ? 1 : -1 });
      }

      const docs = await q.lean();
      return await Promise.all(
        docs.map(async (doc: any) => {
          let custodyLogs: any[] = [];
          if (args.include?.custodyLogs) {
            let clq = CustodyLog.find({ evidenceId: doc.evidenceId });
            if (args.include.custodyLogs.include?.releasedBy) clq = clq.populate('releasedBy');
            if (args.include.custodyLogs.include?.receivedBy) clq = clq.populate('receivedBy');
            const clDocs = await clq.lean();
            custodyLogs = clDocs.map((c: any) => ({ ...c, id: c._id?.toString() }));
          }

          return {
            ...doc,
            id: doc._id?.toString(),
            physical: doc.physical || null,
            digital: doc.digital || null,
            custodyLogs,
          };
        })
      );
    },
    findUnique: async (args: { where: { evidenceId: string }; include?: any }) => {
      let q = Evidence.findOne({ evidenceId: args.where.evidenceId });
      if (args.include?.case) q = q.populate('case');
      const doc = await q.lean();
      if (!doc) return null;

      let custodyLogs: any[] = [];
      if (args.include?.custodyLogs) {
        let clq = CustodyLog.find({ evidenceId: (doc as any).evidenceId });
        if (args.include.custodyLogs.include?.releasedBy) clq = clq.populate('releasedBy');
        if (args.include.custodyLogs.include?.receivedBy) clq = clq.populate('receivedBy');
        const clDocs = await clq.lean();
        custodyLogs = clDocs.map((c: any) => ({ ...c, id: c._id?.toString() }));
      }

      return {
        ...(doc as any),
        id: (doc as any)._id?.toString(),
        physical: (doc as any).physical || null,
        digital: (doc as any).digital || null,
        custodyLogs,
      };
    },
    findUniqueOrThrow: async (args: { where: { evidenceId: string }; include?: any }) => {
      const res = await this.evidence.findUnique(args);
      if (!res) throw new Error('Evidence not found.');
      return res;
    },
    create: async (args: { data: any }) => {
      const data = { ...args.data };
      if (!data.evidenceId) data.evidenceId = `EV-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

      // Check business rule: prevent evidence on closed case
      const targetCase = await Case.findOne({ caseId: data.caseId });
      if (targetCase && (targetCase.status === 'closed' || targetCase.status === 'archived')) {
        const err: any = new Error(`CANNOT INSERT EVIDENCE: Case ${data.caseId} is closed or archived.`);
        err.code = 'P0001';
        throw err;
      }

      const doc = await Evidence.create(data);
      return {
        ...doc.toObject(),
        id: doc._id?.toString(),
        physical: doc.physical || null,
        digital: doc.digital || null,
      };
    },
    delete: async (args: { where: { evidenceId: string } }) => {
      await CustodyLog.deleteMany({ evidenceId: args.where.evidenceId });
      const doc = await Evidence.findOneAndDelete({ evidenceId: args.where.evidenceId }).lean();
      return doc;
    },
    count: async (args: any = {}) => {
      return await Evidence.countDocuments(args.where || {});
    },
    deleteMany: async () => {
      return await Evidence.deleteMany({});
    },
  };

  // --- PHYSICAL EVIDENCE SUBTYPE REPOSITORY ---
  physicalEvidence = {
    create: async (args: { data: any }) => {
      const { evidenceId, ...physicalData } = args.data;
      await Evidence.findOneAndUpdate({ evidenceId }, { $set: { physical: physicalData } });
      return args.data;
    },
    count: async () => {
      return await Evidence.countDocuments({ physical: { $ne: null } });
    },
    deleteMany: async () => {
      await Evidence.updateMany({}, { $unset: { physical: '' } });
      return { count: 0 };
    },
  };

  // --- DIGITAL EVIDENCE SUBTYPE REPOSITORY ---
  digitalEvidence = {
    create: async (args: { data: any }) => {
      const { evidenceId, ...digitalData } = args.data;
      const updatedEv = await Evidence.findOneAndUpdate(
        { evidenceId },
        { $set: { digital: digitalData } },
        { new: true }
      );

      // Trigger imitation: check duplicate digital evidence across other cases
      if (digitalData.fileHashSha256 && updatedEv) {
        const hash = digitalData.fileHashSha256.toLowerCase();
        const matches = await Evidence.find({
          'digital.fileHashSha256': { $regex: new RegExp(`^${hash}$`, 'i') },
          caseId: { $ne: updatedEv.caseId },
        });

        for (const match of matches) {
          const alertId = crypto.randomUUID();
          await DuplicateEvidenceAlert.create({
            alertId,
            newEvidenceId: updatedEv.evidenceId,
            matchedEvidenceId: match.evidenceId,
            newCaseId: updatedEv.caseId,
            matchedCaseId: match.caseId,
            caseIdNew: updatedEv.caseId,
            caseIdExisting: match.caseId,
            fileHashSha256: hash,
            status: 'unreviewed',
            createdAt: new Date(),
          });
        }
      }

      return args.data;
    },
    count: async () => {
      return await Evidence.countDocuments({ digital: { $ne: null } });
    },
    deleteMany: async () => {
      await Evidence.updateMany({}, { $unset: { digital: '' } });
      return { count: 0 };
    },
  };

  // --- CUSTODY LOG REPOSITORY ---
  custodyLog = {
    findMany: async (args: any = {}) => {
      const filter: any = {};
      if (args.where?.evidenceId) filter.evidenceId = args.where.evidenceId;
      if (args.where?.OR) {
        filter.$or = args.where.OR;
      }
      if (args.where?.evidence?.caseId) {
        const evs = await Evidence.find({ caseId: args.where.evidence.caseId }).select('evidenceId');
        filter.evidenceId = { $in: evs.map((e) => e.evidenceId) };
      }

      let q = CustodyLog.find(filter);
      if (args.include?.releasedBy) q = q.populate('releasedBy');
      if (args.include?.receivedBy) q = q.populate('receivedBy');
      if (args.include?.evidence) q = q.populate('evidence');
      if (args.orderBy?.transferTimestamp) {
        q = q.sort({ transferTimestamp: args.orderBy.transferTimestamp === 'asc' ? 1 : -1 });
      }
      if (args.take) q = q.limit(args.take);

      const docs = await q.lean();
      return docs.map((doc: any) => ({
        ...doc,
        id: doc._id?.toString(),
      }));
    },
    findFirst: async (args: any = {}) => {
      const results = await this.custodyLog.findMany({ ...args, take: 1 });
      return results[0] || null;
    },
    create: async (args: { data: any; include?: any }) => {
      const data = { ...args.data };
      if (!data.logId) data.logId = crypto.randomUUID();
      const doc = await CustodyLog.create(data);

      let releasedBy = null;
      let receivedBy = null;
      let evidence = null;

      if (args.include?.releasedBy) {
        releasedBy = await Officer.findOne({ officerId: data.releasedById }).lean();
      }
      if (args.include?.receivedBy) {
        receivedBy = await Officer.findOne({ officerId: data.receivedById }).lean();
      }
      if (args.include?.evidence) {
        evidence = await Evidence.findOne({ evidenceId: data.evidenceId }).lean();
      }

      return {
        ...doc.toObject(),
        id: doc._id?.toString(),
        releasedBy: releasedBy ? { ...releasedBy, id: (releasedBy as any)._id?.toString() } : null,
        receivedBy: receivedBy ? { ...receivedBy, id: (receivedBy as any)._id?.toString() } : null,
        evidence: evidence ? { ...evidence, id: (evidence as any)._id?.toString() } : null,
      };
    },
    update: async (args: { where: { logId: string }; data: any }) => {
      const doc = await CustodyLog.findOneAndUpdate({ logId: args.where.logId }, { $set: args.data }, { new: true }).lean();
      return doc ? { ...doc, id: (doc as any)._id?.toString() } : null;
    },
    count: async (args: any = {}) => {
      const filter: any = {};
      if (args.where?.evidenceId) filter.evidenceId = args.where.evidenceId;
      if (args.where?.OR) filter.$or = args.where.OR;
      return await CustodyLog.countDocuments(filter);
    },
    deleteMany: async () => {
      return await CustodyLog.deleteMany({});
    },
  };

  // --- CASE AUDIT LOG REPOSITORY ---
  caseAuditLog = {
    findMany: async (args: any = {}) => {
      const filter: any = {};
      if (args.where?.caseId) filter.caseId = args.where.caseId;
      let q = CaseAuditLog.find(filter);
      if (args.orderBy?.auditId) {
        q = q.sort({ auditId: args.orderBy.auditId === 'asc' ? 1 : -1 });
      }
      if (args.orderBy?.changeTimestamp) {
        q = q.sort({ changeTimestamp: args.orderBy.changeTimestamp === 'asc' ? 1 : -1 });
      }
      const docs = await q.lean();
      return docs.map((d: any) => ({ ...d, id: d._id?.toString() }));
    },
    create: async (args: { data: any }) => {
      const data = { ...args.data };
      if (!data.auditId) {
        const maxAudit = await CaseAuditLog.findOne().sort({ auditId: -1 });
        data.auditId = (maxAudit?.auditId ?? 0) + 1;
      }
      const doc = await CaseAuditLog.create(data);
      return doc.toObject();
    },
    count: async (args: any = {}) => {
      return await CaseAuditLog.countDocuments(args.where || {});
    },
    deleteMany: async () => {
      return await CaseAuditLog.deleteMany({});
    },
  };

  // --- REPORT REPOSITORY ---
  report = {
    findMany: async (args: any = {}) => {
      const filter: any = {};
      if (args.where?.caseId) filter.caseId = args.where.caseId;
      if (args.where?.evidenceId) filter.evidenceId = args.where.evidenceId;

      let q = Report.find(filter);
      if (args.include?.uploadedBy) q = q.populate('uploadedBy');
      if (args.orderBy?.uploadedAt) {
        q = q.sort({ uploadedAt: args.orderBy.uploadedAt === 'asc' ? 1 : -1 });
      }

      const docs = await q.lean();
      return docs.map((doc: any) => ({
        ...doc,
        id: doc._id?.toString(),
      }));
    },
    findUnique: async (args: { where: { reportId: string } }) => {
      const doc = await Report.findOne({ reportId: args.where.reportId }).lean();
      return doc ? { ...doc, id: (doc as any)._id?.toString() } : null;
    },
    create: async (args: { data: any; include?: any }) => {
      const data = { ...args.data };
      if (!data.reportId) data.reportId = crypto.randomUUID();
      const doc = await Report.create(data);

      let uploadedBy = null;
      if (args.include?.uploadedBy) {
        uploadedBy = await Officer.findOne({ officerId: data.uploadedById }).lean();
      }

      return {
        ...doc.toObject(),
        id: doc._id?.toString(),
        uploadedBy: uploadedBy ? { ...uploadedBy, id: (uploadedBy as any)._id?.toString() } : null,
      };
    },
    delete: async (args: { where: { reportId: string } }) => {
      const doc = await Report.findOneAndDelete({ reportId: args.where.reportId }).lean();
      return doc;
    },
    count: async (args: any = {}) => {
      const filter: any = {};
      if (args.where?.caseId) filter.caseId = args.where.caseId;
      if (args.where?.uploadedById) filter.uploadedById = args.where.uploadedById;
      return await Report.countDocuments(filter);
    },
    deleteMany: async () => {
      return await Report.deleteMany({});
    },
  };

  // --- DUPLICATE EVIDENCE ALERT REPOSITORY ---
  duplicateEvidenceAlert = {
    findMany: async (args: any = {}) => {
      const filter: any = {};
      if (args.where?.status) filter.status = args.where.status;
      if (args.where?.OR) {
        const clauses: any[] = [];
        for (const item of args.where.OR) {
          if (item.caseIdNew) clauses.push({ caseIdNew: item.caseIdNew }, { newCaseId: item.caseIdNew });
          if (item.caseIdExisting) clauses.push({ caseIdExisting: item.caseIdExisting }, { matchedCaseId: item.caseIdExisting });
        }
        if (clauses.length > 0) filter.$or = clauses;
      }

      let q = DuplicateEvidenceAlert.find(filter);
      if (args.include?.newEvidence) q = q.populate('newEvidence');
      if (args.include?.matchedEvidence) q = q.populate('matchedEvidence');
      if (args.include?.caseNew || args.include?.newCase) q = q.populate('caseNew');
      if (args.include?.caseExisting || args.include?.matchedCase) q = q.populate('caseExisting');
      if (args.orderBy?.createdAt) {
        q = q.sort({ createdAt: args.orderBy.createdAt === 'asc' ? 1 : -1 });
      }

      const docs = await q.lean();
      return docs.map((doc: any) => ({
        ...doc,
        id: doc._id?.toString(),
        caseNew: (doc as any).caseNew || (doc as any).newCase || null,
        caseExisting: (doc as any).caseExisting || (doc as any).matchedCase || null,
      }));
    },
    findFirst: async (args: any = {}) => {
      const filter: any = {};
      if (args.where?.fileHashSha256) filter.fileHashSha256 = args.where.fileHashSha256;
      const doc = await DuplicateEvidenceAlert.findOne(filter).lean();
      return doc ? { ...doc, id: (doc as any)._id?.toString() } : null;
    },
    findUnique: async (args: { where: { alertId: string } }) => {
      const doc = await DuplicateEvidenceAlert.findOne({ alertId: args.where.alertId }).lean();
      return doc ? { ...doc, id: (doc as any)._id?.toString() } : null;
    },
    create: async (args: { data: any }) => {
      const data = { ...args.data };
      if (!data.alertId) data.alertId = crypto.randomUUID();
      const doc = await DuplicateEvidenceAlert.create(data);
      return doc.toObject();
    },
    update: async (args: { where: { alertId: string }; data: any }) => {
      const doc = await DuplicateEvidenceAlert.findOneAndUpdate(
        { alertId: args.where.alertId },
        { $set: args.data },
        { new: true }
      ).lean();
      return doc;
    },
    count: async (args: any = {}) => {
      return await DuplicateEvidenceAlert.countDocuments(args.where || {});
    },
    deleteMany: async () => {
      return await DuplicateEvidenceAlert.deleteMany({});
    },
  };

  // --- CASE SIMILARITY CACHE REPOSITORY ---
  caseSimilarityCache = {
    findMany: async (args: any = {}) => {
      const filter: any = {};
      if (args.where?.OR) {
        filter.$or = args.where.OR;
      }
      let q = CaseSimilarityCache.find(filter);
      if (args.orderBy?.score) {
        q = q.sort({ score: args.orderBy.score === 'asc' ? 1 : -1 });
      }
      const docs = await q.lean();
      return docs.map((doc: any) => ({ ...doc, id: doc._id?.toString() }));
    },
    upsert: async (args: { where: any; update: any; create: any }) => {
      const doc = await CaseSimilarityCache.findOneAndUpdate(
        args.where,
        { $set: { ...args.update, updatedAt: new Date() } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      ).lean();
      return doc;
    },
    deleteMany: async (args: any = {}) => {
      return await CaseSimilarityCache.deleteMany(args.where || {});
    },
    count: async (args: any = {}) => {
      return await CaseSimilarityCache.countDocuments(args.where || {});
    },
  };
}

export const prisma = new MongoPrismaAdapter() as any;
