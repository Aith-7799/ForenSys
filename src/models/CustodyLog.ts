import mongoose, { Schema, Document } from 'mongoose';

export interface ICustodyLog extends Document {
  logId: string;
  evidenceId: string;
  releasedById: string;
  receivedById: string;
  transferTimestamp: Date;
  mongoDocRef?: string;
}

const CustodyLogSchema = new Schema<ICustodyLog>(
  {
    logId: { type: String, required: true, unique: true, index: true },
    evidenceId: { type: String, required: true, index: true },
    releasedById: { type: String, required: true, index: true },
    receivedById: { type: String, required: true, index: true },
    transferTimestamp: { type: Date, default: Date.now, index: true },
    mongoDocRef: { type: String },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

CustodyLogSchema.virtual('releasedBy', {
  ref: 'Officer',
  localField: 'releasedById',
  foreignField: 'officerId',
  justOne: true,
});

CustodyLogSchema.virtual('receivedBy', {
  ref: 'Officer',
  localField: 'receivedById',
  foreignField: 'officerId',
  justOne: true,
});

CustodyLogSchema.virtual('evidence', {
  ref: 'Evidence',
  localField: 'evidenceId',
  foreignField: 'evidenceId',
  justOne: true,
});

export const CustodyLog = mongoose.models.CustodyLog || mongoose.model<ICustodyLog>('CustodyLog', CustodyLogSchema);
