import { Router } from "express";
import rateLimit from "express-rate-limit";
import {
  register,
  login,
  logout,
  refresh,
} from "../controllers/authController";
import {
  sendOtp,
  verifyOtp,
  forgotPassword,
  resetPassword,
} from "../controllers/otpController";
import { requireAuth } from "../middleware/requireAuth";

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: "Too many attempts — please try again in 15 minutes" },
  standardHeaders: true,
  legacyHeaders: false,
});

const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Too many OTP requests — please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post("/register", authLimiter, register);
router.post("/login", authLimiter, login);
router.post("/logout", requireAuth, logout);
router.post("/refresh", refresh);

router.post("/send-otp", otpLimiter, sendOtp);
router.post("/verify-otp", otpLimiter, verifyOtp);
router.post("/forgot-password", otpLimiter, forgotPassword);
router.post("/reset-password", otpLimiter, resetPassword);

export default router;
