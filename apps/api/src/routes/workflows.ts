/**
 * Workflow CRUD routes
 *
 * GET    /workflows                        — list workflows for tenant
 * POST   /workflows                        — create workflow
 * GET    /workflows/:id                    — get workflow by id
 * PUT    /workflows/:id                    — update workflow
 * DELETE /workflows/:id                    — delete workflow
 * POST   /workflows/:id/activate           — set isActive = true
 * POST   /workflows/:id/deactivate         — set isActive = false
 */
import { Hono } from "hono";
import { eq, and, desc, like, count } from "drizzle-orm";
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

export const workflowRoutes = new Hono();

// All workflow routes require authentication
workflowRoutes.use("*", authMiddleware, tenantMiddleware);

// ---------------------------------------------------------------------------
// GET /workflows
// ---------------------------------------------------------------------------

workflowRoutes.get("/", async (c) => {
  const tenantId = c.get("tenantId") as string;
  const page = Math.max(1, Number(c.req.query("page") ?? "1"));
  const pageSize = Math.min(100, Math.max(1, Number(c.req.query("pageSize") ?? "20")));
  const search = c.req.query("search");
  const isActiveFilter = c.req.query("isActive");

  const offset = (page - 1) * pageSize;

  const conditions = [eq(schema.workflows.tenantId, tenantId)];

  if (search) {
    conditions.push(like(schema.workflows.name, `%${search}%`));
  }
  if (isActiveFilter !== undefined) {
    conditions.push(eq(schema.workflows.isActive, isActiveFilter === "true"));
  }

  const whereClause = and(...conditions);

  const [rows, totalRows] = await Promise.all([
    db
      .select()
      .from(schema.workflows)
      .where(whereClause)
      .orderBy(desc(schema.workflows.createdAt))
      .limit(pageSize)
      .offset(offset),
    db
      .select({ count: count() })
      .from(schema.workflows)
      .where(whereClause),
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
// POST /workflows
// ---------------------------------------------------------------------------

const createWorkflowSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  description: z.string().optional(),
  triggerType: z
    .enum(["webhook", "schedule", "manual", "event"])
    .optional()
    .default("manual"),
  definition: z.record(z.unknown()).optional().default({}),
});

workflowRoutes.post("/", async (c) => {
  const tenantId = c.get("tenantId") as string;
  const userId = c.get("userId") as string;

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(toSafeError(new BadRequestError("Invalid JSON body")), 400);
  }

  const parsed = createWorkflowSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      toSafeError(new ValidationError("Validation failed", parsed.error.flatten())),
      422,
    );
  }

  const [workflow] = await db
    .insert(schema.workflows)
    .values({
      tenantId,
      createdBy: userId,
      name: parsed.data.name,
      description: parsed.data.description,
      triggerType: parsed.data.triggerType,
      definition: parsed.data.definition,
    })
    .returning();

  return c.json(workflow, 201);
});

// ---------------------------------------------------------------------------
// GET /workflows/:id
// ---------------------------------------------------------------------------

workflowRoutes.get("/:id", async (c) => {
  const tenantId = c.get("tenantId") as string;
  const id = c.req.param("id");

  const [workflow] = await db
    .select()
    .from(schema.workflows)
    .where(and(eq(schema.workflows.id, id), eq(schema.workflows.tenantId, tenantId)))
    .limit(1);

  if (!workflow) {
    return c.json(toSafeError(new NotFoundError("Workflow")), 404);
  }

  return c.json(workflow);
});

// ---------------------------------------------------------------------------
// PUT /workflows/:id
// ---------------------------------------------------------------------------

const updateWorkflowSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional().nullable(),
  definition: z.record(z.unknown()).optional(),
  triggerType: z.enum(["webhook", "schedule", "manual", "event"]).optional(),
});

workflowRoutes.put("/:id", async (c) => {
  const tenantId = c.get("tenantId") as string;
  const id = c.req.param("id");

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(toSafeError(new BadRequestError("Invalid JSON body")), 400);
  }

  const parsed = updateWorkflowSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      toSafeError(new ValidationError("Validation failed", parsed.error.flatten())),
      422,
    );
  }

  const [existing] = await db
    .select({ id: schema.workflows.id })
    .from(schema.workflows)
    .where(and(eq(schema.workflows.id, id), eq(schema.workflows.tenantId, tenantId)))
    .limit(1);

  if (!existing) {
    return c.json(toSafeError(new NotFoundError("Workflow")), 404);
  }

  const [updated] = await db
    .update(schema.workflows)
    .set({
      ...parsed.data,
      updatedAt: new Date(),
    })
    .where(and(eq(schema.workflows.id, id), eq(schema.workflows.tenantId, tenantId)))
    .returning();

  return c.json(updated);
});

// ---------------------------------------------------------------------------
// DELETE /workflows/:id
// ---------------------------------------------------------------------------

workflowRoutes.delete("/:id", async (c) => {
  const tenantId = c.get("tenantId") as string;
  const id = c.req.param("id");

  const [existing] = await db
    .select({ id: schema.workflows.id })
    .from(schema.workflows)
    .where(and(eq(schema.workflows.id, id), eq(schema.workflows.tenantId, tenantId)))
    .limit(1);

  if (!existing) {
    return c.json(toSafeError(new NotFoundError("Workflow")), 404);
  }

  await db
    .delete(schema.workflows)
    .where(and(eq(schema.workflows.id, id), eq(schema.workflows.tenantId, tenantId)));

  return c.body(null, 204);
});

// ---------------------------------------------------------------------------
// POST /workflows/:id/activate
// ---------------------------------------------------------------------------

workflowRoutes.post("/:id/activate", async (c) => {
  const tenantId = c.get("tenantId") as string;
  const id = c.req.param("id");

  const [existing] = await db
    .select({ id: schema.workflows.id })
    .from(schema.workflows)
    .where(and(eq(schema.workflows.id, id), eq(schema.workflows.tenantId, tenantId)))
    .limit(1);

  if (!existing) {
    return c.json(toSafeError(new NotFoundError("Workflow")), 404);
  }

  const [updated] = await db
    .update(schema.workflows)
    .set({ isActive: true, updatedAt: new Date() })
    .where(and(eq(schema.workflows.id, id), eq(schema.workflows.tenantId, tenantId)))
    .returning();

  return c.json(updated);
});

// ---------------------------------------------------------------------------
// POST /workflows/:id/deactivate
// ---------------------------------------------------------------------------

workflowRoutes.post("/:id/deactivate", async (c) => {
  const tenantId = c.get("tenantId") as string;
  const id = c.req.param("id");

  const [existing] = await db
    .select({ id: schema.workflows.id })
    .from(schema.workflows)
    .where(and(eq(schema.workflows.id, id), eq(schema.workflows.tenantId, tenantId)))
    .limit(1);

  if (!existing) {
    return c.json(toSafeError(new NotFoundError("Workflow")), 404);
  }

  const [updated] = await db
    .update(schema.workflows)
    .set({ isActive: false, updatedAt: new Date() })
    .where(and(eq(schema.workflows.id, id), eq(schema.workflows.tenantId, tenantId)))
    .returning();

  return c.json(updated);
});
