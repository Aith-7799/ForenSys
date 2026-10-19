import mongoose, { Schema, Document } from 'mongoose';

export interface ICaseAuditLog extends Document {
  auditId: number;
  caseId: string;
  oldStatus?: string;
  newStatus?: string;
  changedBy: string;
  changeTimestamp: Date;
}

const CaseAuditLogSchema = new Schema<ICaseAuditLog>(
  {
    auditId: { type: Number, required: true, unique: true, index: true },
    caseId: { type: String, required: true, index: true },
    oldStatus: { type: String },
    newStatus: { type: String },
    changedBy: { type: String, required: true },
    changeTimestamp: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
  }
);

export const CaseAuditLog =
  mongoose.models.CaseAuditLog || mongoose.model<ICaseAuditLog>('CaseAuditLog', CaseAuditLogSchema);
