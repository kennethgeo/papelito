/**
 * Identifier for one creation attempt. Reused if the same attempt is retried
 * after an uncertain failure, so the server returns the row it already made
 * instead of creating a duplicate. Undefined where Web Crypto is unavailable.
 */
export function newRequestId(): string | undefined {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : undefined;
}
