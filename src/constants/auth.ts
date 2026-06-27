export const OTP_PURPOSES = ['signup', 'reset'] as const;
export type OtpPurpose = (typeof OTP_PURPOSES)[number];

export const OTP_LENGTH = 6;
export const OTP_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
export const OTP_RESEND_COOLDOWN_MS = 30 * 1000; // 30 seconds 
export const OTP_MAX_ATTEMPTS = 5;