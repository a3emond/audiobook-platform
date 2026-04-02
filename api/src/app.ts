import express from "express";

// future imports
// import corsMiddleware from "./middlewares/cors.middleware";
// import { errorMiddleware } from "./middlewares/error.middleware";

export function createApp() {
  const app = express();

  // core middleware
  app.use(express.json());

  // middlewares (later)
  // app.use(corsMiddleware);

  // health check
  app.get("/api/health", (_, res) => {
    res.status(200).json({ status: "ok" });
  });

  // routes (mount later)
  // app.use("/api/auth", authRoutes);
  // app.use("/api/books", bookRoutes);

  // error middleware (last)
  // app.use(errorMiddleware);

  return app;
}
