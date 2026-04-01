// ---------------------------------------------------------------------------
// Connector error types
// ---------------------------------------------------------------------------

export type ConnectorErrorCode =
  | "AUTH_FAILED"
  | "AUTH_EXPIRED"
  | "AUTH_REFRESH_FAILED"
  | "INVALID_CREDENTIALS"
  | "INVALID_INPUT"
  | "INVALID_OUTPUT"
  | "HTTP_ERROR"
  | "HTTP_TIMEOUT"
  | "RATE_LIMITED"
  | "NOT_FOUND"
  | "PERMISSION_DENIED"
  | "CONFLICT"
  | "NETWORK_ERROR"
  | "PARSE_ERROR"
  | "SCHEMA_VALIDATION_FAILED"
  | "CONNECTOR_NOT_FOUND"
  | "ACTION_NOT_FOUND"
  | "TRIGGER_NOT_FOUND"
  | "INTERNAL_ERROR";

export interface ConnectorErrorOptions {
  code: ConnectorErrorCode;
  message: string;
  cause?: unknown;
  /** Raw HTTP status code if the error originated from an HTTP call */
  httpStatus?: number;
  /** The response body from the upstream API, if available */
  responseBody?: unknown;
  /** Whether the error is retryable */
  retryable?: boolean;
  /** Suggested retry-after delay in milliseconds */
  retryAfterMs?: number;
}

/**
 * Base error class for all connector-originated errors.
 * Instances of this class are caught by the FlowCore execution engine and
 * mapped to structured ExecutionStep error records.
 */
export class ConnectorError extends Error {
  readonly code: ConnectorErrorCode;
  readonly httpStatus: number | undefined;
  readonly responseBody: unknown;
  readonly retryable: boolean;
  readonly retryAfterMs: number | undefined;
  override readonly cause: unknown;

  constructor(options: ConnectorErrorOptions) {
    super(options.message);
    this.name = "ConnectorError";
    this.code = options.code;
    this.httpStatus = options.httpStatus;
    this.responseBody = options.responseBody;
    this.retryable = options.retryable ?? false;
    this.retryAfterMs = options.retryAfterMs;
    this.cause = options.cause;

    // Restore prototype chain (required when extending built-in Error in TS)
    Object.setPrototypeOf(this, new.target.prototype);
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      httpStatus: this.httpStatus,
      retryable: this.retryable,
      retryAfterMs: this.retryAfterMs,
    };
  }
}

// ---------------------------------------------------------------------------
// Convenience factory helpers
// ---------------------------------------------------------------------------

export function authFailedError(message: string, cause?: unknown): ConnectorError {
  return new ConnectorError({ code: "AUTH_FAILED", message, cause, retryable: false });
}

export function authExpiredError(message = "Access token has expired"): ConnectorError {
  return new ConnectorError({ code: "AUTH_EXPIRED", message, retryable: true });
}

export function rateLimitedError(retryAfterMs?: number): ConnectorError {
  return new ConnectorError({
    code: "RATE_LIMITED",
    message: "Rate limit exceeded",
    retryable: true,
    retryAfterMs,
  });
}

export function httpError(
  httpStatus: number,
  message: string,
  responseBody?: unknown,
): ConnectorError {
  const retryable = httpStatus >= 500 || httpStatus === 429;
  return new ConnectorError({
    code: "HTTP_ERROR",
    message,
    httpStatus,
    responseBody,
    retryable,
  });
}

export function validationError(message: string, cause?: unknown): ConnectorError {
  return new ConnectorError({
    code: "SCHEMA_VALIDATION_FAILED",
    message,
    cause,
    retryable: false,
  });
}

export function networkError(message: string, cause?: unknown): ConnectorError {
  return new ConnectorError({ code: "NETWORK_ERROR", message, cause, retryable: true });
}

export function parseError(message: string, cause?: unknown): ConnectorError {
  return new ConnectorError({ code: "PARSE_ERROR", message, cause, retryable: false });
}
