import express from "express";

import { errorMiddleware } from "./middlewares/error.middleware.js";
import corsMiddleware from "./middlewares/cors.middleware.js";
import { authMiddleware } from "./middlewares/auth.middleware.js";
import { requireRole } from "./middlewares/role.middleware.js";
import {
  authAbuseRateLimiter,
  globalRateLimiter,
} from "./middlewares/rate-limit.middleware.js";

// routes
import authRoutes from "./modules/auth/auth.routes.js";
import bookRoutes from "./modules/books/book.routes.js";
import progressRoutes from "./modules/progress/progress.routes.js";
import settingsRoutes from "./modules/settings/settings.routes.js";
import collectionRoutes from "./modules/collections/collection.routes.js";
import seriesRoutes from "./modules/series/series.routes.js";
import adminRoutes from "./modules/admin/admin.routes.js";
import statsRoutes from "./modules/stats/stats.routes.js";
import userRoutes from "./modules/users/user.routes.js";
import streamRoutes from "./modules/streaming/stream.routes.js";
import { streamAuthMiddleware } from "./modules/streaming/stream-auth.middleware.js";
import discussionRoutes from "./modules/discussions/discussion.routes.js";

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
  app.use(globalRateLimiter);

  function mountApiRoutes(prefix: string) {
    app.get(`${prefix}/health`, (_req, res) => {
      res.status(200).json({ status: "ok", version: "v1" });
    });

    app.use(`${prefix}/auth/login`, authAbuseRateLimiter);
    app.use(`${prefix}/auth/register`, authAbuseRateLimiter);
    app.use(`${prefix}/auth/refresh`, authAbuseRateLimiter);

    app.use(`${prefix}/auth`, authRoutes);
    app.use(`${prefix}/admin`, authMiddleware, requireRole("admin"), adminRoutes);
    app.use(`${prefix}/books`, authMiddleware, bookRoutes);
    app.use(`${prefix}/progress`, authMiddleware, progressRoutes);
    app.use(`${prefix}/users`, authMiddleware, userRoutes);
    app.use(`${prefix}/settings`, authMiddleware, settingsRoutes);
    app.use(`${prefix}/discussions`, authMiddleware, discussionRoutes);
    app.use(`${prefix}/collections`, authMiddleware, collectionRoutes);
    app.use(`${prefix}/series`, authMiddleware, seriesRoutes);
    app.use(`${prefix}/stats`, authMiddleware, statsRoutes);
  }

  // Canonical API
  mountApiRoutes("/api/v1");

  // Streaming must stay outside /api for reverse-proxy routing.
  app.use("/streaming", streamAuthMiddleware, streamRoutes);

  // -------------------------
  // Error middleware (LAST)
  // -------------------------
  app.use(errorMiddleware);

  return app;
}
