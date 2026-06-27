import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../middleware/requireAuth';
import {
  connectDiscoveredAccounts,
  getDiscoveredAccounts,
  getOnboardingStatus,
  sendBvnOtp,
  submitBvn,
  verifyBvnOtp,
} from '../controllers/onboardingController';

const router = Router();

const onboardingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  keyGenerator: (req) => req.user?.userId || req.ip || 'unknown',
  message: { error: 'Too many onboarding attempts — please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: (req) => req.user?.userId || req.ip || 'unknown',
  message: { error: 'Too many OTP requests — please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.use(requireAuth);

router.get('/status', getOnboardingStatus);
router.post('/bvn/submit', onboardingLimiter, submitBvn);
router.post('/bvn/send-otp', otpLimiter, sendBvnOtp);
router.post('/bvn/verify-otp', otpLimiter, verifyBvnOtp);
router.get('/bvn/accounts', getDiscoveredAccounts);
router.post('/bvn/connect', onboardingLimiter, connectDiscoveredAccounts);

export default router;