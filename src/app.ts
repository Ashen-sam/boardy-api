import cors from "cors";
import express from "express";
import helmet from "helmet";
import routes from "./routes";
import { errorHandler, notFound } from "./middleware/errorHandler";
import { requestIdMiddleware } from "./middleware/requestId";
import { apiLimiter, speedLimiter } from "./middleware/rateLimiter";
import compression from "compression";

export function createApp() {
  const app = express();

  // Trust proxy for accurate IP addresses (important for rate limiting)
  app.set("trust proxy", 1);

  // Security headers
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
      crossOriginEmbedderPolicy: false, // Allow embedding if needed
    })
  );

  // Request ID for tracking concurrent requests
  app.use(requestIdMiddleware);

  // Compression (should be early in the stack)
  app.use(compression());

  // CORS configuration
  app.use(
    cors({
      origin: process.env.CORS_ORIGIN || "*", // Configure allowed origins in production
      credentials: true,
      methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "X-Request-ID"],
    })
  );

  // Body parsing with size limits to prevent DoS
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true, limit: "10mb" }));

  // Rate limiting - apply to all routes
  app.use("/api", speedLimiter); // Slow down after threshold
  app.use("/api", apiLimiter); // Hard limit

  // Health check (no rate limiting)
  app.get("/health", (_req, res) => {
    res.json({
      ok: true,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  // API routes
  app.use("/api", routes);

  // Error handling (must be last)
  app.use(notFound);
  app.use(errorHandler);

  return app;
}


