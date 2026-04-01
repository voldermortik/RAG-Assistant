/**
 * Team management routes
 *
 * GET    /teams/members                   — list members in the tenant
 * POST   /teams/invite                    — invite a new member
 * PUT    /teams/members/:userId/role      — update a member's role
 * DELETE /teams/members/:userId          — remove a member
 */
import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "../lib/db.js";
import { authMiddleware } from "../middleware/auth.js";
import { tenantMiddleware } from "../middleware/tenant.js";
import { requireRole } from "../middleware/rbac.js";
import {
  NotFoundError,
  ConflictError,
  ForbiddenError,
  ValidationError,
  BadRequestError,
  toSafeError,
} from "../lib/errors.js";
import { hashPassword } from "../lib/password.js";
import { randomUUID } from "crypto";

export const teamRoutes = new Hono();

// All team routes require authentication
teamRoutes.use("*", authMiddleware, tenantMiddleware);

// ---------------------------------------------------------------------------
// GET /teams/members
// ---------------------------------------------------------------------------

teamRoutes.get("/members", async (c) => {
  const tenantId = c.get("tenantId") as string;

  const rows = await db
    .select({
      userId: schema.memberships.userId,
      role: schema.memberships.role,
      joinedAt: schema.memberships.joinedAt,
      email: schema.users.email,
      name: schema.users.name,
      avatarUrl: schema.users.avatarUrl,
    })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.memberships.userId, schema.users.id))
    .where(eq(schema.memberships.tenantId, tenantId));

  return c.json({ data: rows, total: rows.length });
});

// ---------------------------------------------------------------------------
// POST /teams/invite
// ---------------------------------------------------------------------------

const inviteSchema = z.object({
  email: z.string().email("Valid email is required"),
  name: z.string().min(1, "Name is required"),
  role: z.enum(["admin", "editor", "viewer"]).default("viewer"),
});

teamRoutes.post("/invite", requireRole("admin"), async (c) => {
  const tenantId = c.get("tenantId") as string;
  const inviterId = c.get("userId") as string;

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(toSafeError(new BadRequestError("Invalid JSON body")), 400);
  }

  const parsed = inviteSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      toSafeError(new ValidationError("Validation failed", parsed.error.flatten())),
      422,
    );
  }

  const { email, name, role } = parsed.data;

  // Check if user with this email already exists in this tenant
  const [existingUser] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(and(eq(schema.users.email, email), eq(schema.users.tenantId, tenantId)))
    .limit(1);

  if (existingUser) {
    // Check if already a member
    const [existingMembership] = await db
      .select({ id: schema.memberships.id })
      .from(schema.memberships)
      .where(
        and(
          eq(schema.memberships.userId, existingUser.id),
          eq(schema.memberships.tenantId, tenantId),
        ),
      )
      .limit(1);

    if (existingMembership) {
      return c.json(
        toSafeError(new ConflictError("User is already a member of this team")),
        409,
      );
    }

    // Add existing user as member
    const [membership] = await db
      .insert(schema.memberships)
      .values({
        tenantId,
        userId: existingUser.id,
        role,
        invitedBy: inviterId,
      })
      .returning();

    return c.json(membership, 201);
  }

  // Create new user with a temporary password hash
  const tempPasswordHash = await hashPassword(randomUUID());

  const result = await db.transaction(async (tx) => {
    const [newUser] = await tx
      .insert(schema.users)
      .values({
        tenantId,
        email,
        name,
        passwordHash: tempPasswordHash,
        provider: "local",
      })
      .returning();

    if (!newUser) throw new Error("Failed to create invited user");

    const [membership] = await tx
      .insert(schema.memberships)
      .values({
        tenantId,
        userId: newUser.id,
        role,
        invitedBy: inviterId,
      })
      .returning();

    return { user: newUser, membership };
  });

  return c.json(
    {
      userId: result.user.id,
      email: result.user.email,
      name: result.user.name,
      role: result.membership?.role ?? role,
    },
    201,
  );
});

// ---------------------------------------------------------------------------
// PUT /teams/members/:userId/role
// ---------------------------------------------------------------------------

const updateRoleSchema = z.object({
  role: z.enum(["admin", "editor", "viewer"]),
});

teamRoutes.put("/members/:userId/role", requireRole("admin"), async (c) => {
  const tenantId = c.get("tenantId") as string;
  const actorId = c.get("userId") as string;
  const targetUserId = c.req.param("userId");

  // Prevent self-demotion
  if (actorId === targetUserId) {
    return c.json(
      toSafeError(new ForbiddenError("Cannot change your own role")),
      403,
    );
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(toSafeError(new BadRequestError("Invalid JSON body")), 400);
  }

  const parsed = updateRoleSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      toSafeError(new ValidationError("Validation failed", parsed.error.flatten())),
      422,
    );
  }

  const [existing] = await db
    .select({ role: schema.memberships.role })
    .from(schema.memberships)
    .where(
      and(
        eq(schema.memberships.userId, targetUserId),
        eq(schema.memberships.tenantId, tenantId),
      ),
    )
    .limit(1);

  if (!existing) {
    return c.json(toSafeError(new NotFoundError("Team member")), 404);
  }

  // Cannot change the role of an owner
  if (existing.role === "owner") {
    return c.json(
      toSafeError(new ForbiddenError("Cannot change the role of an owner")),
      403,
    );
  }

  const [updated] = await db
    .update(schema.memberships)
    .set({ role: parsed.data.role, updatedAt: new Date() })
    .where(
      and(
        eq(schema.memberships.userId, targetUserId),
        eq(schema.memberships.tenantId, tenantId),
      ),
    )
    .returning();

  return c.json(updated);
});

// ---------------------------------------------------------------------------
// DELETE /teams/members/:userId
// ---------------------------------------------------------------------------

teamRoutes.delete("/members/:userId", requireRole("admin"), async (c) => {
  const tenantId = c.get("tenantId") as string;
  const actorId = c.get("userId") as string;
  const targetUserId = c.req.param("userId");

  // Prevent self-removal
  if (actorId === targetUserId) {
    return c.json(
      toSafeError(new ForbiddenError("Cannot remove yourself from the team")),
      403,
    );
  }

  const [existing] = await db
    .select({ role: schema.memberships.role })
    .from(schema.memberships)
    .where(
      and(
        eq(schema.memberships.userId, targetUserId),
        eq(schema.memberships.tenantId, tenantId),
      ),
    )
    .limit(1);

  if (!existing) {
    return c.json(toSafeError(new NotFoundError("Team member")), 404);
  }

  // Cannot remove an owner
  if (existing.role === "owner") {
    return c.json(
      toSafeError(new ForbiddenError("Cannot remove the owner from the team")),
      403,
    );
  }

  await db
    .delete(schema.memberships)
    .where(
      and(
        eq(schema.memberships.userId, targetUserId),
        eq(schema.memberships.tenantId, tenantId),
      ),
    );

  return c.body(null, 204);
});
