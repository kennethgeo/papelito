import 'server-only';
import { dbQuery, isDatabaseConfigured } from '@/lib/db/client';
import { PublicError } from '@/lib/data/errors';
import { logError } from '@/lib/observability/log';

export const NEON_SESSION_COOKIE = '__Secure-neon-auth.session_token';
export const NEON_SESSION_DATA_COOKIE = '__Secure-neon-auth.local.session_data';

/** The session could not be confirmed (database or auth provider unavailable). */
export class SessionUnavailableError extends PublicError {
  constructor() {
    super('No pudimos confirmar tu sesión en este momento. Revisá tu conexión e intentá de nuevo.');
    this.name = 'SessionUnavailableError';
  }
}

/** Local revocation list, checked on every authenticated request. Fails closed. */
export async function neonSessionIsRevoked(sessionId: string): Promise<boolean> {
  if (!isDatabaseConfigured()) return false;
  try {
    const result = await dbQuery('SELECT 1 FROM app_session_revocations WHERE session_id = $1 AND expires_at > now()', [sessionId]);
    return result.rowCount > 0;
  } catch (error) {
    logError('auth.revocation_check_failed', error);
    throw new SessionUnavailableError();
  }
}

export function hasNeonSessionCookie(cookieHeader: string): boolean {
  return cookieHeader.split(';').some((part) => part.trim().startsWith(`${NEON_SESSION_COOKIE}=`));
}

/**
 * Neon Auth endpoints that begin, recover or end a session keep working with a
 * revoked or unverifiable cookie; blocking them would trap the person outside
 * their account. Every other endpoint acts with the current session.
 */
const SESSIONLESS_AUTH_PATHS = [
  /^sign-in\//, /^sign-up\//, /^sign-out$/,
  /^forget-password$/, /^request-password-reset$/, /^reset-password(\/|$)/,
  /^verify-email$/, /^send-verification-email$/, /^email-otp\//,
  /^callback\//, /^error$/, /^ok$/,
];

export type AuthPathPolicy = 'sessionless' | 'session-read' | 'session';

export function authPathPolicy(path: string): AuthPathPolicy {
  if (path === 'get-session') return 'session-read';
  return SESSIONLESS_AUTH_PATHS.some((pattern) => pattern.test(path)) ? 'sessionless' : 'session';
}

const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0' };

export function clearNeonSessionCookies(headers: Headers) {
  for (const name of [NEON_SESSION_COOKIE, NEON_SESSION_DATA_COOKIE]) {
    headers.append('Set-Cookie', `${name}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`);
  }
}

export function revokedSessionResponse() {
  const response = Response.json(
    { code: 'SESSION_REVOKED', message: 'Este acceso fue cerrado. Volvé a iniciar sesión.' },
    { status: 401, headers: PRIVATE_HEADERS },
  );
  clearNeonSessionCookies(response.headers);
  return response;
}

export function sessionUnavailableResponse() {
  return Response.json(
    { code: 'SESSION_CHECK_UNAVAILABLE', message: 'No pudimos confirmar tu sesión. Intentá de nuevo en un momento.' },
    { status: 503, headers: { ...PRIVATE_HEADERS, 'Retry-After': '30' } },
  );
}

/** Reads the session id for the request's own cookie, without the cookie cache. */
export async function resolveNeonSessionId(cookieHeader: string, baseUrl: string): Promise<{ status: 'found'; id: string } | { status: 'none' } | { status: 'unavailable' }> {
  const token = cookieHeader.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${NEON_SESSION_COOKIE}=`));
  if (!token) return { status: 'none' };
  try {
    const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/get-session?disableCookieCache=true`, {
      headers: { Cookie: token },
      signal: AbortSignal.timeout(5_000),
    });
    if (response.status === 401 || response.status === 403) return { status: 'none' };
    if (!response.ok) return { status: 'unavailable' };
    const body = (await response.json().catch(() => null)) as { session?: { id?: unknown } } | null;
    return typeof body?.session?.id === 'string' ? { status: 'found', id: body.session.id } : { status: 'none' };
  } catch (error) {
    logError('auth.session_lookup_failed', error);
    return { status: 'unavailable' };
  }
}

/**
 * Applies the local revocation list to a request bound for Neon Auth.
 * Returns a response that replaces the upstream call, or null to continue.
 */
export async function guardAuthProxyRequest(request: Request, path: string, baseUrl: string): Promise<Response | null> {
  if (authPathPolicy(path) !== 'session') return null;
  const cookieHeader = request.headers.get('cookie') || '';
  if (!hasNeonSessionCookie(cookieHeader)) return null;
  const session = await resolveNeonSessionId(cookieHeader, baseUrl);
  if (session.status === 'unavailable') return sessionUnavailableResponse();
  if (session.status === 'none') return null;
  try {
    return (await neonSessionIsRevoked(session.id)) ? revokedSessionResponse() : null;
  } catch {
    return sessionUnavailableResponse();
  }
}

/**
 * `get-session` may be answered from the signed cookie cache, so the session id
 * is checked after the call: a revoked session reads as signed out.
 */
export async function filterSessionReadResponse(response: Response): Promise<Response> {
  if (!response.ok) return response;
  let body: { session?: { id?: unknown } } | null;
  try {
    body = await response.clone().json();
  } catch {
    return response;
  }
  const id = body?.session?.id;
  if (typeof id !== 'string') return response;
  try {
    if (!(await neonSessionIsRevoked(id))) return response;
  } catch {
    return sessionUnavailableResponse();
  }
  const signedOut = Response.json(null, { status: 200, headers: PRIVATE_HEADERS });
  clearNeonSessionCookies(signedOut.headers);
  return signedOut;
}
