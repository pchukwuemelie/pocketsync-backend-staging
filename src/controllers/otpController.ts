import { Request, Response } from 'express';
import User from '../models/User';
import { OTP_PURPOSES } from '../constants/auth';
import {
  issueEmailOtp,
  otpErrorMessage,
  verifyEmailOtp,
} from '../services/otpService';

const normaliseEmail = (email: string): string => email.toLowerCase().trim();

// POST /api/v1/auth/send-otp
export const sendOtp = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, purpose } = req.body;

    if (typeof email !== 'string' || !email.trim()) {
      res.status(400).json({ error: 'Email is required' });
      return;
    }

    if (!purpose || !OTP_PURPOSES.includes(purpose)) {
      res.status(400).json({
        error: `Invalid purpose. Valid: ${OTP_PURPOSES.join(', ')}`,
      });
      return;
    }

    const normalised = normaliseEmail(email);
    const user = await User.findOne({ email: normalised });

    if (purpose === 'signup') {
      if (!user) {
        res.status(404).json({ error: 'Account not found — register first' });
        return;
      }
      if (user.emailVerified) {
        res.status(400).json({ error: 'Email is already verified' });
        return;
      }
    }

    if (purpose === 'reset' && !user) {
      res.status(200).json({
        message: 'If an account exists for this email, a verification code has been sent',
      });
      return;
    }

    const result = await issueEmailOtp(normalised, purpose);

    if (!result.resent) {
      res.status(429).json({
        error: 'Please wait before requesting a new code',
        resendAvailableIn: result.resendAvailableIn,
      });
      return;
    }

    res.status(200).json({
      message: 'Verification code sent',
      resendAvailableIn: result.resendAvailableIn,
      ...(result.devOtp ? { devOtp: result.devOtp } : {}),
    });
  } catch (err) {
    console.error('[sendOtp]', err);
    res.status(500).json({ error: 'Failed to send verification code' });
  }
};

// POST /api/v1/auth/verify-otp
export const verifyOtp = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, code, purpose } = req.body;

    if (typeof email !== 'string' || !email.trim()) {
      res.status(400).json({ error: 'Email is required' });
      return;
    }

    if (!purpose || !OTP_PURPOSES.includes(purpose)) {
      res.status(400).json({
        error: `Invalid purpose. Valid: ${OTP_PURPOSES.join(', ')}`,
      });
      return;
    }

    const normalised = normaliseEmail(email);
    const verification = await verifyEmailOtp(normalised, code, purpose);

    if (!verification.ok) {
      res.status(400).json({ error: otpErrorMessage(verification.reason) });
      return;
    }

    if (purpose === 'signup') {
      const user = await User.findOneAndUpdate(
        { email: normalised },
        { emailVerified: true, emailVerifiedAt: new Date() },
        { new: true },
      );

      if (!user) {
        res.status(404).json({ error: 'Account not found' });
        return;
      }

      res.status(200).json({
        message: 'Email verified successfully',
        emailVerified: true,
        user: {
          id: user._id,
          email: user.email,
          fullName: user.fullName,
          bvnVerified: user.bvnVerified,
        },
      });
      return;
    }

    res.status(200).json({
      message: 'Verification code accepted',
      verified: true,
    });
  } catch (err) {
    console.error('[verifyOtp]', err);
    res.status(500).json({ error: 'Verification failed' });
  }
};

// POST /api/v1/auth/forgot-password
export const forgotPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body;

    if (typeof email !== 'string' || !email.trim()) {
      res.status(400).json({ error: 'Email is required' });
      return;
    }

    const normalised = normaliseEmail(email);
    const user = await User.findOne({ email: normalised });

    let devOtp: string | undefined;

    if (user) {
      const result = await issueEmailOtp(normalised, 'reset');
      devOtp = result.devOtp;
    }

    res.status(200).json({
      message: 'If an account exists for this email, a verification code has been sent',
      ...(devOtp ? { devOtp } : {}),
    });
  } catch (err) {
    console.error('[forgotPassword]', err);
    res.status(500).json({ error: 'Failed to process request' });
  }
};

// POST /api/v1/auth/reset-password
export const resetPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, code, newPassword } = req.body;

    if (typeof email !== 'string' || !email.trim()) {
      res.status(400).json({ error: 'Email is required' });
      return;
    }

    if (typeof newPassword !== 'string' || newPassword.length < 8) {
      res.status(400).json({ error: 'New password must be at least 8 characters' });
      return;
    }

    const normalised = normaliseEmail(email);
    const verification = await verifyEmailOtp(normalised, code, 'reset');

    if (!verification.ok) {
      res.status(400).json({ error: otpErrorMessage(verification.reason) });
      return;
    }

    const user = await User.findOne({ email: normalised }).select('+passwordHash');

    if (!user) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }

    user.passwordHash = newPassword;
    user.refreshTokenHash = undefined;
    await user.save();

    res.status(200).json({ message: 'Password reset successfully' });
  } catch (err) {
    console.error('[resetPassword]', err);
    res.status(500).json({ error: 'Password reset failed' });
  }
};