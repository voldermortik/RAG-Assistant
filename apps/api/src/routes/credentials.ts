/**
 * Credential management routes
 *
 * GET    /credentials         — list credentials for tenant
 * POST   /credentials         — create credential
 * DELETE /credentials/:id     — delete credential
 */
import { Hono } from "hono";
import { eq, and, desc, count } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "../lib/db.js";
import { authMiddleware } from "../middleware/auth.js";
import { tenantMiddleware } from "../middleware/tenant.js";
import {
  NotFoundError,
  ValidationError,
  BadRequestError,
  toSafeError,
} from "../lib/errors.js";

export const credentialRoutes = new Hono();

// All credential routes require authentication
credentialRoutes.use("*", authMiddleware, tenantMiddleware);

// ---------------------------------------------------------------------------
// GET /credentials
// ---------------------------------------------------------------------------

credentialRoutes.get("/", async (c) => {
  const tenantId = c.get("tenantId") as string;
  const page = Math.max(1, Number(c.req.query("page") ?? "1"));
  const pageSize = Math.min(100, Math.max(1, Number(c.req.query("pageSize") ?? "20")));
  const offset = (page - 1) * pageSize;

  const whereClause = eq(schema.credentials.tenantId, tenantId);

  const [rows, totalRows] = await Promise.all([
    db
      .select({
        id: schema.credentials.id,
        name: schema.credentials.name,
        type: schema.credentials.type,
        connectorId: schema.credentials.connectorId,
        createdBy: schema.credentials.createdBy,
        createdAt: schema.credentials.createdAt,
        updatedAt: schema.credentials.updatedAt,
      })
      .from(schema.credentials)
      .where(whereClause)
      .orderBy(desc(schema.credentials.createdAt))
      .limit(pageSize)
      .offset(offset),
    db.select({ count: count() }).from(schema.credentials).where(whereClause),
  ]);

  const total = totalRows[0]?.count ?? 0;
  const totalPages = Math.ceil(Number(total) / pageSize);

  return c.json({
    data: rows,
    total: Number(total),
    page,
    pageSize,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  });
});

// ---------------------------------------------------------------------------
// POST /credentials
// ---------------------------------------------------------------------------

const createCredentialSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  type: z.enum(["apiKey", "oauth2", "basicAuth", "none"]).default("none"),
  vaultSecretId: z.string().min(1, "Vault secret ID is required"),
  connectorId: z.string().optional(),
});

credentialRoutes.post("/", async (c) => {
  const tenantId = c.get("tenantId") as string;
  const userId = c.get("userId") as string;

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(toSafeError(new BadRequestError("Invalid JSON body")), 400);
  }

  const parsed = createCredentialSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      toSafeError(new ValidationError("Validation failed", parsed.error.flatten())),
      422,
    );
  }

  const [credential] = await db
    .insert(schema.credentials)
    .values({
      tenantId,
      createdBy: userId,
      name: parsed.data.name,
      type: parsed.data.type,
      vaultSecretId: parsed.data.vaultSecretId,
      connectorId: parsed.data.connectorId,
    })
    .returning({
      id: schema.credentials.id,
      name: schema.credentials.name,
      type: schema.credentials.type,
      connectorId: schema.credentials.connectorId,
      createdBy: schema.credentials.createdBy,
      createdAt: schema.credentials.createdAt,
      updatedAt: schema.credentials.updatedAt,
    });

  return c.json(credential, 201);
});

// ---------------------------------------------------------------------------
// DELETE /credentials/:id
// ---------------------------------------------------------------------------

credentialRoutes.delete("/:id", async (c) => {
  const tenantId = c.get("tenantId") as string;
  const id = c.req.param("id");

  const [existing] = await db
    .select({ id: schema.credentials.id })
    .from(schema.credentials)
    .where(and(eq(schema.credentials.id, id), eq(schema.credentials.tenantId, tenantId)))
    .limit(1);

  if (!existing) {
    return c.json(toSafeError(new NotFoundError("Credential")), 404);
  }

  await db
    .delete(schema.credentials)
    .where(and(eq(schema.credentials.id, id), eq(schema.credentials.tenantId, tenantId)));

  return c.body(null, 204);
});
