import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  integer,
  index,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants.js";
import { executions } from "./executions.js";
import { workflows } from "./workflows.js";

export const executionSteps = pgTable(
  "execution_steps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    executionId: uuid("execution_id")
      .notNull()
      .references(() => executions.id, { onDelete: "cascade" }),
    workflowId: uuid("workflow_id")
      .notNull()
      .references(() => workflows.id, { onDelete: "cascade" }),
    nodeId: text("node_id").notNull(),
    nodeType: text("node_type").notNull(),
    status: text("status", {
      enum: ["pending", "running", "success", "error", "skipped"],
    })
      .notNull()
      .default("pending"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    durationMs: integer("duration_ms"),
    input: jsonb("input"),
    output: jsonb("output"),
    error: jsonb("error"),
    retryCount: integer("retry_count").notNull().default(0),
    traceId: text("trace_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("execution_steps_tenant_id_idx").on(t.tenantId),
    index("execution_steps_execution_id_idx").on(t.executionId),
    index("execution_steps_workflow_id_idx").on(t.workflowId),
    index("execution_steps_node_id_idx").on(t.nodeId),
    index("execution_steps_trace_id_idx").on(t.traceId),
  ],
);

export type ExecutionStep = typeof executionSteps.$inferSelect;
export type NewExecutionStep = typeof executionSteps.$inferInsert;
