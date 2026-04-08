import { createServer } from "node:http";

import { createApp } from "./app.js";
import { seedInitialAdminUser } from "./bootstrap/seed-initial-admin.js";
import { connectDB } from "./config/db.js";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { RealtimeGateway } from "./realtime/realtime.gateway.js";

async function start() {
  try {
    await connectDB();
    await seedInitialAdminUser();

    const app = createApp();
    const server = createServer(app);
    const realtime = new RealtimeGateway();
    realtime.start(server);

    server.on("upgrade", (request, socket) => {
      logger.debug("HTTP upgrade request received", {
        url: request.url,
        ip: request.socket.remoteAddress,
        userAgent: request.headers["user-agent"] ?? null,
      });

      socket.on("error", (error) => {
        logger.warn("Upgraded socket error", {
          url: request.url,
          ip: request.socket.remoteAddress,
          name: error.name,
          message: error.message,
        });
      });
    });

    server.listen(env.port, () => {
      logger.info(`API running on port ${env.port}`);
    });

    process.on("SIGINT", () => {
      logger.warn("Received SIGINT, shutting down API server");
      realtime.stop();
      server.close();
    });

    process.on("SIGTERM", () => {
      logger.warn("Received SIGTERM, shutting down API server");
      realtime.stop();
      server.close();
    });
  } catch (error) {
    logger.error("Server failed to start", error);
    process.exit(1);
  }
}

start();
