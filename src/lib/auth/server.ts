import 'server-only';
import { connection } from 'next/server';
import { unstable_rethrow } from 'next/navigation';
import { getNeonAuth } from './neon';
export { getNeonAuth } from './neon';
import { getPasskeySession, neonSessionIsRevoked } from './passkey-session';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatarColor: string;
}

export async function getServerSession(): Promise<{ user: AuthUser } | null> {
  await connection();
  const own = await getPasskeySession();
  if (own) return { user: own.user };
  const auth = getNeonAuth();
  if (!auth) {
    return null;
  }

  // Wait for an actual incoming user request outside try/catch before invoking Neon Auth SDK
  // so Partial Prerendering / runtime prefetch suspends cleanly without triggering
  // HANGING_PROMISE_REJECTION inside the SDK's upstream fetch wrapper.
  await connection();

  try {
    const { data: session } = await auth.getSession({ query: { disableCookieCache: 'true' } });
    if (!session || !session.user) {
      return null;
    }
    if (await neonSessionIsRevoked(session.session.id)) return null;
    return {
      user: {
        id: session.user.id,
        email: session.user.email || '',
        name: session.user.name || session.user.email?.split('@')[0] || 'Participante',
        avatarColor: '#46245D',
      },
    };
  } catch (err) {
    unstable_rethrow(err);
    return null;
  }
}

export async function getFreshServerSession(): Promise<{
  user: AuthUser;
  authenticatedAt: string | null;
} | null> {
  await connection();
  const own = await getPasskeySession();
  if (own) return { user: own.user, authenticatedAt: own.authenticatedAt };
  const auth = getNeonAuth();
  if (!auth) {
    return null;
  }

  await connection();

  try {
    const { data: session } = await auth.getSession({
      query: { disableCookieCache: 'true' },
    });
    if (!session || !session.user) {
      return null;
    }

    if (await neonSessionIsRevoked(session.session.id)) return null;
    const rawCreated = session.session?.createdAt;
    const createdMs = rawCreated ? new Date(rawCreated).getTime() : NaN;

    return {
      user: {
        id: session.user.id,
        email: session.user.email || '',
        name: session.user.name || session.user.email?.split('@')[0] || 'Participante',
        avatarColor: '#46245D',
      },
      authenticatedAt: Number.isFinite(createdMs) ? new Date(createdMs).toISOString() : null,
    };
  } catch (err) {
    unstable_rethrow(err);
    return null;
  }
}
