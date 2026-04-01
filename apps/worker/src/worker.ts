import { Worker, type Job } from "bullmq";
import { env } from "./env";
import { getBullMQRedis } from "./lib/redis";
import { logger } from "./lib/logger";
import { processExecution } from "./processors/execution";
import { processWebhook } from "./processors/webhook";

export interface ExecutionJobData {
  workflowId: string;
  executionId: string;
  tenantId: string;
  definition: WorkflowDefinition;
  triggerPayload: Record<string, unknown>;
}

export interface WebhookJobData {
  tenantId: string;
  workflowId: string;
  webhookId: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
  query: Record<string, string>;
}

export interface WorkflowNode {
  id: string;
  type: string;
  config: Record<string, unknown>;
  // Optional next-node references for conditional branching
  nextOnSuccess?: string;
  nextOnFailure?: string;
}

export interface WorkflowDefinition {
  nodes: WorkflowNode[];
  edges?: Array<{ source: string; target: string; condition?: string }>;
}

type AllJobData = ExecutionJobData | WebhookJobData;

export function createExecutionWorker(): Worker<AllJobData> {
  const connection = getBullMQRedis();

  const worker = new Worker<AllJobData>(
    env.EXECUTION_QUEUE_NAME,
    async (job: Job<AllJobData>) => {
      const jobLogger = logger.child({
        jobId: job.id,
        jobName: job.name,
        attemptsMade: job.attemptsMade,
      });

      jobLogger.info(`[worker] Processing job: ${job.name}`);

      try {
        if (job.name === "workflow:execute") {
          await processExecution(job as Job<ExecutionJobData>, jobLogger);
        } else if (job.name === "workflow:webhook") {
          await processWebhook(job as Job<WebhookJobData>, jobLogger);
        } else {
          jobLogger.warn(`[worker] Unknown job name: ${job.name} — skipping`);
        }
      } catch (err) {
        jobLogger.error(`[worker] Job failed`, {
          error: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
        });
        throw err; // Re-throw so BullMQ handles retry
      }
    },
    {
      connection,
      concurrency: env.WORKER_CONCURRENCY,
      // Default job options applied to all jobs processed by this worker
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 1000,
        },
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 200 },
      },
    },
  );

  worker.on("completed", (job) => {
    logger.info("[worker] Job completed", {
      jobId: job.id,
      jobName: job.name,
      duration: Date.now() - job.timestamp,
    });
  });

  worker.on("failed", (job, err) => {
    logger.error("[worker] Job failed permanently", {
      jobId: job?.id,
      jobName: job?.name,
      attemptsMade: job?.attemptsMade,
      error: err.message,
    });
  });

  worker.on("stalled", (jobId) => {
    logger.warn("[worker] Job stalled", { jobId });
  });

  worker.on("error", (err) => {
    logger.error("[worker] Worker error", { error: err.message, stack: err.stack });
  });

  logger.info("[worker] BullMQ worker started", {
    queue: env.EXECUTION_QUEUE_NAME,
    concurrency: env.WORKER_CONCURRENCY,
  });

  return worker;
}
