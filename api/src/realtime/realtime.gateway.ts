import type { Server as HttpServer } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";

import { logger } from "../config/logger.js";
import { BookModel } from "../modules/books/book.model.js";
import { JobModel } from "../modules/jobs/job.model.js";
import {
  subscribeRealtimeEvents,
  type RealtimeEventEnvelope,
} from "./realtime.events.js";

export class RealtimeGateway {
  private wss?: WebSocketServer;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private jobsCursor = new Date(Date.now() - 30_000);
  private booksCursor = new Date(Date.now() - 30_000);
  private unsubscribe?: () => void;

  start(server: HttpServer): void {
    this.wss = new WebSocketServer({
      server,
      path: "/ws",
    });

    this.wss.on("error", (error) => {
      logger.error("Realtime websocket server error", {
        name: error.name,
        message: error.message,
      });
    });

    this.wss.on("close", () => {
      logger.warn("Realtime websocket server closed");
    });

    this.wss.on("connection", (socket, request) => {
      const clientInfo = {
        ip: request.socket.remoteAddress,
        path: request.url,
        userAgent: request.headers["user-agent"] ?? null,
      };

      logger.info("Realtime websocket client connected", clientInfo);

      socket.on("close", (code, reasonBuffer) => {
        const reason = reasonBuffer.toString("utf8").trim();
        logger.info("Realtime websocket client disconnected", {
          ...clientInfo,
          code,
          reason: reason || null,
        });
      });

      socket.on("error", (error) => {
        logger.warn("Realtime websocket client error", {
          ...clientInfo,
          name: error.name,
          message: error.message,
        });
      });

      this.send(socket, {
        type: "system.connected",
        ts: new Date().toISOString(),
        payload: { ok: true },
      });

      socket.on("message", (raw) => {
        this.handleClientMessage(raw);
      });
    });

    this.unsubscribe = subscribeRealtimeEvents((event) => {
      this.broadcast(event);
    });

    this.pollTimer = setInterval(() => {
      void this.flushChanges();
    }, 2000);

    logger.info("Realtime websocket gateway started");
  }

  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    this.unsubscribe?.();
    this.unsubscribe = undefined;

    this.wss?.close();
    this.wss = undefined;
  }

  private async flushChanges(): Promise<void> {
    await Promise.all([this.broadcastJobUpdates(), this.broadcastBookInsertions()]);
  }

  private async broadcastJobUpdates(): Promise<void> {
    const jobs = await JobModel.find({ updatedAt: { $gt: this.jobsCursor } })
      .sort({ updatedAt: 1 })
      .limit(200)
      .select("_id type status updatedAt createdAt attempt maxAttempts error");

    if (jobs.length === 0) {
      return;
    }

    this.jobsCursor = new Date(jobs[jobs.length - 1].updatedAt ?? new Date());

    for (const job of jobs) {
      this.broadcast({
        type: "job.state.changed",
        ts: new Date().toISOString(),
        payload: {
          job: {
            id: String(job._id),
            type: job.type,
            status: job.status,
            createdAt: job.createdAt?.toISOString(),
            updatedAt: job.updatedAt?.toISOString(),
            attempt: job.attempt,
            maxAttempts: job.maxAttempts,
            error: job.error ?? null,
          },
        },
      });
    }
  }

  private async broadcastBookInsertions(): Promise<void> {
    const books = await BookModel.find({ createdAt: { $gt: this.booksCursor } })
      .sort({ createdAt: 1 })
      .limit(100)
      .select("_id title author language createdAt");

    if (books.length === 0) {
      return;
    }

    this.booksCursor = new Date(books[books.length - 1].createdAt ?? new Date());

    for (const book of books) {
      this.broadcast({
        type: "catalog.book.added",
        ts: new Date().toISOString(),
        payload: {
          book: {
            id: String(book._id),
            title: book.title,
            author: book.author,
            language: book.language ?? null,
            createdAt: book.createdAt?.toISOString(),
          },
        },
      });
    }
  }

  private broadcast(event: RealtimeEventEnvelope): void {
    if (!this.wss) {
      return;
    }

    if (this.wss.clients.size === 0) {
      return;
    }

    const raw = JSON.stringify(event);
    let delivered = 0;
    for (const client of this.wss.clients) {
      if (this.send(client, raw)) {
        delivered += 1;
      }
    }

    logger.debug("Realtime event broadcast", {
      type: event.type,
      delivered,
      connectedClients: this.wss.clients.size,
    });
  }

  private send(socket: WebSocket, payload: RealtimeEventEnvelope | string): boolean {
    if (socket.readyState !== socket.OPEN) {
      return false;
    }

    const raw = typeof payload === "string" ? payload : JSON.stringify(payload);
    socket.send(raw);
    return true;
  }

  private handleClientMessage(raw: unknown): void {
    if (typeof raw !== "string" && !Buffer.isBuffer(raw)) {
      return;
    }

    const content = Buffer.isBuffer(raw) ? raw.toString("utf8") : raw;

    let parsed: { type?: string; payload?: unknown } | null = null;
    try {
      parsed = JSON.parse(content) as { type?: string; payload?: unknown };
    } catch {
      return;
    }

    const type = parsed?.type;
    if (type !== "playback.session.presence" && type !== "playback.claim" && type !== "playback.progress") {
      return;
    }

    if (!parsed.payload || typeof parsed.payload !== "object") {
      return;
    }

    if (type === "playback.session.presence") {
      const payload = parsed.payload as {
        userId?: unknown;
        deviceId?: unknown;
        label?: unknown;
        platform?: unknown;
        currentBookId?: unknown;
        paused?: unknown;
      };

      if (typeof payload.userId !== "string" || typeof payload.deviceId !== "string") {
        return;
      }

      this.broadcast({
        type: "playback.session.presence",
        ts: new Date().toISOString(),
        payload: {
          userId: payload.userId,
          deviceId: payload.deviceId,
          label: typeof payload.label === "string" ? payload.label : "Browser",
          platform: typeof payload.platform === "string" ? payload.platform : "web",
          currentBookId: typeof payload.currentBookId === "string" ? payload.currentBookId : null,
          paused: typeof payload.paused === "boolean" ? payload.paused : true,
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    if (type === "playback.claim") {
      const payload = parsed.payload as {
        userId?: unknown;
        deviceId?: unknown;
        bookId?: unknown;
        timestamp?: unknown;
      };

      if (
        typeof payload.userId !== "string" ||
        typeof payload.deviceId !== "string" ||
        typeof payload.bookId !== "string" ||
        typeof payload.timestamp !== "string"
      ) {
        return;
      }

      this.broadcast({
        type: "playback.claimed",
        ts: new Date().toISOString(),
        payload: {
          userId: payload.userId,
          deviceId: payload.deviceId,
          bookId: payload.bookId,
          timestamp: payload.timestamp,
        },
      });
      return;
    }

    const payload = parsed.payload as {
      userId?: unknown;
      bookId?: unknown;
      positionSeconds?: unknown;
      durationAtSave?: unknown;
      completed?: unknown;
      timestamp?: unknown;
    };

    if (
      typeof payload.userId !== "string" ||
      typeof payload.bookId !== "string" ||
      typeof payload.positionSeconds !== "number" ||
      typeof payload.durationAtSave !== "number" ||
      typeof payload.completed !== "boolean"
    ) {
      return;
    }

    this.broadcast({
      type: "progress.synced",
      ts: new Date().toISOString(),
      payload: {
        userId: payload.userId,
        bookId: payload.bookId,
        positionSeconds: Math.max(0, Math.floor(payload.positionSeconds)),
        durationAtSave: Math.max(0, Math.floor(payload.durationAtSave)),
        completed: payload.completed,
        timestamp: typeof payload.timestamp === "string" ? payload.timestamp : new Date().toISOString(),
      },
    });
  }
}
