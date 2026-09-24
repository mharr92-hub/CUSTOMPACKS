/**
 * Logger mínimo. En producción solo emite warn/error (y info estructurada del
 * servidor); en desarrollo emite todo. Es el único lugar donde se permite
 * `console.*` (regla de CLAUDE.md).
 */
type Level = "debug" | "info" | "warn" | "error";

const order: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function minLevel(): Level {
  if (process.env.LOG_LEVEL === "debug" || process.env.LOG_LEVEL === "info") return process.env.LOG_LEVEL;
  if (process.env.NODE_ENV === "test") return "warn";
  return process.env.NODE_ENV === "production" ? "info" : "debug";
}

function emit(level: Level, message: string, data?: Record<string, unknown>) {
  if (order[level] < order[minLevel()]) return;
  const line = data ? `[${level}] ${message} ${safeJson(data)}` : `[${level}] ${message}`;
  /* eslint-disable no-console */
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
  /* eslint-enable no-console */
}

function safeJson(data: Record<string, unknown>): string {
  try {
    return JSON.stringify(data, (_key, value: unknown) => (value instanceof Error ? { name: value.name, message: value.message } : value));
  } catch {
    return "[unserializable]";
  }
}

export const log = {
  debug: (message: string, data?: Record<string, unknown>) => emit("debug", message, data),
  info: (message: string, data?: Record<string, unknown>) => emit("info", message, data),
  warn: (message: string, data?: Record<string, unknown>) => emit("warn", message, data),
  error: (message: string, data?: Record<string, unknown>) => emit("error", message, data),
};
