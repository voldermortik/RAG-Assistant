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

export const connectors = pgTable(
  "connectors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    connectorId: text("connector_id").notNull(),
    name: text("name").notNull(),
    version: text("version").notNull().default("1.0.0"),
    config: jsonb("config").notNull().default({}),
    isEnabled: boolean("is_enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("connectors_tenant_id_idx").on(t.tenantId),
    index("connectors_connector_id_idx").on(t.connectorId),
    index("connectors_is_enabled_idx").on(t.isEnabled),
    index("connectors_tenant_connector_idx").on(t.tenantId, t.connectorId),
  ],
);

export type Connector = typeof connectors.$inferSelect;
export type NewConnector = typeof connectors.$inferInsert;
