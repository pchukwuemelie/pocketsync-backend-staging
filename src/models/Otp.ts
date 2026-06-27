import mongoose, { Document, Schema } from 'mongoose';
import { OtpPurpose } from '../constants/auth';

export interface IOtp extends Document {
  email: string;
  purpose: OtpPurpose;
  codeHash: string;
  attempts: number;
  lastSentAt: Date;
  expiresAt: Date;
}

const OtpSchema = new Schema<IOtp>(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    purpose: {
      type: String,
      required: true,
      enum: ['signup', 'reset'],
    },
    codeHash: {
      type: String,
      required: true,
      select: false,
    },
    attempts: {
      type: Number,
      default: 0,
    },
    lastSentAt: {
      type: Date,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true },
);

OtpSchema.index({ email: 1, purpose: 1 }, { unique: true });
OtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model<IOtp>('Otp', OtpSchema);