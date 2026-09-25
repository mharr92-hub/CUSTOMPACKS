/**
 * Errores a Sentry (opcional, sin SDK): solo con NEXT_PUBLIC_SENTRY_DSN.
 * Se envía un "envelope" mínimo con el mensaje, el tipo de error, la pila y
 * datos de contexto, después de borrar tokens de enlaces y correos. Si Sentry
 * no responde, no pasa nada: nunca rompe la petición que falló.
 */
export type SentryDsn = { key: string; host: string; projectId: string; protocol: string };

export function parseDsn(dsn: string | undefined | null): SentryDsn | null {
  if (!dsn) return null;
  try {
    const u = new URL(dsn.trim());
    const projectId = u.pathname.replace(/^\/+|\/+$/g, "");
    if (!u.username || !projectId || !/^\d+$/.test(projectId)) return null;
    return { key: u.username, host: u.host, projectId, protocol: u.protocol.replace(":", "") };
  } catch {
    return null;
  }
}

const TOKEN_PATH = /\/(seguimiento|cotizar\/listo)\/[A-Za-z0-9_-]{16,}/g;
const TOKEN_QUERY = /([?&](?:t|borrador|repetir|token)=)[^&#\s"']+/gi;
const LONG_TOKEN = /\b[A-Za-z0-9_-]{32,64}\b/g;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const DB_URL = /(postgres(?:ql)?:\/\/[^:\s]+:)[^@\s]+@/g;

/** Quita tokens de enlaces seguros, correos y contraseñas de URLs de base. */
export function scrub(text: string): string {
  return text
    .replace(DB_URL, "$1***@")
    .replace(TOKEN_PATH, "/$1/[token]")
    .replace(TOKEN_QUERY, "$1[token]")
    .replace(EMAIL, "[correo]")
    .replace(LONG_TOKEN, "[token]");
}

function scrubValue(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[…]";
  if (typeof value === "string") return scrub(value).slice(0, 2000);
  if (value instanceof Error) return { name: value.name, message: scrub(value.message) };
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => scrubValue(v, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 30)
        .map(([k, v]) => [k, /secret|password|token|key|authorization|cookie/i.test(k) ? "[oculto]" : scrubValue(v, depth + 1)]),
    );
  }
  return value;
}

function eventId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export type SentryInput = { message: string; error?: unknown; extra?: Record<string, unknown>; runtime: "server" | "browser"; path?: string };

/** Envelope listo para POST (se exporta para probarlo). */
export function buildEnvelope(dsn: SentryDsn, input: SentryInput, now = new Date()): { url: string; body: string } {
  const id = eventId();
  const error = input.error instanceof Error ? input.error : null;
  const event = {
    event_id: id,
    timestamp: now.getTime() / 1000,
    platform: input.runtime === "server" ? "node" : "javascript",
    level: "error",
    logger: "provenpack",
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "development",
    release: process.env.VERCEL_GIT_COMMIT_SHA || undefined,
    tags: { runtime: input.runtime },
    message: { formatted: scrub(input.message).slice(0, 500) },
    exception: error ? { values: [{ type: error.name || "Error", value: scrub(error.message).slice(0, 1000) }] } : undefined,
    request: input.path ? { url: scrub(input.path) } : undefined,
    extra: scrubValue({ ...(input.extra ?? {}), stack: error?.stack ? scrub(error.stack).slice(0, 4000) : undefined }),
  };
  const header = { event_id: id, sent_at: now.toISOString() };
  return {
    url: `${dsn.protocol}://${dsn.host}/api/${dsn.projectId}/envelope/?sentry_key=${encodeURIComponent(dsn.key)}&sentry_version=7&sentry_client=provenpack%2F1.0`,
    body: `${JSON.stringify(header)}\n${JSON.stringify({ type: "event" })}\n${JSON.stringify(event)}`,
  };
}

export function sentryEnabled(): boolean {
  return parseDsn(process.env.NEXT_PUBLIC_SENTRY_DSN) !== null;
}

/** Envía el error (servidor). Nunca lanza. */
export async function captureError(input: SentryInput): Promise<void> {
  const dsn = parseDsn(process.env.NEXT_PUBLIC_SENTRY_DSN);
  if (!dsn) return;
  try {
    const { url, body } = buildEnvelope(dsn, input);
    await fetch(url, { method: "POST", headers: { "Content-Type": "application/x-sentry-envelope" }, body, signal: AbortSignal.timeout(5000) });
  } catch {
    // Sentry caído: el error ya quedó en el log del servidor.
  }
}
