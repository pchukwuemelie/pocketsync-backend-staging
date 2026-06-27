import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { register, login, logout, refresh } from '../controllers/authController';
import { requireAuth } from '../middleware/requireAuth';

const router = Router();

// Rate limit: 5 attempts per 15 minutes per IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: { error: 'Too many attempts — please try again in 15 minutes' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/register', authLimiter, register);
router.post('/login', authLimiter, login);
router.post('/logout', requireAuth, logout);
router.post('/refresh', refresh); // Uses refresh token cookie

export default router;
