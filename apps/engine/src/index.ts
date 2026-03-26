import { createWorker } from "./worker";
import { env } from "./env";

async function main() {
  console.log(
    `[engine] Starting FlowCore Temporal worker — namespace=${env.TEMPORAL_NAMESPACE} taskQueue=${env.TEMPORAL_TASK_QUEUE}`
  );

  const worker = await createWorker();

  // Graceful shutdown
  process.on("SIGINT", () => {
    console.log("[engine] Received SIGINT, shutting down...");
    worker.shutdown();
  });

  process.on("SIGTERM", () => {
    console.log("[engine] Received SIGTERM, shutting down...");
    worker.shutdown();
  });

  await worker.run();
  console.log("[engine] Worker stopped.");
}

main().catch((err) => {
  console.error("[engine] Fatal error:", err);
  process.exit(1);
});
