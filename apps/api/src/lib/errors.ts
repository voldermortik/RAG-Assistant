/**
 * Typed error classes for FlowCore API.
 * Stack traces are NEVER leaked to clients.
 */

export type ErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "VALIDATION_ERROR"
  | "RATE_LIMITED"
  | "PAYLOAD_TOO_LARGE"
  | "IDEMPOTENCY_CONFLICT"
  | "QUOTA_EXCEEDED"
  | "INTERNAL_ERROR"
  | "BAD_REQUEST"
  | "INVALID_SIGNATURE";

export interface ApiErrorResponse {
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
  };
}

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: ErrorCode;
  public readonly details?: unknown;

  constructor(
    message: string,
    statusCode: number,
    code: ErrorCode,
    details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    // Do not capture full stack trace in production
    if (process.env["NODE_ENV"] !== "production") {
      Error.captureStackTrace(this, AppError);
    }
  }

  toJSON(): ApiErrorResponse {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details !== undefined ? { details: this.details } : {}),
      },
    };
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized") {
    super(message, 401, "UNAUTHORIZED");
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden") {
    super(message, 403, "FORBIDDEN");
  }
}

export class NotFoundError extends AppError {
  constructor(resource = "Resource") {
    super(`${resource} not found`, 404, "NOT_FOUND");
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, "CONFLICT");
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 422, "VALIDATION_ERROR", details);
  }
}

export class RateLimitError extends AppError {
  constructor(message = "Too many requests") {
    super(message, 429, "RATE_LIMITED");
  }
}

export class PayloadTooLargeError extends AppError {
  constructor(maxBytes: number) {
    super(
      `Payload exceeds maximum size of ${maxBytes} bytes`,
      413,
      "PAYLOAD_TOO_LARGE",
    );
  }
}

export class IdempotencyConflictError extends AppError {
  constructor() {
    super(
      "A request with this idempotency key is already processing",
      409,
      "IDEMPOTENCY_CONFLICT",
    );
  }
}

export class QuotaExceededError extends AppError {
  constructor() {
    super("Monthly execution quota exceeded", 429, "QUOTA_EXCEEDED");
  }
}

export class InvalidSignatureError extends AppError {
  constructor() {
    super("Invalid webhook signature", 401, "INVALID_SIGNATURE");
  }
}

export class BadRequestError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 400, "BAD_REQUEST", details);
  }
}

/**
 * Converts any thrown error into a safe client response.
 * Never leaks internal stack traces.
 */
export function toSafeError(err: unknown): ApiErrorResponse {
  if (err instanceof AppError) {
    return err.toJSON();
  }
  // Generic server error — do not expose internals
  return {
    error: {
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred",
    },
  };
}
