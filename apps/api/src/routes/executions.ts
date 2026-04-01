/**
 * Execution read-only routes
 *
 * GET /executions             — list executions for tenant
 * GET /executions/:id         — get execution by id
 * GET /executions/:id/steps   — get execution steps
 */
import { Hono } from "hono";
import { eq, and, desc, count } from "drizzle-orm";
import { db, schema } from "../lib/db.js";
import { authMiddleware } from "../middleware/auth.js";
import { tenantMiddleware } from "../middleware/tenant.js";
import { NotFoundError, toSafeError } from "../lib/errors.js";

export const executionRoutes = new Hono();

// All execution routes require authentication
executionRoutes.use("*", authMiddleware, tenantMiddleware);

// ---------------------------------------------------------------------------
// GET /executions
// ---------------------------------------------------------------------------

executionRoutes.get("/", async (c) => {
  const tenantId = c.get("tenantId") as string;
  const page = Math.max(1, Number(c.req.query("page") ?? "1"));
  const pageSize = Math.min(100, Math.max(1, Number(c.req.query("pageSize") ?? "20")));
  const workflowId = c.req.query("workflowId");
  const status = c.req.query("status") as string | undefined;
  const offset = (page - 1) * pageSize;

  const conditions: ReturnType<typeof eq>[] = [eq(schema.executions.tenantId, tenantId)];

  if (workflowId) {
    conditions.push(eq(schema.executions.workflowId, workflowId));
  }
  if (status) {
    conditions.push(
      eq(
        schema.executions.status,
        status as "pending" | "running" | "success" | "error" | "cancelled",
      ),
    );
  }

  const whereClause = and(...conditions);

  const [rows, totalRows] = await Promise.all([
    db
      .select()
      .from(schema.executions)
      .where(whereClause)
      .orderBy(desc(schema.executions.createdAt))
      .limit(pageSize)
      .offset(offset),
    db.select({ count: count() }).from(schema.executions).where(whereClause),
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
// GET /executions/:id
// ---------------------------------------------------------------------------

executionRoutes.get("/:id", async (c) => {
  const tenantId = c.get("tenantId") as string;
  const id = c.req.param("id");

  const [execution] = await db
    .select()
    .from(schema.executions)
    .where(and(eq(schema.executions.id, id), eq(schema.executions.tenantId, tenantId)))
    .limit(1);

  if (!execution) {
    return c.json(toSafeError(new NotFoundError("Execution")), 404);
  }

  return c.json(execution);
});

// ---------------------------------------------------------------------------
// GET /executions/:id/steps
// ---------------------------------------------------------------------------

executionRoutes.get("/:id/steps", async (c) => {
  const tenantId = c.get("tenantId") as string;
  const id = c.req.param("id");

  // Verify execution belongs to tenant
  const [execution] = await db
    .select({ id: schema.executions.id })
    .from(schema.executions)
    .where(and(eq(schema.executions.id, id), eq(schema.executions.tenantId, tenantId)))
    .limit(1);

  if (!execution) {
    return c.json(toSafeError(new NotFoundError("Execution")), 404);
  }

  const steps = await db
    .select()
    .from(schema.executionSteps)
    .where(
      and(
        eq(schema.executionSteps.executionId, id),
        eq(schema.executionSteps.tenantId, tenantId),
      ),
    )
    .orderBy(schema.executionSteps.createdAt);

  return c.json({ data: steps, total: steps.length });
});
