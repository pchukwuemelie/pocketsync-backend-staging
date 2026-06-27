import mongoose, { Document, Schema } from 'mongoose';
import { Institution } from './LinkedAccount';

export interface IDiscoveredAccount extends Document {
  userId: mongoose.Types.ObjectId;
  institution: Institution;
  maskedAccountNumber: string;
  accountType: string;
  balance: number;
  holderName: string;
  isLinked: boolean;
  linkedAccountId?: mongoose.Types.ObjectId;
}

const DiscoveredAccountSchema = new Schema<IDiscoveredAccount>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    institution: {
      type: String,
      required: true,
      enum: ['GTBank', 'Access Bank', 'Kuda', 'Opay', 'Moniepoint'],
    },
    maskedAccountNumber: {
      type: String,
      required: true,
    },
    accountType: {
      type: String,
      enum: ['current', 'savings', 'wallet', 'business'],
      required: true,
    },
    balance: {
      type: Number,
      required: true,
    },
    holderName: {
      type: String,
      required: true,
    },
    isLinked: {
      type: Boolean,
      default: false,
    },
    linkedAccountId: {
      type: Schema.Types.ObjectId,
      ref: 'LinkedAccount',
    },
  },
  { timestamps: true },
);

DiscoveredAccountSchema.index({ userId: 1, institution: 1 }, { unique: true });

export default mongoose.model<IDiscoveredAccount>(
  'DiscoveredAccount',
  DiscoveredAccountSchema,
);