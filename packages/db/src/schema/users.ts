import {
  pgTable,
  uuid,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants.js";

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    passwordHash: text("password_hash"),
    name: text("name").notNull(),
    avatarUrl: text("avatar_url"),
    provider: text("provider", {
      enum: ["local", "google", "github", "microsoft"],
    })
      .notNull()
      .default("local"),
    providerId: text("provider_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("users_tenant_id_idx").on(t.tenantId),
    index("users_email_tenant_idx").on(t.email, t.tenantId),
    index("users_provider_idx").on(t.provider, t.providerId),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
