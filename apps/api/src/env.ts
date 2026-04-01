import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.coerce.number().default(3001),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_PRIVATE_KEY: z.string().min(1),
  JWT_PUBLIC_KEY: z.string().min(1),
  JWT_ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().default(900), // 15 minutes
  JWT_REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().default(604800), // 7 days
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
  WEBHOOK_RATE_LIMIT_PER_TENANT: z.coerce.number().default(100),
  MAX_PAYLOAD_SIZE_BYTES: z.coerce.number().default(1048576), // 1MB
  EXECUTION_QUEUE_NAME: z.string().default("workflow:execute"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error(
    "❌ Invalid environment variables:",
    JSON.stringify(parsed.error.flatten().fieldErrors, null, 2),
  );
  process.exit(1);
}

export const env = parsed.data;
