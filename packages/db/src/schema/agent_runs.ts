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

export const agentRuns = pgTable(
  "agent_runs",
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
    agentConfig: jsonb("agent_config").notNull(),
    status: text("status", {
      enum: ["pending", "running", "success", "error", "cancelled"],
    })
      .notNull()
      .default("pending"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    tokenCount: integer("token_count"),
    reasoningTrace: jsonb("reasoning_trace"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("agent_runs_tenant_id_idx").on(t.tenantId),
    index("agent_runs_execution_id_idx").on(t.executionId),
    index("agent_runs_workflow_id_idx").on(t.workflowId),
    index("agent_runs_status_idx").on(t.status),
  ],
);

export type AgentRun = typeof agentRuns.$inferSelect;
export type NewAgentRun = typeof agentRuns.$inferInsert;
