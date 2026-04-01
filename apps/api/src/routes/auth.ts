/**
 * Authentication routes
 *
 * POST /auth/register   — create a new user + tenant
 * POST /auth/login      — email/password login; issues JWT access token + httpOnly refresh cookie
 * POST /auth/refresh    — rotate refresh token; issue new access token
 * POST /auth/logout     — clear refresh cookie
 * GET  /auth/me         — return the authenticated user's profile
 */
import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { db, schema } from "../lib/db.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../lib/jwt.js";
import {
  checkFailedLoginLimit,
  resetFailedLoginLimit,
} from "../middleware/rateLimit.js";
import { authMiddleware } from "../middleware/auth.js";
import {
  UnauthorizedError,
  ConflictError,
  ValidationError,
  BadRequestError,
  toSafeError,
} from "../lib/errors.js";
import { env } from "../env.js";
import { randomUUID } from "crypto";

export const authRoutes = new Hono();

// ---------------------------------------------------------------------------
// POST /auth/register
// ---------------------------------------------------------------------------

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(1, "Name is required"),
  tenantName: z.string().min(1, "Tenant/organisation name is required"),
});

authRoutes.post("/register", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(toSafeError(new BadRequestError("Invalid JSON body")), 400);
  }

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      toSafeError(new ValidationError("Validation failed", parsed.error.flatten())),
      422,
    );
  }

  const { email, password, name, tenantName } = parsed.data;

  // Check if email is already registered (global uniqueness not required but
  // enforce per-tenant uniqueness; for registration we treat email as globally unique)
  const existingUsers = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);

  if (existingUsers.length > 0) {
    return c.json(toSafeError(new ConflictError("Email is already registered")), 409);
  }

  const passwordHash = await hashPassword(password);

  // Create tenant, user, and membership in a single transaction
  const result = await db.transaction(async (tx) => {
    const [tenant] = await tx
      .insert(schema.tenants)
      .values({
        name: tenantName,
        slug: slugify(tenantName) + "-" + randomUUID().slice(0, 8),
      })
      .returning();

    if (!tenant) throw new Error("Failed to create tenant");

    const [user] = await tx
      .insert(schema.users)
      .values({
        tenantId: tenant.id,
        email,
        passwordHash,
        name,
        provider: "local",
      })
      .returning();

    if (!user) throw new Error("Failed to create user");

    await tx.insert(schema.memberships).values({
      tenantId: tenant.id,
      userId: user.id,
      role: "owner",
    });

    return { tenant, user };
  });

  const accessToken = await signAccessToken({
    sub: result.user.id,
    tenantId: result.tenant.id,
    email: result.user.email,
    role: "owner",
  });

  const refreshToken = await signRefreshToken({
    sub: result.user.id,
    tenantId: result.tenant.id,
    jti: randomUUID(),
  });

  setRefreshCookie(c, refreshToken);

  return c.json(
    {
      accessToken,
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
        role: "owner",
      },
    },
    201,
  );
});

// ---------------------------------------------------------------------------
// POST /auth/login
// ---------------------------------------------------------------------------

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

authRoutes.post("/login", async (c) => {
  const ip =
    c.req.header("X-Forwarded-For") ??
    c.req.header("CF-Connecting-IP") ??
    "unknown";

  // Check failed login rate limit before processing
  try {
    await checkFailedLoginLimit(ip);
  } catch (err) {
    return c.json(toSafeError(err), 429);
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(toSafeError(new BadRequestError("Invalid JSON body")), 400);
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      toSafeError(new ValidationError("Validation failed", parsed.error.flatten())),
      422,
    );
  }

  const { email, password } = parsed.data;

  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);

  const invalidCredentials = new UnauthorizedError("Invalid email or password");

  if (!user || !user.passwordHash) {
    return c.json(toSafeError(invalidCredentials), 401);
  }

  const passwordValid = await verifyPassword(password, user.passwordHash);
  if (!passwordValid) {
    return c.json(toSafeError(invalidCredentials), 401);
  }

  // Look up membership to get the role
  const [membership] = await db
    .select()
    .from(schema.memberships)
    .where(
      and(
        eq(schema.memberships.userId, user.id),
        eq(schema.memberships.tenantId, user.tenantId),
      ),
    )
    .limit(1);

  const role = membership?.role ?? "viewer";

  // Successful login — reset the failed attempt counter
  await resetFailedLoginLimit(ip);

  const accessToken = await signAccessToken({
    sub: user.id,
    tenantId: user.tenantId,
    email: user.email,
    role,
  });

  const refreshToken = await signRefreshToken({
    sub: user.id,
    tenantId: user.tenantId,
    jti: randomUUID(),
  });

  setRefreshCookie(c, refreshToken);

  return c.json({
    accessToken,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role,
    },
  });
});

// ---------------------------------------------------------------------------
// POST /auth/refresh
// ---------------------------------------------------------------------------

authRoutes.post("/refresh", async (c) => {
  const refreshToken = getCookie(c, "refresh_token");

  if (!refreshToken) {
    return c.json(toSafeError(new UnauthorizedError("No refresh token")), 401);
  }

  let payload;
  try {
    payload = await verifyRefreshToken(refreshToken);
  } catch {
    return c.json(toSafeError(new UnauthorizedError("Invalid or expired refresh token")), 401);
  }

  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, payload.sub))
    .limit(1);

  if (!user) {
    return c.json(toSafeError(new UnauthorizedError("User not found")), 401);
  }

  const [membership] = await db
    .select()
    .from(schema.memberships)
    .where(
      and(
        eq(schema.memberships.userId, user.id),
        eq(schema.memberships.tenantId, user.tenantId),
      ),
    )
    .limit(1);

  const role = membership?.role ?? "viewer";

  const newAccessToken = await signAccessToken({
    sub: user.id,
    tenantId: user.tenantId,
    email: user.email,
    role,
  });

  const newRefreshToken = await signRefreshToken({
    sub: user.id,
    tenantId: user.tenantId,
    jti: randomUUID(),
  });

  setRefreshCookie(c, newRefreshToken);

  return c.json({ accessToken: newAccessToken });
});

// ---------------------------------------------------------------------------
// POST /auth/logout
// ---------------------------------------------------------------------------

authRoutes.post("/logout", (c) => {
  deleteCookie(c, "refresh_token", { path: "/" });
  return c.json({ success: true });
});

// ---------------------------------------------------------------------------
// GET /auth/me
// ---------------------------------------------------------------------------

authRoutes.get("/me", authMiddleware, async (c) => {
  const userId = c.get("userId") as string;
  const tenantId = c.get("tenantId") as string;

  const [user] = await db
    .select()
    .from(schema.users)
    .where(and(eq(schema.users.id, userId), eq(schema.users.tenantId, tenantId)))
    .limit(1);

  if (!user) {
    return c.json(toSafeError(new UnauthorizedError("User not found")), 401);
  }

  const [membership] = await db
    .select()
    .from(schema.memberships)
    .where(
      and(
        eq(schema.memberships.userId, userId),
        eq(schema.memberships.tenantId, tenantId),
      ),
    )
    .limit(1);

  return c.json({
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    role: membership?.role ?? "viewer",
    tenantId: user.tenantId,
    createdAt: user.createdAt,
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setRefreshCookie(c: Parameters<typeof deleteCookie>[0], token: string): void {
  setCookie(c, "refresh_token", token, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "Lax",
    path: "/",
    maxAge: env.JWT_REFRESH_TOKEN_TTL_SECONDS,
  });
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}
