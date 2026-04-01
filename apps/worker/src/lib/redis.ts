import Redis from "ioredis";
import { env } from "../env";
import { logger } from "./logger";

let redisClient: Redis | null = null;
// Separate connection used exclusively for BullMQ (it manages its own lifecycle)
let bullmqRedisClient: Redis | null = null;

export function getRedis(): Redis {
  if (!redisClient) {
    redisClient = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: false,
      reconnectOnError(err: Error) {
        const targetErrors = ["READONLY", "ECONNRESET", "ETIMEDOUT"];
        return targetErrors.some((e) => err.message.includes(e));
      },
    });

    redisClient.on("error", (err: Error) => {
      logger.error("[Redis] Connection error", { error: err.message });
    });

    redisClient.on("connect", () => {
      logger.info("[Redis] Connected");
    });

    redisClient.on("reconnecting", () => {
      logger.warn("[Redis] Reconnecting...");
    });
  }
  return redisClient;
}

/**
 * Returns a Redis connection suitable for BullMQ.
 * BullMQ requires maxRetriesPerRequest: null for blocking commands.
 */
export function getBullMQRedis(): Redis {
  if (!bullmqRedisClient) {
    bullmqRedisClient = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      reconnectOnError(err: Error) {
        const targetErrors = ["READONLY", "ECONNRESET", "ETIMEDOUT"];
        return targetErrors.some((e) => err.message.includes(e));
      },
    });

    bullmqRedisClient.on("error", (err: Error) => {
      logger.error("[Redis/BullMQ] Connection error", { error: err.message });
    });
  }
  return bullmqRedisClient;
}

export async function closeRedis(): Promise<void> {
  const closers: Promise<string>[] = [];
  if (redisClient) {
    closers.push(redisClient.quit());
    redisClient = null;
  }
  if (bullmqRedisClient) {
    closers.push(bullmqRedisClient.quit());
    bullmqRedisClient = null;
  }
  await Promise.all(closers);
}

export { Redis };
