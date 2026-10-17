import 'server-only';
import { connection } from 'next/server';
import { unstable_rethrow } from 'next/navigation';
import { isNeonAuthConfigured } from './config';
import { createNeonAuth } from '@neondatabase/auth/next/server';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatarColor: string;
}

let authInstance: ReturnType<typeof createNeonAuth> | null = null;
let cachedConfigKey: string | null = null;

export function getNeonAuth() {
  if (!isNeonAuthConfigured()) {
    authInstance = null;
    cachedConfigKey = null;
    return null;
  }
  const baseUrl = process.env.NEON_AUTH_BASE_URL!;
  const secret = process.env.NEON_AUTH_COOKIE_SECRET!;
  const configKey = `${baseUrl}|${secret}`;
  if (!authInstance || cachedConfigKey !== configKey) {
    authInstance = createNeonAuth({
      baseUrl,
      cookies: {
        secret,
        sessionDataTtl: 300,
      },
    });
    cachedConfigKey = configKey;
  }
  return authInstance;
}

export async function getServerSession(): Promise<{ user: AuthUser } | null> {
  const auth = getNeonAuth();
  if (!auth) {
    return null;
  }

  // Wait for an actual incoming user request outside try/catch before invoking Neon Auth SDK
  // so Partial Prerendering / runtime prefetch suspends cleanly without triggering
  // HANGING_PROMISE_REJECTION inside the SDK's upstream fetch wrapper.
  await connection();

  try {
    const { data: session } = await auth.getSession();
    if (!session || !session.user) {
      return null;
    }
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
