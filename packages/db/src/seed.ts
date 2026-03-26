/**
 * Seed script: creates a demo tenant + admin user
 * Run: pnpm db:seed
 */
import { db } from "./client.js";
import { tenants, users, memberships } from "./schema/index.js";
import { eq } from "drizzle-orm";
import { createHash } from "crypto";

// Simple password hash for demo purposes (in prod, bcrypt is used via the API)
function hashPasswordForSeed(password: string): string {
  // Using SHA-256 here only for seed data — real bcrypt hashing happens in the API
  // This ensures we don't pull bcrypt into the db package
  return `seed:${createHash("sha256").update(password).digest("hex")}`;
}

async function seed() {
  console.log("🌱 Starting database seed...");

  // Upsert demo tenant
  const existingTenants = await db
    .select()
    .from(tenants)
    .where(eq(tenants.slug, "demo"))
    .limit(1);

  let tenantId: string;

  if (existingTenants.length > 0 && existingTenants[0]) {
    tenantId = existingTenants[0].id;
    console.log(`✅ Demo tenant already exists: ${tenantId}`);
  } else {
    const [newTenant] = await db
      .insert(tenants)
      .values({
        name: "Demo Organization",
        slug: "demo",
        plan: "pro",
        executionQuota: 10000,
      })
      .returning();

    if (!newTenant) {
      throw new Error("Failed to create demo tenant");
    }

    tenantId = newTenant.id;
    console.log(`✅ Created demo tenant: ${tenantId}`);
  }

  // Upsert demo admin user
  const adminEmail = "admin@demo.flowcore.io";
  const existingUsers = await db
    .select()
    .from(users)
    .where(eq(users.email, adminEmail))
    .limit(1);

  let userId: string;

  if (existingUsers.length > 0 && existingUsers[0]) {
    userId = existingUsers[0].id;
    console.log(`✅ Demo admin user already exists: ${userId}`);
  } else {
    const [newUser] = await db
      .insert(users)
      .values({
        tenantId,
        email: adminEmail,
        passwordHash: hashPasswordForSeed("Admin1234!"),
        name: "Admin User",
        provider: "local",
      })
      .returning();

    if (!newUser) {
      throw new Error("Failed to create demo admin user");
    }

    userId = newUser.id;
    console.log(`✅ Created demo admin user: ${userId}`);
    console.log(`   Email: ${adminEmail}`);
    console.log(`   Password: Admin1234!`);
    console.log(
      `   NOTE: This seed password hash is NOT bcrypt. Re-set via the API for production.`,
    );
  }

  // Upsert membership (owner role)
  const existingMembership = await db
    .select()
    .from(memberships)
    .where(eq(memberships.userId, userId))
    .limit(1);

  if (existingMembership.length > 0) {
    console.log(`✅ Demo admin membership already exists`);
  } else {
    await db.insert(memberships).values({
      tenantId,
      userId,
      role: "owner",
    });
    console.log(`✅ Created demo admin membership with owner role`);
  }

  console.log("\n🎉 Seed complete!");
  console.log(`   Tenant ID: ${tenantId}`);
  console.log(`   User ID:   ${userId}`);
  process.exit(0);
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
