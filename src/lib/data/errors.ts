import { logError } from '../observability/log';

/** An error whose message was written for the person using Papelito. */
export class PublicError extends Error {}

/**
 * Only messages written for people (PublicError) reach the browser. Anything
 * else (driver, provider or programming errors) is logged without its message
 * and replaced by the operation's generic text.
 */
export function publicErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof PublicError) return error.message;
  logError('server_action.failed', error, { action: fallback.slice(0, 80) });
  return fallback;
}
