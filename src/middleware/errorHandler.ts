import { Request, Response, NextFunction } from 'express';

interface AppError extends Error {
  statusCode?: number;
}

// Global error handler — never leaks stack traces to client
export const errorHandler = (
  err: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const statusCode = err.statusCode || 500;

  // Log full error server-side
  console.error(`[ERROR] ${err.message}`, process.env.NODE_ENV === 'development' ? err.stack : '');

  // Only safe message to client — no stack traces in prod
  res.status(statusCode).json({
    error:
      process.env.NODE_ENV === 'development'
        ? err.message
        : statusCode === 500
        ? 'Internal server error'
        : err.message,
  });
};
