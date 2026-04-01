import { logger } from "./lib/logger";
import { closeRedis } from "./lib/redis";
import { closeDb } from "./lib/db";
import { createExecutionWorker } from "./worker";

async function main(): Promise<void> {
  logger.info("[main] FlowCore Worker starting", {
    nodeEnv: process.env["NODE_ENV"] ?? "development",
  });

  const worker = createExecutionWorker();

  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`[main] Received ${signal}, shutting down gracefully…`);

    try {
      await worker.close();
      logger.info("[main] BullMQ worker closed");
    } catch (err) {
      logger.error("[main] Error closing BullMQ worker", {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    try {
      await closeDb();
    } catch (err) {
      logger.error("[main] Error closing DB", {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    try {
      await closeRedis();
    } catch (err) {
      logger.error("[main] Error closing Redis", {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    logger.info("[main] Shutdown complete");
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  process.on("uncaughtException", (err) => {
    logger.error("[main] Uncaught exception", {
      error: err.message,
      stack: err.stack,
    });
    void shutdown("uncaughtException");
  });

  process.on("unhandledRejection", (reason) => {
    logger.error("[main] Unhandled rejection", {
      reason: reason instanceof Error ? reason.message : String(reason),
    });
  });

  logger.info("[main] Worker ready and listening for jobs");
}

main().catch((err) => {
  logger.error("[main] Fatal startup error", {
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
  process.exit(1);
});
