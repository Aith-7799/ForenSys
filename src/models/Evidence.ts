import mongoose, { Schema, Document } from 'mongoose';

export interface IPhysicalEvidence {
  storageLockerNumber: string;
  sealNumber: string;
  containerType: string;
}

export interface IDigitalEvidence {
  fileHashSha256: string;
  mediaType: string;
  sizeMb: number;
  deviceSerial: string;
}

export interface IEvidence extends Document {
  evidenceId: string;
  caseId: string;
  evidenceType: string;
  collectionTimestamp: Date;
  physical?: IPhysicalEvidence | null;
  digital?: IDigitalEvidence | null;
}

const EvidenceSchema = new Schema<IEvidence>(
  {
    evidenceId: { type: String, required: true, unique: true, index: true },
    caseId: { type: String, required: true, index: true },
    evidenceType: {
      type: String,
      required: true,
      enum: ['Weapon', 'Biological', 'Digital Device', 'Document', 'Clothing', 'Fingerprint', 'Other'],
      index: true,
    },
    collectionTimestamp: { type: Date, required: true },
    physical: {
      storageLockerNumber: { type: String },
      sealNumber: { type: String },
      containerType: { type: String },
    },
    digital: {
      fileHashSha256: { type: String, index: true },
      mediaType: { type: String },
      sizeMb: { type: Number },
      deviceSerial: { type: String },
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual relationship to Case
EvidenceSchema.virtual('case', {
  ref: 'Case',
  localField: 'caseId',
  foreignField: 'caseId',
  justOne: true,
});

export const Evidence = mongoose.models.Evidence || mongoose.model<IEvidence>('Evidence', EvidenceSchema);
