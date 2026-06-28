import bcrypt from 'bcrypt';
import Otp from '../models/Otp';
import {
  OTP_EXPIRY_MS,
  OTP_LENGTH,
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_COOLDOWN_MS,
  OtpPurpose,
} from '../constants/auth';
import { sendOtpEmail } from './emailService';

const generateCode = (): string =>
  String(Math.floor(100000 + Math.random() * 900000));

export type SendOtpResult = {
  resent: boolean;
  resendAvailableIn: number;
  mocked: boolean;
  devOtp?: string;
};

export const issueEmailOtp = async (
  email: string,
  purpose: OtpPurpose,
): Promise<SendOtpResult> => {
  const normalised = email.toLowerCase().trim();
  const now = new Date();

  const existing = await Otp.findOne({ email: normalised, purpose }).select(
    '+codeHash',
  );

  if (existing) {
    const elapsed = now.getTime() - existing.lastSentAt.getTime();
    if (elapsed < OTP_RESEND_COOLDOWN_MS) {
      const waitMs = OTP_RESEND_COOLDOWN_MS - elapsed;
      return {
        resent: false,
        resendAvailableIn: Math.ceil(waitMs / 1000),
        mocked: !process.env.RESEND_API_KEY,
      };
    }
  }

  const code = generateCode();
  const codeHash = await bcrypt.hash(code, 10);
  const expiresAt = new Date(now.getTime() + OTP_EXPIRY_MS);

  await Otp.findOneAndUpdate(
    { email: normalised, purpose },
    {
      codeHash,
      attempts: 0,
      lastSentAt: now,
      expiresAt,
    },
    { upsert: true, new: true },
  );

  const { mocked } = await sendOtpEmail(normalised, code, purpose);

  const result: SendOtpResult = {
    resent: true,
    resendAvailableIn: OTP_RESEND_COOLDOWN_MS / 1000,
    mocked,
  };

  if (process.env.NODE_ENV !== 'production') {
    result.devOtp = code;
    console.log(`[DEV OTP] purpose=${purpose} email=${normalised} code=${code}`);
  }

  return result;
};

export type VerifyOtpResult =
  | { ok: true }
  | { ok: false; reason: 'NOT_FOUND' | 'EXPIRED' | 'MAX_ATTEMPTS' | 'INVALID' };

export const verifyEmailOtp = async (
  email: string,
  code: string,
  purpose: OtpPurpose,
): Promise<VerifyOtpResult> => {
  const normalised = email.toLowerCase().trim();

  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) {
    return { ok: false, reason: 'INVALID' };
  }

  const record = await Otp.findOne({ email: normalised, purpose }).select('+codeHash');

  if (!record) {
    return { ok: false, reason: 'NOT_FOUND' };
  }

  if (record.expiresAt < new Date()) {
    await Otp.deleteOne({ _id: record._id });
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

  await Otp.deleteOne({ _id: record._id });
  return { ok: true };
};

export const otpErrorMessage = (
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