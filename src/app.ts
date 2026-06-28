import "dotenv/config";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import mongoose from "mongoose";
import connectDB from "./config/db";
import authRoutes from "./routes/authRoutes";
import onboardingRoutes from "./routes/onboardingRoutes";
import accountRoutes from "./routes/accountRoutes";
import dataRoutes from "./routes/dataRoutes";
import { errorHandler } from "./middleware/errorHandler";

const app = express();

// Security middleware — applied first
app.use(helmet());
const devOrigins = [
  "http://localhost:5173",
  "http://localhost:3000",
  "http://127.0.0.1:5173",
];
const productionOrigin = process.env.ALLOWED_ORIGIN?.replace(/\/$/, "");

app.use(
  cors({
    origin:
      process.env.NODE_ENV === "production"
        ? productionOrigin || "https://pocketsync-groupten-mvp.vercel.app"
        : (origin, callback) => {
            if (!origin || devOrigins.includes(origin)) {
              callback(null, true);
              return;
            }
            if (productionOrigin && origin === productionOrigin) {
              callback(null, true);
              return;
            }
            callback(null, true);
          },
    credentials: true,
  }),
);

// Body & cookie parsing
app.use(express.json({ limit: "10kb" })); // Limit body size
app.use(express.urlencoded({ extended: false, limit: "10kb" }));
app.use(cookieParser());

// Routes
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/onboarding", onboardingRoutes);
app.use("/api/v1", accountRoutes);
app.use("/api/v1", dataRoutes);

// Health check
app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "PocketSync API",
    db: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
  });
});

//  404 handler
app.use((_req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// ── Global error handler — must be last ──
app.use(errorHandler);

//  Start server
const PORT = parseInt(process.env.PORT || "5000", 10);

const start = async () => {
  await connectDB();
  app.listen(PORT, () => {
    console.log(
      `This PocketSync server is running on http://localhost:${PORT}`,
    );
    console.log(`   Environment: ${process.env.NODE_ENV}`);
    console.log(`   Health check: http://localhost:${PORT}/health`);
  });
};

start();

export default app;
