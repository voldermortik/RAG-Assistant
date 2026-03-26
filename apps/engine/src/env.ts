import { z } from "zod";

const envSchema = z.object({
  // Temporal
  TEMPORAL_ADDRESS: z.string().default("localhost:7233"),
  TEMPORAL_NAMESPACE: z.string().default("flowcore"),
  TEMPORAL_TASK_QUEUE: z.string().default("flowcore-main"),

  // Database
  DATABASE_URL: z.string().url(),

  // Redis
  REDIS_URL: z.string().url().default("redis://localhost:6379"),

  // OTEL
  OTEL_EXPORTER_OTLP_ENDPOINT: z
    .string()
    .url()
    .default("http://localhost:4318"),
  OTEL_SERVICE_NAME: z.string().default("flowcore-engine"),

  // App
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),

  // Execution limits
  MAX_WORKFLOW_EXECUTION_SECONDS: z.coerce.number().default(1800), // 30 min
  MAX_CONCURRENT_WORKFLOW_TASK_POLLERS: z.coerce.number().default(5),
  MAX_CONCURRENT_ACTIVITY_TASK_POLLERS: z.coerce.number().default(20),
});

export type Env = z.infer<typeof envSchema>;

function parseEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const formatted = result.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${formatted}`);
  }
  return result.data;
}

export const env = parseEnv();
