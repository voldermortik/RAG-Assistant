/**
 * Redis-backed rate limiting middleware
 */
import type { MiddlewareHandler } from "hono";
import { getRedis } from "../lib/redis.js";
import { RateLimitError, toSafeError } from "../lib/errors.js";

interface RateLimitOptions {
  /** Maximum number of requests in the window */
  max: number;
  /** Window duration in milliseconds */
  windowMs: number;
  /** Key prefix for Redis (e.g., 'auth:login', 'webhook:trigger') */
  keyPrefix: string;
  /** Function to extract the identifier from request context */
  keyExtractor: (c: Parameters<MiddlewareHandler>[0]) => string;
}

/**
 * Creates a rate limiter middleware using a sliding window counter in Redis.
 */
export function rateLimit(options: RateLimitOptions): MiddlewareHandler {
  const { max, windowMs, keyPrefix, keyExtractor } = options;
  const windowSeconds = Math.ceil(windowMs / 1000);

  return async (c, next) => {
    const redis = getRedis();
    const identifier = keyExtractor(c);
    const redisKey = `ratelimit:${keyPrefix}:${identifier}`;

    const pipeline = redis.multi();
    pipeline.incr(redisKey);
    pipeline.expire(redisKey, windowSeconds);

    const results = await pipeline.exec();
    const count = results?.[0]?.[1] as number | null;

    if (count !== null && count > max) {
      c.header("X-RateLimit-Limit", String(max));
      c.header("X-RateLimit-Remaining", "0");
      c.header("X-RateLimit-Reset", String(Math.ceil(Date.now() / 1000) + windowSeconds));
      return c.json(toSafeError(new RateLimitError()), 429);
    }

    c.header("X-RateLimit-Limit", String(max));
    c.header("X-RateLimit-Remaining", String(Math.max(0, max - (count ?? 1))));

    await next();
  };
}

/**
 * Rate limiter for auth endpoints: 5 failed logins per IP per minute.
 * Call incrementFailedLogin() after a failed attempt.
 */
export async function checkFailedLoginLimit(ip: string): Promise<void> {
  const redis = getRedis();
  const key = `ratelimit:auth:failed:${ip}`;
  const count = await redis.incr(key);

  if (count === 1) {
    await redis.expire(key, 60); // 1 minute window
  }

  if (count > 5) {
    throw new RateLimitError(
      "Too many failed login attempts. Please try again in 1 minute.",
    );
  }
}

/**
 * Resets failed login counter for an IP after successful login.
 */
export async function resetFailedLoginLimit(ip: string): Promise<void> {
  const redis = getRedis();
  await redis.del(`ratelimit:auth:failed:${ip}`);
}

/**
 * Rate limiter factory for webhook trigger endpoint.
 * 100 req/min per tenant on free tier.
 */
export const webhookRateLimit = rateLimit({
  max: 100,
  windowMs: 60000,
  keyPrefix: "webhook",
  keyExtractor: (c) => {
    const tenantId = c.req.param("workflowId")
      ? (c.get("webhookTenantId") as string | undefined) ?? "unknown"
      : "unknown";
    return tenantId;
  },
});

/**
 * General API rate limiter: 1000 req/min per user.
 */
export const apiRateLimit = rateLimit({
  max: 1000,
  windowMs: 60000,
  keyPrefix: "api",
  keyExtractor: (c) =>
    (c.get("userId") as string | undefined) ??
    c.req.header("X-Forwarded-For") ??
    "anonymous",
});
