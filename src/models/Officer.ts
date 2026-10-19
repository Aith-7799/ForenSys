import mongoose, { Schema, Document } from 'mongoose';

export interface IOfficer extends Document {
  officerId: string;
  badgeNumber: string;
  fullName: string;
  role: string;
  passwordHash: string;
}

const OfficerSchema = new Schema<IOfficer>(
  {
    officerId: { type: String, required: true, unique: true, index: true },
    badgeNumber: { type: String, required: true, unique: true, index: true },
    fullName: { type: String, required: true },
    role: {
      type: String,
      required: true,
      enum: ['Investigating Officer', 'Lab Analyst', 'System Administrator', 'Judicial Authority'],
    },
    passwordHash: { type: String, required: true },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

export const Officer = mongoose.models.Officer || mongoose.model<IOfficer>('Officer', OfficerSchema);
