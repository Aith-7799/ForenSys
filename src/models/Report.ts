import mongoose, { Schema, Document } from 'mongoose';

export interface IReport extends Document {
  reportId: string;
  caseId?: string | null;
  evidenceId?: string | null;
  uploadedById: string;
  reportType: string;
  fileName: string;
  filePath: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: Date;
}

const ReportSchema = new Schema<IReport>(
  {
    reportId: { type: String, required: true, unique: true, index: true },
    caseId: { type: String, default: null, index: true },
    evidenceId: { type: String, default: null, index: true },
    uploadedById: { type: String, required: true, index: true },
    reportType: {
      type: String,
      required: true,
      index: true,
    },
    fileName: { type: String, required: true },
    filePath: { type: String, required: true },
    mimeType: { type: String, required: true },
    sizeBytes: { type: Number, required: true },
    uploadedAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

ReportSchema.virtual('uploadedBy', {
  ref: 'Officer',
  localField: 'uploadedById',
  foreignField: 'officerId',
  justOne: true,
});

export const Report = mongoose.models.Report || mongoose.model<IReport>('Report', ReportSchema);
