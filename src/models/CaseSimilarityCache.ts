import mongoose, { Schema, Document } from 'mongoose';

export interface ICaseSimilarityCache extends Document {
  similarityId: string;
  caseAId: string;
  caseBId: string;
  score: number;
  sharedEvidenceCount: number;
  updatedAt: Date;
}

const CaseSimilarityCacheSchema = new Schema<ICaseSimilarityCache>(
  {
    similarityId: { type: String, required: true, unique: true, index: true },
    caseAId: { type: String, required: true, index: true },
    caseBId: { type: String, required: true, index: true },
    score: { type: Number, required: true },
    sharedEvidenceCount: { type: Number, default: 0 },
    updatedAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

export const CaseSimilarityCache =
  mongoose.models.CaseSimilarityCache ||
  mongoose.model<ICaseSimilarityCache>('CaseSimilarityCache', CaseSimilarityCacheSchema);
