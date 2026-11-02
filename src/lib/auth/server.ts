import 'server-only';
import { connection } from 'next/server';
import { cookies } from 'next/headers';
import { unstable_rethrow } from 'next/navigation';
import { getNeonAuth } from './neon';
export { getNeonAuth } from './neon';
import { getPasskeySession } from './passkey-session';
import { NEON_SESSION_COOKIE, SessionUnavailableError, neonSessionIsRevoked } from './session-guard';
import { logError } from '@/lib/observability/log';

export { SessionUnavailableError } from './session-guard';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatarColor: string;
}

/**
 * Three distinct outcomes: a confirmed session, no session, or a failure while
 * confirming it. Callers must never present `unavailable` as signed out.
 */
export type SessionState =
  | { status: 'authenticated'; user: AuthUser; authenticatedAt: string | null; neonSessionId: string | null }
  | { status: 'anonymous' }
  | { status: 'unavailable' };

function toUser(user: { id: string; email?: string | null; name?: string | null }): AuthUser {
  return {
    id: user.id,
    email: user.email || '',
    name: user.name || user.email?.split('@')[0] || 'Participante',
    avatarColor: '#46245D',
  };
}

export async function getSessionState(): Promise<SessionState> {
  // Wait for an actual request before touching cookies or the auth provider so
  // prerendering suspends cleanly instead of rejecting inside the SDK.
  await connection();

  try {
    const own = await getPasskeySession();
    if (own) return { status: 'authenticated', user: own.user, authenticatedAt: own.authenticatedAt, neonSessionId: null };
  } catch (error) {
    unstable_rethrow(error);
    logError('auth.passkey_session_failed', error);
    return { status: 'unavailable' };
  }

  const auth = getNeonAuth();
  if (!auth) return { status: 'anonymous' };
  // Guests never trigger a call to the auth provider.
  if (!(await cookies()).get(NEON_SESSION_COOKIE)) return { status: 'anonymous' };

  try {
    const { data: session, error } = await auth.getSession({ query: { disableCookieCache: 'true' } });
    if (error) {
      const status = typeof error.status === 'number' ? error.status : 0;
      if (status === 401 || status === 403) return { status: 'anonymous' };
      logError('auth.session_provider_failed', error, { providerStatus: status });
      return { status: 'unavailable' };
    }
    if (!session?.session || !session.user) return { status: 'anonymous' };
    if (await neonSessionIsRevoked(session.session.id)) return { status: 'anonymous' };
    const createdMs = session.session.createdAt ? new Date(session.session.createdAt).getTime() : NaN;
    return {
      status: 'authenticated',
      user: toUser(session.user),
      authenticatedAt: Number.isFinite(createdMs) ? new Date(createdMs).toISOString() : null,
      neonSessionId: session.session.id,
    };
  } catch (error) {
    unstable_rethrow(error);
    if (!(error instanceof SessionUnavailableError)) logError('auth.session_lookup_failed', error);
    return { status: 'unavailable' };
  }
}

/** Confirmed user, null when signed out. Throws SessionUnavailableError on failure. */
export async function getServerSession(): Promise<{ user: AuthUser } | null> {
  const state = await getSessionState();
  if (state.status === 'unavailable') throw new SessionUnavailableError();
  return state.status === 'authenticated' ? { user: state.user } : null;
}

/** Same as getServerSession, plus when the session started (recent-login checks). */
export async function getFreshServerSession(): Promise<{ user: AuthUser; authenticatedAt: string | null } | null> {
  const state = await getSessionState();
  if (state.status === 'unavailable') throw new SessionUnavailableError();
  return state.status === 'authenticated' ? { user: state.user, authenticatedAt: state.authenticatedAt } : null;
}
