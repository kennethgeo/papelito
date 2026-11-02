/**
 * Timestamps cross the network as ISO 8601 in UTC. PostgreSQL's text form
 * ("2026-11-02 14:00:00.123456+00") is not parsed consistently by browsers
 * (WebKit and Firefox may return Invalid Date), so the server normalizes it.
 */
const PG_TIMESTAMP = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)(\.\d+)?(Z|[+-]\d{2}(?::?\d{2})?)?$/;

export function toIsoTimestamp(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (typeof value !== 'string') return null;
  const match = PG_TIMESTAMP.exec(value.trim());
  if (!match) return null;
  const [, day, time, fraction = '', zone = 'Z'] = match;
  const seconds = time.length === 5 ? `${time}:00` : time;
  const millis = fraction ? fraction.slice(0, 4).padEnd(4, '0') : '';
  const offset = zone === 'Z' ? 'Z' : zone.length === 3 ? `${zone}:00` : zone.includes(':') ? zone : `${zone.slice(0, 3)}:${zone.slice(3)}`;
  const date = new Date(`${day}T${seconds}${millis}${offset}`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Formats a timestamp for people in Costa Rica; invalid input never throws. */
export function formatTimestamp(value: unknown, options: Intl.DateTimeFormatOptions, fallback = ''): string {
  const iso = toIsoTimestamp(value);
  if (!iso) return fallback;
  try {
    return new Intl.DateTimeFormat('es-CR', { timeZone: 'America/Costa_Rica', ...options }).format(new Date(iso));
  } catch {
    return fallback;
  }
}
