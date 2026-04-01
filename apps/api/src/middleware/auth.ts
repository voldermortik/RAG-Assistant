/**
 * JWT verification middleware
 * Extracts user and tenant from Bearer token
 */
import type { MiddlewareHandler } from "hono";
import { verifyAccessToken } from "../lib/jwt.js";
import { UnauthorizedError, toSafeError } from "../lib/errors.js";

export const authMiddleware: MiddlewareHandler = async (c, next) => {
  const authHeader = c.req.header("Authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    const err = new UnauthorizedError("Missing or invalid Authorization header");
    return c.json(toSafeError(err), 401);
  }

  const token = authHeader.slice(7);

  try {
    const payload = await verifyAccessToken(token);

    c.set("userId", payload.sub);
    c.set("tenantId", payload.tenantId);
    c.set("userEmail", payload.email);
    c.set("userRole", payload.role);

    await next();
  } catch {
    const err = new UnauthorizedError("Invalid or expired token");
    return c.json(toSafeError(err), 401);
  }
};
