/**
 * Structured JSON request logging middleware with traceId
 */
import type { MiddlewareHandler } from "hono";
import { randomUUID } from "crypto";

export const loggerMiddleware: MiddlewareHandler = async (c, next) => {
  const start = Date.now();
  const traceId = (c.req.header("X-Trace-Id") ?? randomUUID()) as string;

  // Inject traceId into context for downstream use
  c.set("traceId", traceId);

  // Set trace ID in response header
  c.header("X-Trace-Id", traceId);

  await next();

  const latencyMs = Date.now() - start;
  const tenantId = (c.get("tenantId") as string | undefined) ?? null;
  const userId = (c.get("userId") as string | undefined) ?? null;

  const log = {
    timestamp: new Date().toISOString(),
    traceId,
    tenantId,
    userId,
    method: c.req.method,
    path: c.req.path,
    status: c.res.status,
    latencyMs,
    userAgent: c.req.header("User-Agent") ?? null,
    ip:
      c.req.header("X-Forwarded-For") ??
      c.req.header("CF-Connecting-IP") ??
      "unknown",
  };

  // Use stderr for errors, stdout for normal logs
  const output = JSON.stringify(log);
  if (c.res.status >= 500) {
    process.stderr.write(output + "\n");
  } else {
    process.stdout.write(output + "\n");
  }
};
