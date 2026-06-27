import mongoose, { Document, Schema } from 'mongoose';

export interface IPhoneOtp extends Document {
  userId: mongoose.Types.ObjectId;
  codeHash: string;
  attempts: number;
  lastSentAt: Date;
  expiresAt: Date;
}

const PhoneOtpSchema = new Schema<IPhoneOtp>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
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

PhoneOtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model<IPhoneOtp>('PhoneOtp', PhoneOtpSchema);