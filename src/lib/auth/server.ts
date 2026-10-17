import 'server-only';
import { isNeonAuthConfigured } from './config';
import { createNeonAuth } from '@neondatabase/auth/next/server';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatarColor: string;
}

let authInstance: ReturnType<typeof createNeonAuth> | null = null;

export function getNeonAuth() {
  if (!isNeonAuthConfigured()) {
    return null;
  }
  if (!authInstance) {
    authInstance = createNeonAuth({
      baseUrl: process.env.NEON_AUTH_BASE_URL!,
      cookies: {
        secret: process.env.NEON_AUTH_COOKIE_SECRET!,
        sessionDataTtl: 300,
      },
    });
  }
  return authInstance;
}

export async function getServerSession(): Promise<{ user: AuthUser } | null> {
  const auth = getNeonAuth();
  if (!auth) {
    return null;
  }

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
  } catch {
    return null;
  }
}
