import { createApp } from "./app.js";
import { seedInitialAdminUser } from "./bootstrap/seed-initial-admin.js";
import { connectDB } from "./config/db.js";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";

async function start() {
  try {
    await connectDB();
    await seedInitialAdminUser();

    const app = createApp();

    app.listen(env.port, () => {
      logger.info(`API running on port ${env.port}`);
    });
  } catch (error) {
    logger.error("Server failed to start", error);
    process.exit(1);
  }
}

start();
