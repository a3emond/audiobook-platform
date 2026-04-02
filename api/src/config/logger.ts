type LogLevel = "info" | "warn" | "error" | "debug";

function log(level: LogLevel, message: string, meta?: unknown) {
  const timestamp = new Date().toISOString();

  const base = `[${timestamp}] [${level.toUpperCase()}] ${message}`;

  if (meta) {
    console.log(base, meta);
  } else {
    console.log(base);
  }
}

export const logger = {
  info: (msg: string, meta?: unknown) => log("info", msg, meta),
  warn: (msg: string, meta?: unknown) => log("warn", msg, meta),
  error: (msg: string, meta?: unknown) => log("error", msg, meta),
  debug: (msg: string, meta?: unknown) => {
    if (process.env.NODE_ENV !== "production") {
      log("debug", msg, meta);
    }
  },
};
