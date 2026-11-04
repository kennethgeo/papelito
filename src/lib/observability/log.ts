/**
 * Structured, sanitized server logs (Workers Logs / Node console).
 *
 * Never pass cookies, tokens, credentials, e-mail addresses, names, wish or
 * message contents, SQL text or SQL parameters. Error messages are not logged
 * because driver and provider messages can echo user input; only the error
 * class and a machine code are kept.
 */
type Level = 'error' | 'warn' | 'info';
type Primitive = string | number | boolean | null;

const FORBIDDEN_KEY = /cookie|token|secret|password|credential|authorization|email|name|alias|body|message|sql|param|url|query|description|title|detail|^err$|^error$|header/i;
const MAX_VALUE = 120;

function sanitizeValue(value: unknown): Primitive | undefined {
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') return value.slice(0, MAX_VALUE);
  return undefined;
}

/** Paths keep their shape; long opaque segments (tokens, ids) are removed. */
function redactPath(value: string) {
  return value.split('?')[0].split('/').map((segment) => (/^[A-Za-z0-9_.~-]{16,}$/.test(segment) ? ':id' : segment)).join('/');
}

export function sanitizeLogFields(fields: Record<string, unknown> = {}): Record<string, Primitive> {
  const clean: Record<string, Primitive> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (FORBIDDEN_KEY.test(key)) continue;
    const safe = sanitizeValue(key === 'path' && typeof value === 'string' ? redactPath(value) : value);
    if (safe !== undefined) clean[key] = safe;
  }
  return clean;
}

/** Machine-readable description of an error without its (possibly personal) message. */
export function describeError(error: unknown): Record<string, Primitive> {
  if (!(error instanceof Error)) return { errorType: typeof error };
  const code = (error as { code?: unknown }).code;
  const status = (error as { status?: unknown; statusCode?: unknown }).status ?? (error as { statusCode?: unknown }).statusCode;
  return {
    errorType: error.name || 'Error',
    ...(typeof code === 'string' && /^[A-Za-z0-9_.-]{1,40}$/.test(code) ? { errorCode: code } : {}),
    ...(typeof status === 'number' ? { errorStatus: status } : {}),
  };
}

export function logEvent(level: Level, event: string, fields: Record<string, unknown> = {}) {
  const line = JSON.stringify({ event: event.slice(0, 80), ...sanitizeLogFields(fields) });
  console[level](line);
}

export function logError(event: string, error: unknown, fields: Record<string, unknown> = {}) {
  logEvent('error', event, { ...fields, ...describeError(error) });
}

/**
 * Adapter for the Neon Auth SDK logger: keeps its static message and safe
 * fields (component, upstream path, status, code); drops URLs, error details
 * and raw errors, which can contain reset tokens or personal data.
 */
export const neonAuthLogger = {
  error: (message: string, meta?: Record<string, unknown>) => logEvent('error', 'neon_auth', { sdk: message.slice(0, 100), ...(meta ?? {}) }),
  warn: (message: string, meta?: Record<string, unknown>) => logEvent('warn', 'neon_auth', { sdk: message.slice(0, 100), ...(meta ?? {}) }),
  info: () => undefined,
  debug: () => undefined,
};
