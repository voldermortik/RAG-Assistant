import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  // Database
  DATABASE_URL: z.string().url(),

  // Redis
  REDIS_URL: z.string().url().default("redis://localhost:6379"),

  // HashiCorp Vault
  VAULT_ADDR: z.string().url().default("http://localhost:8200"),
  VAULT_TOKEN: z.string().optional(),
  VAULT_ROLE_ID: z.string().optional(),
  VAULT_SECRET_ID: z.string().optional(),

  // Temporal (informational — used by orchestrator, but worker may need it for context)
  TEMPORAL_ADDRESS: z.string().default("localhost:7233"),

  // BullMQ
  EXECUTION_QUEUE_NAME: z.string().default("workflow:execute"),
  WEBHOOK_QUEUE_NAME: z.string().default("workflow:webhook"),
  WORKER_CONCURRENCY: z.coerce.number().default(10),

  // Quota
  QUOTA_DEFAULT_MONTHLY_EXECUTIONS: z.coerce.number().default(10000),

  // Logging
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),

  // OTEL
  OTEL_SERVICE_NAME: z.string().default("flowcore-worker"),
  OTEL_EXPORTER_OTLP_ENDPOINT: z
    .string()
    .url()
    .optional(),
});

export type Env = z.infer<typeof envSchema>;

function parseEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const formatted = result.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    console.error(`[env] Invalid environment configuration:\n${formatted}`);
    process.exit(1);
  }
  return result.data;
}

export const env = parseEnv();
