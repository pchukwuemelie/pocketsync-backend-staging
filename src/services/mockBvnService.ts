import bcrypt from 'bcrypt';
import User from '../models/User';
import DiscoveredAccount from '../models/DiscoveredAccount';
import {
  BVN_LENGTH,
  MOCK_BVN_DISCOVERED_ACCOUNTS,
} from '../constants/onboarding';

const BVN_PATTERN = /^\d{11}$/;
const PHONE_PATTERN = /^(?:\+?234|0)[789]\d{9}$/;

export const normalisePhone = (phone: string): string => {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('234')) {
    return `+${digits}`;
  }
  if (digits.startsWith('0')) {
    return `+234${digits.slice(1)}`;
  }
  return `+234${digits}`;
};

export const validateBvn = (bvn: string): string | null => {
  if (!BVN_PATTERN.test(bvn)) {
    return 'BVN must be exactly 11 digits';
  }
  if (/^(\d)\1{10}$/.test(bvn)) {
    return 'Invalid BVN';
  }
  return null;
};

export const validatePhone = (phone: string): string | null => {
  const trimmed = phone.trim();
  if (!PHONE_PATTERN.test(trimmed)) {
    return 'Enter a valid Nigerian phone number';
  }
  return null;
};

export const hashBvn = async (bvn: string): Promise<string> =>
  bcrypt.hash(bvn, 12);

export const isBvnTaken = async (
  bvnHash: string,
  excludeUserId: string,
): Promise<boolean> => {
  const existing = await User.findOne({
    bvnHash,
    _id: { $ne: excludeUserId },
  }).select('_id');
  return Boolean(existing);
};

export const seedDiscoveredAccounts = async (
  userId: string,
  holderName: string,
): Promise<number> => {
  await DiscoveredAccount.deleteMany({ userId, isLinked: false });

  const docs = MOCK_BVN_DISCOVERED_ACCOUNTS.map((account) => ({
    userId,
    institution: account.institution,
    maskedAccountNumber: account.maskedAccountNumber,
    accountType: account.accountType,
    balance: account.balance,
    holderName,
    isLinked: false,
  }));

  await DiscoveredAccount.insertMany(docs);
  return docs.length;
};