import { getRedis } from "./redis";
import { env } from "../env";
import { logger } from "./logger";

export interface QuotaResult {
  allowed: boolean;
  used: number;
  limit: number;
}

/**
 * Returns a Redis key in the format quota:{tenantId}:{YYYY-MM}
 */
function getQuotaKey(tenantId: string): string {
  const now = new Date();
  const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  return `quota:${tenantId}:${month}`;
}

/**
 * Checks if the tenant is within quota, then increments their counter atomically.
 * Uses a Lua script to ensure the check-and-increment is atomic.
 *
 * TTL is set to 35 days so data persists slightly beyond the end of the current month
 * for billing/audit purposes.
 */
export async function checkAndIncrement(tenantId: string): Promise<QuotaResult> {
  const redis = getRedis();
  const key = getQuotaKey(tenantId);
  const limit = env.QUOTA_DEFAULT_MONTHLY_EXECUTIONS;
  const ttlSeconds = 35 * 24 * 60 * 60; // 35 days

  // Lua script: atomically get current value, check against limit, and conditionally increment
  const luaScript = `
    local current = tonumber(redis.call('GET', KEYS[1])) or 0
    local limit = tonumber(ARGV[1])
    if current >= limit then
      return {current, 0}
    end
    local newVal = redis.call('INCR', KEYS[1])
    if newVal == 1 then
      redis.call('EXPIRE', KEYS[1], ARGV[2])
    end
    return {newVal, 1}
  `;

  try {
    const result = await redis.eval(
      luaScript,
      1,
      key,
      String(limit),
      String(ttlSeconds),
    ) as [number, number];

    const [used, incremented] = result;
    const allowed = incremented === 1;

    logger.debug("[quota] Check result", {
      tenantId,
      key,
      used,
      limit,
      allowed,
    });

    return { allowed, used, limit };
  } catch (err) {
    logger.error("[quota] Redis error during quota check", {
      tenantId,
      key,
      error: err instanceof Error ? err.message : String(err),
    });
    // Fail open: if Redis is unavailable, allow the execution
    return { allowed: true, used: 0, limit };
  }
}

/**
 * Returns the current usage without incrementing.
 */
export async function getUsage(tenantId: string): Promise<QuotaResult> {
  const redis = getRedis();
  const key = getQuotaKey(tenantId);
  const limit = env.QUOTA_DEFAULT_MONTHLY_EXECUTIONS;

  try {
    const raw = await redis.get(key);
    const used = raw !== null ? parseInt(raw, 10) : 0;
    return { allowed: used < limit, used, limit };
  } catch (err) {
    logger.error("[quota] Redis error getting usage", {
      tenantId,
      error: err instanceof Error ? err.message : String(err),
    });
    return { allowed: true, used: 0, limit };
  }
}
