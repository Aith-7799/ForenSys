import mongoose, { Schema, Document } from 'mongoose';

export interface IDuplicateEvidenceAlert extends Document {
  alertId: string;
  newEvidenceId: string;
  matchedEvidenceId: string;
  newCaseId: string;
  matchedCaseId: string;
  caseIdNew?: string;
  caseIdExisting?: string;
  fileHashSha256: string;
  status: string;
  createdAt: Date;
}

const DuplicateEvidenceAlertSchema = new Schema<IDuplicateEvidenceAlert>(
  {
    alertId: { type: String, required: true, unique: true, index: true },
    newEvidenceId: { type: String, required: true },
    matchedEvidenceId: { type: String, required: true },
    newCaseId: { type: String, required: true },
    matchedCaseId: { type: String, required: true },
    caseIdNew: { type: String },
    caseIdExisting: { type: String },
    fileHashSha256: { type: String, required: true, index: true },
    status: {
      type: String,
      default: 'unreviewed',
      enum: ['unreviewed', 'confirmed_duplicate', 'dismissed'],
    },
    createdAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

DuplicateEvidenceAlertSchema.virtual('newEvidence', {
  ref: 'Evidence',
  localField: 'newEvidenceId',
  foreignField: 'evidenceId',
  justOne: true,
});

DuplicateEvidenceAlertSchema.virtual('matchedEvidence', {
  ref: 'Evidence',
  localField: 'matchedEvidenceId',
  foreignField: 'evidenceId',
  justOne: true,
});

DuplicateEvidenceAlertSchema.virtual('newCase', {
  ref: 'Case',
  localField: 'newCaseId',
  foreignField: 'caseId',
  justOne: true,
});

DuplicateEvidenceAlertSchema.virtual('matchedCase', {
  ref: 'Case',
  localField: 'matchedCaseId',
  foreignField: 'caseId',
  justOne: true,
});

DuplicateEvidenceAlertSchema.virtual('caseNew', {
  ref: 'Case',
  localField: 'newCaseId',
  foreignField: 'caseId',
  justOne: true,
});

DuplicateEvidenceAlertSchema.virtual('caseExisting', {
  ref: 'Case',
  localField: 'matchedCaseId',
  foreignField: 'caseId',
  justOne: true,
});

export const DuplicateEvidenceAlert =
  mongoose.models.DuplicateEvidenceAlert ||
  mongoose.model<IDuplicateEvidenceAlert>('DuplicateEvidenceAlert', DuplicateEvidenceAlertSchema);
