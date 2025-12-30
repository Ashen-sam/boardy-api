import type { Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";

// Extend Express Request to include requestId
declare global {
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

/**
 * Adds a unique request ID to each request for tracking concurrent requests
 */
export const requestIdMiddleware = (req: Request, res: Response, next: NextFunction) => {
  req.requestId = randomUUID();
  res.setHeader("X-Request-ID", req.requestId);
  next();
};

