/**
 * Redis-backed idempotency key check (24h TTL)
 */
import { getRedis } from "./redis.js";

const KEY_PREFIX = "idempotency:";
const TTL_SECONDS = 86400; // 24 hours

export interface IdempotencyResult {
  isDuplicate: boolean;
  cachedResponse?: unknown;
}

/**
 * Checks if an idempotency key has been used.
 * Returns { isDuplicate: false } if key is new and marks it as used.
 * Returns { isDuplicate: true, cachedResponse } if key was already used.
 */
export async function checkIdempotency(
  key: string,
  tenantId: string,
  response?: unknown,
): Promise<IdempotencyResult> {
  const redis = getRedis();
  const redisKey = `${KEY_PREFIX}${tenantId}:${key}`;

  if (response !== undefined) {
    // Store the response after successful processing
    await redis.setex(redisKey, TTL_SECONDS, JSON.stringify(response));
    return { isDuplicate: false };
  }

  // Check if key exists
  const existing = await redis.get(redisKey);
  if (existing !== null) {
    try {
      return {
        isDuplicate: true,
        cachedResponse: JSON.parse(existing) as unknown,
      };
    } catch {
      return { isDuplicate: true };
    }
  }

  // Reserve the key with a placeholder (will be overwritten with real response)
  // NX = only set if not exists, to prevent race conditions
  const set = await redis.set(
    redisKey,
    JSON.stringify({ status: "processing" }),
    "EX",
    TTL_SECONDS,
    "NX",
  );

  if (set === null) {
    // Another request got here first
    return { isDuplicate: true };
  }

  return { isDuplicate: false };
}

/**
 * Updates the cached response for an idempotency key after successful processing.
 */
export async function setIdempotencyResponse(
  key: string,
  tenantId: string,
  response: unknown,
): Promise<void> {
  const redis = getRedis();
  const redisKey = `${KEY_PREFIX}${tenantId}:${key}`;
  await redis.setex(redisKey, TTL_SECONDS, JSON.stringify(response));
}
