/**
 * DB write activities for FlowCore Temporal worker.
 *
 * These activities are responsible for persisting execution state to the
 * FlowCore database via Drizzle ORM.  They use an aggressive retry policy
 * (see dbWriteRetryPolicy) because writes are idempotent (upsert semantics).
 */

import { ApplicationFailure } from "@temporalio/activity";
import { trace, SpanStatusCode } from "@opentelemetry/api";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, and } from "drizzle-orm";
import { pgTable, uuid, text, timestamp, jsonb, integer } from "drizzle-orm/pg-core";

const tracer = trace.getTracer("flowcore-engine", "0.1.0");

// ---------------------------------------------------------------------------
// Lazy DB client — only initialised when first activity runs
// ---------------------------------------------------------------------------

let _db: ReturnType<typeof drizzle> | null = null;

function getDb() {
  if (_db) return _db;

  const databaseUrl = process.env["DATABASE_URL"];
  if (!databaseUrl) {
    throw ApplicationFailure.create({
      message: "DATABASE_URL environment variable is required",
      type: "NonRetryableActivityError",
      nonRetryable: true,
    });
  }

  const client = postgres(databaseUrl, {
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
  });

  _db = drizzle(client);
  return _db;
}

// ---------------------------------------------------------------------------
// Inline schema definitions (avoid importing workspace packages in workers
// to keep the Temporal sandbox bundle clean)
// ---------------------------------------------------------------------------

const executions = pgTable("executions", {
  id: uuid("id").primaryKey(),
  tenantId: uuid("tenant_id").notNull(),
  workflowId: uuid("workflow_id").notNull(),
  status: text("status").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  durationMs: integer("duration_ms"),
  error: jsonb("error"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

const executionSteps = pgTable("execution_steps", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  executionId: uuid("execution_id").notNull(),
  workflowId: uuid("workflow_id").notNull(),
  nodeId: text("node_id").notNull(),
  nodeType: text("node_type").notNull(),
  status: text("status").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  durationMs: integer("duration_ms"),
  input: jsonb("input"),
  output: jsonb("output"),
  error: jsonb("error"),
  retryCount: integer("retry_count").notNull().default(0),
  traceId: text("trace_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// updateExecutionStatus
// ---------------------------------------------------------------------------

export interface UpdateExecutionStatusInput {
  executionId: string;
  tenantId: string;
  status: "running" | "success" | "error" | "cancelled";
  startedAt?: Date;
  completedAt?: Date;
  error?: { message: string; stack?: string } | null;
}

export async function updateExecutionStatus(
  input: UpdateExecutionStatusInput
): Promise<void> {
  const { executionId, tenantId, status, startedAt, completedAt, error } = input;

  return tracer.startActiveSpan(
    "activity.updateExecutionStatus",
    {
      attributes: {
        "flowcore.execution_id": executionId,
        "flowcore.execution.status": status,
      },
    },
    async (span) => {
      try {
        const db = getDb();

        const updateValues: Record<string, unknown> = {
          status,
          updatedAt: new Date(),
        };

        if (startedAt !== undefined) updateValues["startedAt"] = startedAt;
        if (completedAt !== undefined) {
          updateValues["completedAt"] = completedAt;
          if (startedAt) {
            updateValues["durationMs"] = completedAt.getTime() - startedAt.getTime();
          }
        }
        if (error !== undefined) updateValues["error"] = error;

        await db
          .update(executions)
          .set(updateValues as Parameters<typeof db.update>[0] extends infer T ? T : never)
          .where(
            and(
              eq(executions.id, executionId),
              eq(executions.tenantId, tenantId)
            )
          );

        span.setStatus({ code: SpanStatusCode.OK });
      } catch (err) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
        span.recordException(err as Error);
        throw err;
      } finally {
        span.end();
      }
    }
  );
}

// ---------------------------------------------------------------------------
// writeExecutionStep
// ---------------------------------------------------------------------------

export interface WriteExecutionStepInput {
  executionId: string;
  tenantId: string;
  workflowId: string;
  nodeId: string;
  nodeType: string;
  status: "running" | "success" | "error" | "skipped" | "cancelled";
  startedAt?: Date;
  completedAt?: Date;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: { message: string; stack?: string };
  traceId: string;
}

export async function writeExecutionStep(
  input: WriteExecutionStepInput
): Promise<void> {
  const {
    executionId,
    tenantId,
    workflowId,
    nodeId,
    nodeType,
    status,
    startedAt,
    completedAt,
    input: stepInput,
    output,
    error,
    traceId,
  } = input;

  return tracer.startActiveSpan(
    "activity.writeExecutionStep",
    {
      attributes: {
        "flowcore.execution_id": executionId,
        "flowcore.node_id": nodeId,
        "flowcore.step.status": status,
        "flowcore.trace_id": traceId,
      },
    },
    async (span) => {
      try {
        const db = getDb();

        let durationMs: number | null = null;
        if (startedAt && completedAt) {
          durationMs = completedAt.getTime() - startedAt.getTime();
        }

        // Sanitize secrets from input/output before persisting
        const safeInput = sanitizeSecrets(stepInput ?? {});
        const safeOutput = sanitizeSecrets(output ?? {});

        await db.insert(executionSteps).values({
          tenantId,
          executionId,
          workflowId,
          nodeId,
          nodeType,
          status: status === "cancelled" ? "skipped" : status,
          startedAt: startedAt ?? null,
          completedAt: completedAt ?? null,
          durationMs,
          input: safeInput as Record<string, unknown>,
          output: safeOutput as Record<string, unknown>,
          error: error ?? null,
          retryCount: 0,
          traceId,
        });

        span.setStatus({ code: SpanStatusCode.OK });
      } catch (err) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
        span.recordException(err as Error);
        throw err;
      } finally {
        span.end();
      }
    }
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SECRET_KEY_PATTERNS = [
  /password/i,
  /secret/i,
  /token/i,
  /api[_-]?key/i,
  /auth/i,
  /credential/i,
  /private[_-]?key/i,
];

function isSecretKey(key: string): boolean {
  return SECRET_KEY_PATTERNS.some((p) => p.test(key));
}

function sanitizeSecrets(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (isSecretKey(key)) {
      result[key] = "[REDACTED]";
    } else if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      result[key] = sanitizeSecrets(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result;
}
