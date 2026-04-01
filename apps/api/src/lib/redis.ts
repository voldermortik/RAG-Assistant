/**
 * Redis client setup using ioredis
 */
import Redis from "ioredis";
import { env } from "../env.js";

let redisClient: Redis | null = null;

export function getRedis(): Redis {
  if (!redisClient) {
    redisClient = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: false,
      reconnectOnError(err) {
        const targetErrors = ["READONLY", "ECONNRESET", "ETIMEDOUT"];
        return targetErrors.some((e) => err.message.includes(e));
      },
    });

    redisClient.on("error", (err: Error) => {
      console.error("[Redis] Connection error:", err.message);
    });

    redisClient.on("connect", () => {
      console.info("[Redis] Connected");
    });

    redisClient.on("reconnecting", () => {
      console.warn("[Redis] Reconnecting...");
    });
  }
  return redisClient;
}

export async function closeRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}

export { Redis };
