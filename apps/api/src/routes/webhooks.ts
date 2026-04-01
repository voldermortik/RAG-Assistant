/**
 * Webhook trigger route
 *
 * POST /webhooks/:workflowId/trigger
 *   1. Verify X-FlowCore-Signature header (HMAC-SHA256 of body with workflow secret)
 *   2. Check X-Idempotency-Key header against Redis (24h TTL)
 *   3. Validate payload size < 1MB
 *   4. Enqueue to BullMQ queue "workflow:execute"
 *   5. Return 202 Accepted
 */
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db, schema } from "../lib/db.js";
import { verifyWebhookSignature, SIGNATURE_HEADER } from "../lib/webhook.js";
import { checkIdempotency, setIdempotencyResponse } from "../lib/idempotency.js";
import { enqueueExecution } from "../lib/queue.js";
import { webhookRateLimit } from "../middleware/rateLimit.js";
import {
  NotFoundError,
  InvalidSignatureError,
  PayloadTooLargeError,
  IdempotencyConflictError,
  toSafeError,
} from "../lib/errors.js";
import { env } from "../env.js";

export const webhookRoutes = new Hono();

// Apply webhook-specific rate limiting
webhookRoutes.use("/:workflowId/trigger", webhookRateLimit);

// ---------------------------------------------------------------------------
// POST /webhooks/:workflowId/trigger
// ---------------------------------------------------------------------------

webhookRoutes.post("/:workflowId/trigger", async (c) => {
  const workflowId = c.req.param("workflowId");

  // Fetch workflow (need tenantId and webhook secret from definition)
  const [workflow] = await db
    .select()
    .from(schema.workflows)
    .where(eq(schema.workflows.id, workflowId))
    .limit(1);

  if (!workflow) {
    return c.json(toSafeError(new NotFoundError("Workflow")), 404);
  }

  // Only webhook-triggered workflows can be triggered this way
  if (workflow.triggerType !== "webhook") {
    return c.json(
      toSafeError(new NotFoundError("Workflow does not accept webhook triggers")),
      404,
    );
  }

  // Store tenantId for rate limiter context
  c.set("webhookTenantId", workflow.tenantId);

  // Read raw body bytes for signature verification + size check
  const rawBody = await c.req.arrayBuffer();
  const bodyBytes = rawBody.byteLength;

  // Validate payload size < 1MB
  if (bodyBytes > env.MAX_PAYLOAD_SIZE_BYTES) {
    return c.json(toSafeError(new PayloadTooLargeError(env.MAX_PAYLOAD_SIZE_BYTES)), 413);
  }

  const rawBodyStr = new TextDecoder().decode(rawBody);

  // Extract webhook secret from workflow definition
  const definition = workflow.definition as Record<string, unknown>;
  const webhookSecret = (definition["webhookSecret"] as string | undefined) ?? "";

  // Verify HMAC-SHA256 signature
  const signature = c.req.header(SIGNATURE_HEADER);
  if (!verifyWebhookSignature(rawBodyStr, signature, webhookSecret)) {
    return c.json(toSafeError(new InvalidSignatureError()), 401);
  }

  // Check idempotency key
  const idempotencyKey = c.req.header("X-Idempotency-Key");
  if (idempotencyKey) {
    const idempotencyResult = await checkIdempotency(idempotencyKey, workflow.tenantId);
    if (idempotencyResult.isDuplicate) {
      // Return the cached response with 202
      const cached = idempotencyResult.cachedResponse ?? {
        accepted: true,
        message: "Duplicate request — already processing",
      };
      return c.json(cached, 202);
    }
  }

  // Parse payload for job data
  let triggerPayload: Record<string, unknown> = {};
  if (rawBodyStr.trim()) {
    try {
      triggerPayload = JSON.parse(rawBodyStr) as Record<string, unknown>;
    } catch {
      // Non-JSON payload — wrap it
      triggerPayload = { raw: rawBodyStr };
    }
  }

  // Enqueue the execution
  const executionId = randomUUID();
  const jobId = await enqueueExecution({
    executionId,
    workflowId: workflow.id,
    tenantId: workflow.tenantId,
    triggerType: "webhook",
    triggerPayload,
    ...(idempotencyKey ? { idempotencyKey } : {}),
  });

  const responseBody = {
    accepted: true,
    executionId,
    jobId,
  };

  // Store idempotency response for 24h
  if (idempotencyKey) {
    await setIdempotencyResponse(idempotencyKey, workflow.tenantId, responseBody);
  }

  return c.json(responseBody, 202);
});
