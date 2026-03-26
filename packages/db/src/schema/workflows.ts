import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  boolean,
  index,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants.js";
import { users } from "./users.js";

export const workflows = pgTable(
  "workflows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    definition: jsonb("definition").notNull().default({}),
    isActive: boolean("is_active").notNull().default(false),
    triggerType: text("trigger_type", {
      enum: ["webhook", "schedule", "manual", "event"],
    })
      .notNull()
      .default("manual"),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("workflows_tenant_id_idx").on(t.tenantId),
    index("workflows_created_by_idx").on(t.createdBy),
    index("workflows_is_active_idx").on(t.isActive),
    index("workflows_trigger_type_idx").on(t.triggerType),
  ],
);

export type Workflow = typeof workflows.$inferSelect;
export type NewWorkflow = typeof workflows.$inferInsert;
