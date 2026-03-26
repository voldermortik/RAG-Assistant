import { z } from "zod";

const serverSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  NEXTAUTH_SECRET: z.string().min(1, "NEXTAUTH_SECRET is required"),
  NEXTAUTH_URL: z.string().url().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  API_URL: z
    .string()
    .url()
    .default("http://localhost:8000"),
  DATABASE_URL: z.string().optional(),
});

const clientSchema = z.object({
  NEXT_PUBLIC_API_URL: z
    .string()
    .url()
    .default("http://localhost:8000"),
  NEXT_PUBLIC_APP_URL: z
    .string()
    .url()
    .default("http://localhost:3000"),
});

const serverEnv = serverSchema.safeParse({
  NODE_ENV: process.env.NODE_ENV,
  NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
  NEXTAUTH_URL: process.env.NEXTAUTH_URL,
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  API_URL: process.env.API_URL,
  DATABASE_URL: process.env.DATABASE_URL,
});

const clientEnv = clientSchema.safeParse({
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
});

if (typeof window === "undefined") {
  if (!serverEnv.success) {
    console.error(
      "Invalid server environment variables:",
      serverEnv.error.flatten().fieldErrors
    );
    // In development, warn but don't crash
    if (process.env.NODE_ENV === "production") {
      throw new Error("Invalid server environment variables");
    }
  }
}

if (!clientEnv.success) {
  console.error(
    "Invalid client environment variables:",
    clientEnv.error.flatten().fieldErrors
  );
}

export const env = {
  ...(serverEnv.success ? serverEnv.data : ({} as z.infer<typeof serverSchema>)),
  ...(clientEnv.success ? clientEnv.data : ({} as z.infer<typeof clientSchema>)),
};
