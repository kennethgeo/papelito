import 'server-only';
import { getFreshServerSession, getServerSession } from '@/lib/auth/server';
import { getLatestConsentStatus } from '@/lib/repositories/profiles';
import { PublicError } from './errors';
export { PublicError } from './errors';
export async function requireUser(fresh = false) {
  const session = fresh ? await getFreshServerSession() : await getServerSession();
  if (!session?.user) throw new PublicError('Iniciá sesión para continuar.');
  if (fresh && (!('authenticatedAt' in session) || !session.authenticatedAt || Date.now() - new Date(String(session.authenticatedAt)).getTime() > 900_000))
    throw new PublicError('Por seguridad, volvé a iniciar sesión antes de realizar este cambio.');
  if (!(await getLatestConsentStatus(session.user.id)).hasCurrentConsent) throw new PublicError('Confirmá el consentimiento vigente para continuar.');
  return session.user;
}
export async function safeAction<T>(fn: () => Promise<T>) {
  try { return { success: true as const, data: await fn() }; }
  catch (e) { return { success: false as const, error: e instanceof PublicError ? e.message : 'No pudimos completar la operación. Revisá la conexión e intentá de nuevo.' }; }
}
