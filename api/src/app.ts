import express from "express";

import { errorMiddleware } from "./middlewares/error.middleware.js";
import corsMiddleware from "./middlewares/cors.middleware.js";

// routes
import authRoutes from "./modules/auth/auth.routes.js";

// future imports
// import bookRoutes from "./modules/books/book.routes.js";

export function createApp() {
  const app = express();

  // -------------------------
  // Core middleware
  // -------------------------
  app.use(express.json());

  // -------------------------
  // Global middlewares
  // -------------------------
  app.use(corsMiddleware);

  // -------------------------
  // Health check
  // -------------------------
  app.get("/api/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  // -------------------------
  // Routes
  // -------------------------
  app.use("/api/auth", authRoutes);

  // future protected routes example
  // app.use("/api/books", authMiddleware, bookRoutes);

  // -------------------------
  // Error middleware (LAST)
  // -------------------------
  app.use(errorMiddleware);

  return app;
}
