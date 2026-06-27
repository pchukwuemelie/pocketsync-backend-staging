import { Institution } from '../models/LinkedAccount';

export const BVN_LENGTH = 11;

export const ONBOARDING_STEPS = [
  'bvn_entry',
  'phone_otp',
  'connect_accounts',
  'complete',
] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export type MockDiscoveredAccount = {
  institution: Institution;
  maskedAccountNumber: string;
  accountType: 'current' | 'savings' | 'wallet' | 'business';
  balance: number; // kobo
};

/** Mock accounts "discovered" from BVN — no real lookup */
export const MOCK_BVN_DISCOVERED_ACCOUNTS: MockDiscoveredAccount[] = [
  {
    institution: 'GTBank',
    maskedAccountNumber: '****4471',
    accountType: 'current',
    balance: 24500000,
  },
  {
    institution: 'Access Bank',
    maskedAccountNumber: '****2283',
    accountType: 'savings',
    balance: 87300000,
  },
  {
    institution: 'Kuda',
    maskedAccountNumber: '****9910',
    accountType: 'wallet',
    balance: 12750000,
  },
  {
    institution: 'Opay',
    maskedAccountNumber: '****6642',
    accountType: 'wallet',
    balance: 5600000,
  },
];