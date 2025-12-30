import type { NextFunction, Request, Response } from "express";

export function notFound(req: Request, res: Response) {
  res.status(404).json({
    success: false,
    message: "Not Found",
    ...(req.requestId ? { requestId: req.requestId } : {}),
  });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  // Log error with request ID for debugging concurrent requests
  const requestId = req.requestId || "unknown";
  console.error(`[${requestId}] Error:`, err);

  // Supabase errors often have `message` + `details` + `hint` + `code`
  const maybe = err as { message?: string; details?: string; hint?: string; code?: string; statusCode?: number };
  const message = maybe?.message ?? "Internal Server Error";
  const statusCode = maybe?.statusCode || 500;

  // Don't expose internal errors in production
  const isDevelopment = process.env.NODE_ENV !== "production";
  const errorResponse: Record<string, unknown> = {
    success: false,
    message: statusCode >= 500 && !isDevelopment ? "Internal Server Error" : message,
    requestId,
  };

  if (maybe?.code) {
    errorResponse.code = maybe.code;
  }

  if (isDevelopment) {
    if (maybe?.details) errorResponse.details = maybe.details;
    if (maybe?.hint) errorResponse.hint = maybe.hint;
  }

  res.status(statusCode).json(errorResponse);
}


