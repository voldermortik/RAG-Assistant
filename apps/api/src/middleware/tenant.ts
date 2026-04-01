/**
 * Tenant middleware: extracts tenantId from JWT context into Hono variables.
 * Must be applied after authMiddleware.
 */
import type { MiddlewareHandler } from "hono";
import { UnauthorizedError, toSafeError } from "../lib/errors.js";

export const tenantMiddleware: MiddlewareHandler = async (c, next) => {
  const tenantId = c.get("tenantId") as string | undefined;

  if (!tenantId) {
    const err = new UnauthorizedError("Tenant context not found");
    return c.json(toSafeError(err), 401);
  }

  // tenantId is already set by authMiddleware; this middleware validates it's present
  await next();
};
