import { env } from "../env";

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export interface LogRecord {
  level: LogLevel;
  timestamp: string;
  message: string;
  traceId?: string;
  [key: string]: unknown;
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_RANK[level] >= LEVEL_RANK[env.LOG_LEVEL];
}

function write(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
  if (!shouldLog(level)) return;

  const record: LogRecord = {
    level,
    timestamp: new Date().toISOString(),
    service: env.OTEL_SERVICE_NAME,
    message,
    ...meta,
  };

  const line = JSON.stringify(record);

  if (level === "error" || level === "warn") {
    process.stderr.write(line + "\n");
  } else {
    process.stdout.write(line + "\n");
  }
}

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): Logger;
}

function createLogger(bindings: Record<string, unknown> = {}): Logger {
  return {
    debug(message, meta) {
      write("debug", message, { ...bindings, ...meta });
    },
    info(message, meta) {
      write("info", message, { ...bindings, ...meta });
    },
    warn(message, meta) {
      write("warn", message, { ...bindings, ...meta });
    },
    error(message, meta) {
      write("error", message, { ...bindings, ...meta });
    },
    child(childBindings) {
      return createLogger({ ...bindings, ...childBindings });
    },
  };
}

export const logger = createLogger();
