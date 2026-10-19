import mongoose, { Schema, Document } from 'mongoose';

export interface ICase extends Document {
  caseId: string;
  title: string;
  incidentTimestamp: Date;
  locationPoint: string;
  status: string;
  leadOfficerId: string;
}

const CaseSchema = new Schema<ICase>(
  {
    caseId: { type: String, required: true, unique: true, index: true },
    title: { type: String, required: true },
    incidentTimestamp: { type: Date, required: true },
    locationPoint: { type: String, required: true },
    status: {
      type: String,
      required: true,
      default: 'open',
      enum: ['open', 'under_investigation', 'in_court', 'closed', 'archived'],
      index: true,
    },
    leadOfficerId: { type: String, required: true, index: true },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual relationship to Officer
CaseSchema.virtual('leadOfficer', {
  ref: 'Officer',
  localField: 'leadOfficerId',
  foreignField: 'officerId',
  justOne: true,
});

export const Case = mongoose.models.Case || mongoose.model<ICase>('Case', CaseSchema);
