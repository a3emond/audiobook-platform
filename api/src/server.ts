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

    server.listen(env.port, () => {
      logger.info(`API running on port ${env.port}`);
    });

    process.on("SIGINT", () => {
      realtime.stop();
      server.close();
    });

    process.on("SIGTERM", () => {
      realtime.stop();
      server.close();
    });
  } catch (error) {
    logger.error("Server failed to start", error);
    process.exit(1);
  }
}

start();
