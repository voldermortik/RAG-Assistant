/**
 * RBAC role check middleware
 * Role hierarchy: owner > admin > editor > viewer
 */
import type { MiddlewareHandler } from "hono";
import { ForbiddenError, toSafeError } from "../lib/errors.js";

type Role = "owner" | "admin" | "editor" | "viewer";

const ROLE_HIERARCHY: Record<Role, number> = {
  owner: 4,
  admin: 3,
  editor: 2,
  viewer: 1,
};

/**
 * Returns a middleware that enforces a minimum role level.
 * Usage: app.use('/admin/*', requireRole('admin'))
 */
export function requireRole(minimumRole: Role): MiddlewareHandler {
  return async (c, next) => {
    const userRole = c.get("userRole") as Role | undefined;

    if (!userRole) {
      return c.json(toSafeError(new ForbiddenError("No role assigned")), 403);
    }

    const userLevel = ROLE_HIERARCHY[userRole] ?? 0;
    const requiredLevel = ROLE_HIERARCHY[minimumRole];

    if (userLevel < requiredLevel) {
      return c.json(
        toSafeError(
          new ForbiddenError(
            `Requires at least '${minimumRole}' role, but user has '${userRole}'`,
          ),
        ),
        403,
      );
    }

    await next();
  };
}

/**
 * Checks if a role meets the minimum requirement (non-middleware helper).
 */
export function hasRole(userRole: string, minimumRole: Role): boolean {
  const userLevel = ROLE_HIERARCHY[userRole as Role] ?? 0;
  const requiredLevel = ROLE_HIERARCHY[minimumRole];
  return userLevel >= requiredLevel;
}
