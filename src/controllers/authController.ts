import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import User from "../models/User";
import { issueEmailOtp } from "../services/otpService";

const issueTokens = (userId: string, email: string) => {
  const accessToken = jwt.sign(
    { userId, email },
    process.env.JWT_ACCESS_SECRET as string,
    { expiresIn: "15m" },
  );

  const refreshToken = jwt.sign(
    { userId },
    process.env.JWT_REFRESH_SECRET as string,
    { expiresIn: "7d" },
  );

  return { accessToken, refreshToken };
};

const setTokenCookies = (
  res: Response,
  accessToken: string,
  refreshToken: string,
) => {
  // Access token — short-lived, HttpOnly
  res.cookie("accessToken", accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 15 * 60 * 1000, // 15 minutes
  });

  // Refresh token — longer-lived, HttpOnly, scoped to refresh route only
  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: "/api/v1/auth/refresh",
  });
};

// POST /api/v1/auth/register
export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, fullName, username, password, confirmPassword, termsAccepted } =
      req.body;

    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      typeof fullName !== "string"
    ) {
      res.status(400).json({ error: "Invalid input" });
      return;
    }

    if (!email.trim() || !password || !fullName.trim()) {
      res.status(400).json({ error: "Email, full name, and password are required" });
      return;
    }

    if (termsAccepted !== true) {
      res.status(400).json({ error: "You must accept the terms and privacy policy" });
      return;
    }

    if (password.length < 8) {
      res.status(400).json({ error: "Password must be at least 8 characters" });
      return;
    }

    if (confirmPassword !== undefined && confirmPassword !== password) {
      res.status(400).json({ error: "Passwords do not match" });
      return;
    }

    const normalisedEmail = email.toLowerCase().trim();

    const existing = await User.findOne({ email: normalisedEmail });
    if (existing) {
      if (existing.emailVerified) {
        res.status(409).json({
          error: "An account with this email already exists",
          emailVerified: true,
        });
        return;
      }

      const otpResult = await issueEmailOtp(normalisedEmail, "signup");

      res.status(200).json({
        message: otpResult.resent
          ? "This email is already registered but not verified — a new verification code has been sent"
          : `This email is already registered but not verified — use your existing code or wait ${otpResult.resendAvailableIn}s to resend`,
        userId: existing._id,
        emailVerified: false,
        requiresVerification: true,
        resendAvailableIn: otpResult.resendAvailableIn,
        ...(otpResult.devOtp ? { devOtp: otpResult.devOtp } : {}),
      });
      return;
    }

    const user = new User({
      email: normalisedEmail,
      fullName: fullName.trim(),
      username: typeof username === "string" && username.trim() ? username.trim() : undefined,
      passwordHash: password,
      termsAcceptedAt: new Date(),
      emailVerified: false,
      bvnVerified: false,
    });
    await user.save();

    const otpResult = await issueEmailOtp(normalisedEmail, "signup");

    res.status(201).json({
      message: "Account created — verification code sent to your email",
      userId: user._id,
      emailVerified: false,
      requiresVerification: true,
      resendAvailableIn: otpResult.resendAvailableIn,
      ...(otpResult.devOtp ? { devOtp: otpResult.devOtp } : {}),
    });
  } catch (err: any) {
    console.error("Registration error:", err);
    console.error("Error stack:", err.stack);

    res.status(500).json({
      error: "Registration failed",
      details: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
};

// POST /api/v1/auth/login
export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    // Prevent NoSQL injection — reject non-string inputs
    // this issue surfaced during cybersecurty testing, where the team attempted to send an object instead of a string to bypass validation

    if (typeof email !== "string" || typeof password !== "string") {
      res.status(400).json({ error: "Invalid input" });
      return;
    }

    if (!email || !password) {
      res.status(400).json({ error: "Email and password are required" });
      return;
    }

    // Explicitly select passwordHash (select: false by default)
    const user = await User.findOne({
      email: email.toLowerCase().trim(),
    }).select("+passwordHash +refreshTokenHash");

    // Generic error — never reveal whether email exists
    if (!user) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    if (!user.emailVerified) {
      res.status(403).json({
        error: "Email not verified — please check your inbox for the 6-digit code",
        requiresVerification: true,
        email: user.email,
      });
      return;
    }

    const { accessToken, refreshToken } = issueTokens(
      user._id.toString(),
      user.email,
    );

    // Store refresh token hash in DB for server-side revocation
    user.refreshTokenHash = await bcrypt.hash(refreshToken, 10);
    user.lastLoginAt = new Date();
    await user.save();

    setTokenCookies(res, accessToken, refreshToken);

    res.status(200).json({
      message: "Login successful",
      user: {
        id: user._id,
        email: user.email,
        fullName: user.fullName,
        emailVerified: user.emailVerified,
        bvnVerified: user.bvnVerified,
      },
    });
  } catch (err) {
    res.status(500).json({ error: "Login failed" });
  }
};

// POST /api/v1/auth/logout
export const logout = async (req: Request, res: Response): Promise<void> => {
  try {
    // Invalidate refresh token in DB — effective server-side logout
    await User.findByIdAndUpdate(req.user!.userId, { refreshTokenHash: null });

    // Clear both cookies
    res.clearCookie("accessToken");
    res.clearCookie("refreshToken", { path: "/api/v1/auth/refresh" });

    res.status(200).json({ message: "Logged out successfully" });
  } catch (err) {
    res.status(500).json({ error: "Logout failed" });
  }
};

// POST /api/v1/auth/refresh
export const refresh = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.cookies?.refreshToken;

    if (!token) {
      res.status(401).json({ error: "No refresh token" });
      return;
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_REFRESH_SECRET as string,
    ) as { userId: string };

    const user = await User.findById(decoded.userId).select(
      "+refreshTokenHash",
    );

    if (!user || !user.refreshTokenHash) {
      res.status(401).json({ error: "Invalid refresh token" });
      return;
    }

    // Verify refresh token matches stored hash
    const isValid = await bcrypt.compare(token, user.refreshTokenHash);
    if (!isValid) {
      res.status(401).json({ error: "Invalid refresh token" });
      return;
    }

    // Rotate — issue new tokens, invalidate old refresh token
    const { accessToken, refreshToken: newRefreshToken } = issueTokens(
      user._id.toString(),
      user.email,
    );

    user.refreshTokenHash = await bcrypt.hash(newRefreshToken, 10);
    await user.save();

    setTokenCookies(res, accessToken, newRefreshToken);

    res.status(200).json({ message: "Token refreshed" });
  } catch (err) {
    res.status(401).json({ error: "Invalid or expired refresh token" });
  }
};
