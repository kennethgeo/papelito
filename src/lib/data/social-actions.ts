'use server';
import { getServerSession } from '@/lib/auth/server';
import { PublicError } from '@/lib/data/errors';
import { logError } from '@/lib/observability/log';
import { getLatestConsentStatus } from '@/lib/repositories/profiles';
import { getAnonymousThreads, getGiftPreferences, saveGiftPreferences, sendAnonymousMessage } from '@/lib/repositories/social';
import { getPushPublicKey, isPushConfigured, savePushSubscription, removePushSubscription, ownsPushSubscription, notifyUser } from '@/lib/notifications/push';

async function user() {
  const session = await getServerSession();
  if (!session?.user || !(await getLatestConsentStatus(session.user.id)).hasCurrentConsent) throw new PublicError('Iniciá sesión y confirmá el consentimiento para continuar.');
  return session.user.id;
}
async function safe<T>(work: () => Promise<T>) {
  try { return { success: true as const, data: await work() }; }
  catch (e) {
    // Never serialize SQL, tokens, subscription endpoints or provider diagnostics.
    if (e instanceof PublicError) return { success: false as const, error: e.message };
    logError('social_action.failed', e);
    return { success: false as const, error: 'No se pudo completar. Revisá la conexión e intentá de nuevo.' };
  }
}
export async function giftPreferencesAction(value?: unknown) {
  return safe(async () => { const id = await user(); return value === undefined ? getGiftPreferences(id) : saveGiftPreferences(id, value); });
}
export async function anonymousThreadsAction(exchangeId: string) { return safe(async () => getAnonymousThreads(exchangeId, await user())); }
export async function sendAnonymousMessageAction(exchangeId: string, threadId: string, body: string) {
  return safe(async () => {
    const result = await sendAnonymousMessage(exchangeId, threadId, await user(), body);
    await notifyUser(result.recipientId, `message:${result.messageId}`, { body: 'Tenés un mensaje nuevo en tu intercambio. Abrí Papelito para leerlo.', exchangeId }).catch(() => undefined);
    return true;
  });
}
export async function pushSettingsAction(endpoint?: string) {
  return safe(async () => { const id = await user(); return { publicKey: getPushPublicKey(), configured: isPushConfigured(), subscribed: endpoint ? await ownsPushSubscription(id, endpoint) : false }; });
}
export async function subscribePushAction(subscription: unknown) { return safe(async () => { await savePushSubscription(await user(), subscription); return true; }); }
export async function unsubscribePushAction(endpoint: string) { return safe(async () => { await removePushSubscription(await user(), endpoint); return true; }); }
export async function testPushAction(endpoint: string) {
  return safe(async () => {
    const id = await user();
    if (!(await ownsPushSubscription(id, endpoint))) throw new PublicError('Suscripción inválida.');
    return notifyUser(id, `test:${Math.floor(Date.now() / 60_000)}`, { body: '¡Listo! Las notificaciones de Papelito llegan a este dispositivo.' }, undefined, endpoint);
  });
}
