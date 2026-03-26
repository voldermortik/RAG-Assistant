import type { RetryPolicy } from "@temporalio/common";

/**
 * Default retry policy for all FlowCore activities.
 * - 3 maximum attempts
 * - Initial interval: 1 second
 * - Backoff coefficient: 2.0 (exponential)
 * - Max interval: 30 seconds
 * - Non-retryable errors: ApplicationError with retryable=false
 */
export const defaultRetryPolicy: RetryPolicy = {
  maximumAttempts: 3,
  initialInterval: "1s",
  backoffCoefficient: 2.0,
  maximumInterval: "30s",
  nonRetryableErrorTypes: ["NonRetryableActivityError"],
};

/**
 * Aggressive retry policy for critical DB write activities.
 * Allows more attempts with a shorter backoff for idempotent writes.
 */
export const dbWriteRetryPolicy: RetryPolicy = {
  maximumAttempts: 5,
  initialInterval: "500ms",
  backoffCoefficient: 1.5,
  maximumInterval: "10s",
  nonRetryableErrorTypes: [],
};

/**
 * No-retry policy for activities that must not be retried
 * (e.g., external side-effectful operations that are not idempotent).
 */
export const noRetryPolicy: RetryPolicy = {
  maximumAttempts: 1,
  nonRetryableErrorTypes: [],
};

/**
 * Retry policy for code execution activities (short timeout, few retries).
 */
export const codeExecutionRetryPolicy: RetryPolicy = {
  maximumAttempts: 2,
  initialInterval: "1s",
  backoffCoefficient: 2.0,
  maximumInterval: "5s",
  nonRetryableErrorTypes: ["SyntaxError", "NonRetryableActivityError"],
};
