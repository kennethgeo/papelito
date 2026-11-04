'use server';
import { getFreshServerSession } from '@/lib/auth/server';
import { PublicError, safeAction } from './access';

const RECENT_LOGIN_MS = 15 * 60 * 1000;

/** Whether the current session is recent enough for sensitive actions. */
export async function recentLoginAction() {
  return safeAction(async () => {
    const session = await getFreshServerSession();
    if (!session) throw new PublicError('Iniciá sesión para continuar.');
    const at = session.authenticatedAt ? new Date(session.authenticatedAt).getTime() : NaN;
    const age = Date.now() - at;
    return { recent: Number.isFinite(age) && age >= 0 && age <= RECENT_LOGIN_MS };
  });
}
