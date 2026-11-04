import { logError } from '@/lib/observability/log';

const DIGEST = /^[0-9A-Za-z_-]{1,64}$/;

/**
 * Server errors (render, route handlers, actions). The error pages show the
 * digest as a support code; logging it here lets that code be found in the
 * Worker logs. Only the error class, the digest, the method, the route pattern
 * and the path with ids removed are kept: never the message, headers or query.
 * Supported by Next and by vinext (src/instrumentation.ts).
 */
export async function onRequestError(
  error: unknown,
  request: { path: string; method: string },
  context: { routeType?: string; routePath?: string },
) {
  const digest = typeof error === 'object' && error !== null && 'digest' in error ? String((error as { digest: unknown }).digest) : '';
  logError('request_error', error, {
    digest: DIGEST.test(digest) ? digest : undefined,
    method: request.method,
    path: request.path,
    routeType: context.routeType,
    route: context.routePath,
  });
}
