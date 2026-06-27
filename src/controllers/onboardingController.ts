import { Request, Response } from 'express';
import User from '../models/User';
import LinkedAccount from '../models/LinkedAccount';
import DiscoveredAccount from '../models/DiscoveredAccount';
import { OnboardingStep } from '../constants/onboarding';
import {
  hashBvn,
  isBvnTaken,
  normalisePhone,
  seedDiscoveredAccounts,
  validateBvn,
  validatePhone,
} from '../services/mockBvnService';
import {
  issuePhoneOtp,
  phoneOtpErrorMessage,
  verifyPhoneOtp,
} from '../services/phoneOtpService';
import { maskPhone } from '../services/smsService';

const resolveOnboardingStep = async (
  userId: string,
  user: {
    bvnVerified: boolean;
    phoneNumber?: string;
    phoneVerified: boolean;
  },
): Promise<OnboardingStep> => {
  if (!user.phoneNumber || !user.phoneVerified) {
    return user.phoneNumber ? 'phone_otp' : 'bvn_entry';
  }

  if (!user.bvnVerified) {
    return 'phone_otp';
  }

  const [linkedCount, pendingCount] = await Promise.all([
    LinkedAccount.countDocuments({ userId, isActive: true }),
    DiscoveredAccount.countDocuments({ userId, isLinked: false }),
  ]);

  if (linkedCount === 0 && pendingCount > 0) {
    return 'connect_accounts';
  }

  return 'complete';
};

// GET /api/v1/onboarding/status
export const getOnboardingStatus = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const user = await User.findById(req.user!.userId);

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const currentStep = await resolveOnboardingStep(user._id.toString(), user);
    const pendingAccounts = await DiscoveredAccount.countDocuments({
      userId: user._id,
      isLinked: false,
    });
    const linkedAccounts = await LinkedAccount.countDocuments({
      userId: user._id,
      isActive: true,
    });

    res.status(200).json({
      emailVerified: user.emailVerified,
      bvnVerified: user.bvnVerified,
      phoneVerified: user.phoneVerified,
      currentStep,
      maskedPhone: user.phoneNumber ? maskPhone(user.phoneNumber) : undefined,
      pendingAccounts,
      linkedAccounts,
      onboardingComplete: currentStep === 'complete',
    });
  } catch (err) {
    console.error('[getOnboardingStatus]', err);
    res.status(500).json({ error: 'Failed to fetch onboarding status' });
  }
};

// POST /api/v1/onboarding/bvn/submit
export const submitBvn = async (req: Request, res: Response): Promise<void> => {
  try {
    const { bvn, phone } = req.body;

    if (typeof bvn !== 'string' || typeof phone !== 'string') {
      res.status(400).json({ error: 'BVN and phone are required' });
      return;
    }

    const bvnError = validateBvn(bvn.trim());
    if (bvnError) {
      res.status(400).json({ error: bvnError });
      return;
    }

    const phoneError = validatePhone(phone.trim());
    if (phoneError) {
      res.status(400).json({ error: phoneError });
      return;
    }

    const user = await User.findById(req.user!.userId).select('+bvnHash');

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (!user.emailVerified) {
      res.status(403).json({
        error: 'Verify your email before continuing onboarding',
        requiresVerification: true,
      });
      return;
    }

    if (user.bvnVerified) {
      res.status(400).json({ error: 'BVN onboarding is already complete' });
      return;
    }

    const bvnHash = await hashBvn(bvn.trim());
    const taken = await isBvnTaken(bvnHash, user._id.toString());

    if (taken) {
      res.status(409).json({ error: 'This BVN is already linked to another account' });
      return;
    }

    const phoneNumber = normalisePhone(phone.trim());
    user.bvnHash = bvnHash;
    user.phoneNumber = phoneNumber;
    user.phoneVerified = false;
    await user.save();

    const otpResult = await issuePhoneOtp(user._id.toString(), phoneNumber);

    res.status(200).json({
      message: 'BVN accepted — verification code sent to your phone',
      maskedPhone: maskPhone(phoneNumber),
      resendAvailableIn: otpResult.resendAvailableIn,
      ...(otpResult.devOtp ? { devOtp: otpResult.devOtp } : {}),
    });
  } catch (err) {
    console.error('[submitBvn]', err);
    res.status(500).json({ error: 'Failed to submit BVN details' });
  }
};

// POST /api/v1/onboarding/bvn/send-otp
export const sendBvnOtp = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await User.findById(req.user!.userId);

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (!user.phoneNumber) {
      res.status(400).json({ error: 'Submit your BVN and phone number first' });
      return;
    }

    if (user.bvnVerified) {
      res.status(400).json({ error: 'Phone is already verified' });
      return;
    }

    const result = await issuePhoneOtp(user._id.toString(), user.phoneNumber);

    if (!result.resent) {
      res.status(429).json({
        error: 'Please wait before requesting a new code',
        resendAvailableIn: result.resendAvailableIn,
      });
      return;
    }

    res.status(200).json({
      message: 'Verification code sent',
      maskedPhone: maskPhone(user.phoneNumber),
      resendAvailableIn: result.resendAvailableIn,
      ...(result.devOtp ? { devOtp: result.devOtp } : {}),
    });
  } catch (err) {
    console.error('[sendBvnOtp]', err);
    res.status(500).json({ error: 'Failed to send verification code' });
  }
};

// POST /api/v1/onboarding/bvn/verify-otp
export const verifyBvnOtp = async (req: Request, res: Response): Promise<void> => {
  try {
    const { code } = req.body;

    const user = await User.findById(req.user!.userId);

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (!user.phoneNumber) {
      res.status(400).json({ error: 'Submit your BVN and phone number first' });
      return;
    }

    if (user.bvnVerified) {
      res.status(400).json({ error: 'BVN onboarding is already complete' });
      return;
    }

    const verification = await verifyPhoneOtp(user._id.toString(), code);

    if (!verification.ok) {
      res.status(400).json({ error: phoneOtpErrorMessage(verification.reason) });
      return;
    }

    user.phoneVerified = true;
    user.bvnVerified = true;
    user.bvnVerifiedAt = new Date();
    await user.save();

    const discoveredCount = await seedDiscoveredAccounts(
      user._id.toString(),
      user.fullName,
    );

    res.status(200).json({
      message: 'Phone verified — accounts discovered from your BVN',
      bvnVerified: true,
      phoneVerified: true,
      discoveredAccounts: discoveredCount,
      currentStep: 'connect_accounts',
    });
  } catch (err) {
    console.error('[verifyBvnOtp]', err);
    res.status(500).json({ error: 'Verification failed' });
  }
};

// GET /api/v1/onboarding/bvn/accounts
export const getDiscoveredAccounts = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const user = await User.findById(req.user!.userId);

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (!user.bvnVerified) {
      res.status(403).json({ error: 'Complete BVN verification first' });
      return;
    }

    const accounts = await DiscoveredAccount.find({
      userId: user._id,
      isLinked: false,
    }).sort({ institution: 1 });

    res.status(200).json({
      accounts: accounts.map((account) => ({
        id: account._id,
        institution: account.institution,
        maskedAccountNumber: account.maskedAccountNumber,
        accountType: account.accountType,
        balance: account.balance / 100,
        currency: 'NGN',
        holderName: account.holderName,
      })),
    });
  } catch (err) {
    console.error('[getDiscoveredAccounts]', err);
    res.status(500).json({ error: 'Failed to fetch discovered accounts' });
  }
};

// POST /api/v1/onboarding/bvn/connect
export const connectDiscoveredAccounts = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { accountIds } = req.body;

    if (!Array.isArray(accountIds) || accountIds.length === 0) {
      res.status(400).json({ error: 'Select at least one account to connect' });
      return;
    }

    const user = await User.findById(req.user!.userId);

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (!user.bvnVerified) {
      res.status(403).json({ error: 'Complete BVN verification first' });
      return;
    }

    const discovered = await DiscoveredAccount.find({
      _id: { $in: accountIds },
      userId: user._id,
      isLinked: false,
    });

    if (discovered.length === 0) {
      res.status(400).json({ error: 'No valid accounts selected' });
      return;
    }

    const linked: Array<{
      id: string;
      institution: string;
      maskedAccountNumber: string;
      balance: number;
      accountType: string;
    }> = [];

    for (const account of discovered) {
      const existing = await LinkedAccount.findOne({
        userId: user._id,
        institution: account.institution,
        isActive: true,
      });

      if (existing) {
        account.isLinked = true;
        account.linkedAccountId = existing._id;
        await account.save();
        linked.push({
          id: existing._id.toString(),
          institution: existing.institution,
          maskedAccountNumber: existing.maskedAccountNumber,
          balance: existing.balance / 100,
          accountType: existing.accountType,
        });
        continue;
      }

      const mockAccessToken = `mock_token_${account.institution.replace(' ', '_').toLowerCase()}_${Date.now()}`;
      const linkedAccount = await LinkedAccount.create({
        userId: user._id,
        institution: account.institution,
        maskedAccountNumber: account.maskedAccountNumber,
        accessToken: mockAccessToken,
        tokenExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        balance: account.balance,
        accountType: account.accountType,
      });

      account.isLinked = true;
      account.linkedAccountId = linkedAccount._id;
      await account.save();

      linked.push({
        id: linkedAccount._id.toString(),
        institution: linkedAccount.institution,
        maskedAccountNumber: linkedAccount.maskedAccountNumber,
        balance: linkedAccount.balance / 100,
        accountType: linkedAccount.accountType,
      });
    }

    res.status(201).json({
      message: `${linked.length} account(s) connected successfully`,
      accounts: linked,
      onboardingComplete: true,
    });
  } catch (err) {
    console.error('[connectDiscoveredAccounts]', err);
    res.status(500).json({ error: 'Failed to connect accounts' });
  }
};