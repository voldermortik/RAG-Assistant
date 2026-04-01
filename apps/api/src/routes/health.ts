/**
 * Health check route — GET /health
 * Returns service status, version, uptime, and timestamp.
 */
import { Hono } from "hono";

const startTime = Date.now();

export const healthRoutes = new Hono();

healthRoutes.get("/", (c) => {
  return c.json({
    status: "ok",
    version: process.env["npm_package_version"] ?? "0.1.0",
    uptime: Math.floor((Date.now() - startTime) / 1000),
    timestamp: new Date().toISOString(),
  });
});
