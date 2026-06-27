import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import PhoneOtp from '../models/PhoneOtp';
import {
  OTP_EXPIRY_MS,
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_COOLDOWN_MS,
} from '../constants/auth';
import { sendPhoneOtpSms } from './smsService';

const generateCode = (): string =>
  String(Math.floor(100000 + Math.random() * 900000));

export type SendPhoneOtpResult = {
  resent: boolean;
  resendAvailableIn: number;
  mocked: boolean;
  devOtp?: string;
};

export const issuePhoneOtp = async (
  userId: string,
  phone: string,
): Promise<SendPhoneOtpResult> => {
  const objectId = new mongoose.Types.ObjectId(userId);
  const now = new Date();

  const existing = await PhoneOtp.findOne({ userId: objectId }).select('+codeHash');

  if (existing) {
    const elapsed = now.getTime() - existing.lastSentAt.getTime();
    if (elapsed < OTP_RESEND_COOLDOWN_MS) {
      const waitMs = OTP_RESEND_COOLDOWN_MS - elapsed;
      return {
        resent: false,
        resendAvailableIn: Math.ceil(waitMs / 1000),
        mocked: true,
      };
    }
  }

  const code = generateCode();
  const codeHash = await bcrypt.hash(code, 10);
  const expiresAt = new Date(now.getTime() + OTP_EXPIRY_MS);

  await PhoneOtp.findOneAndUpdate(
    { userId: objectId },
    {
      codeHash,
      attempts: 0,
      lastSentAt: now,
      expiresAt,
    },
    { upsert: true, new: true },
  );

  const { mocked } = await sendPhoneOtpSms(phone, code);

  const result: SendPhoneOtpResult = {
    resent: true,
    resendAvailableIn: OTP_RESEND_COOLDOWN_MS / 1000,
    mocked,
  };

  if (process.env.NODE_ENV === 'development' && mocked) {
    result.devOtp = code;
  }

  return result;
};

export type VerifyPhoneOtpResult =
  | { ok: true }
  | { ok: false; reason: 'NOT_FOUND' | 'EXPIRED' | 'MAX_ATTEMPTS' | 'INVALID' };

export const verifyPhoneOtp = async (
  userId: string,
  code: string,
): Promise<VerifyPhoneOtpResult> => {
  const objectId = new mongoose.Types.ObjectId(userId);

  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) {
    return { ok: false, reason: 'INVALID' };
  }

  const record = await PhoneOtp.findOne({ userId: objectId }).select('+codeHash');

  if (!record) {
    return { ok: false, reason: 'NOT_FOUND' };
  }

  if (record.expiresAt < new Date()) {
    await PhoneOtp.deleteOne({ _id: record._id });
    return { ok: false, reason: 'EXPIRED' };
  }

  if (record.attempts >= OTP_MAX_ATTEMPTS) {
    return { ok: false, reason: 'MAX_ATTEMPTS' };
  }

  const isMatch = await bcrypt.compare(code, record.codeHash);

  if (!isMatch) {
    record.attempts += 1;
    await record.save();
    return { ok: false, reason: 'INVALID' };
  }

  await PhoneOtp.deleteOne({ _id: record._id });
  return { ok: true };
};

export const phoneOtpErrorMessage = (
  reason: 'NOT_FOUND' | 'EXPIRED' | 'MAX_ATTEMPTS' | 'INVALID',
): string => {
  const messages: Record<string, string> = {
    NOT_FOUND: 'No verification code found — request a new one',
    EXPIRED: 'Verification code expired — request a new one',
    MAX_ATTEMPTS: 'Too many failed attempts — request a new code',
    INVALID: 'Invalid verification code',
  };
  return messages[reason] || 'Verification failed';
};