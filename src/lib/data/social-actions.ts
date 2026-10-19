'use server';
import { getServerSession } from '@/lib/auth/server';
import { getLatestConsentStatus } from '@/lib/repositories/profiles';
import { getAnonymousThreads, getGiftPreferences, saveGiftPreferences, sendAnonymousMessage } from '@/lib/repositories/social';
import { getPushPublicKey, isPushConfigured, savePushSubscription, removePushSubscription, ownsPushSubscription, notifyUser } from '@/lib/notifications/push';

async function user() {
  const session = await getServerSession();
  if (!session?.user || !(await getLatestConsentStatus(session.user.id)).hasCurrentConsent) throw new Error('Iniciá sesión y confirmá el consentimiento para continuar.');
  return session.user.id;
}
async function safe<T>(work: () => Promise<T>) {
  try { return { success: true as const, data: await work() }; }
  catch (e) {
    const text = e instanceof Error ? e.message : '';
    // Never serialize SQL, tokens, subscription endpoints or provider diagnostics.
    const publicError = /^(Iniciá|Escribí|Esta conversación|Esperá|Cada respuesta|Perfil de gustos|Los recordatorios|No se pudo vincular|Proveedor de|Suscripción inválida|Claves de)/.test(text);
    return { success: false as const, error: publicError ? text : 'No se pudo completar. Revisá la conexión e intentá de nuevo.' };
  }
}
export async function giftPreferencesAction(value?: unknown) {
  return safe(async () => { const id = await user(); return value === undefined ? getGiftPreferences(id) : saveGiftPreferences(id, value); });
}
export async function anonymousThreadsAction(exchangeId: string) { return safe(async () => getAnonymousThreads(exchangeId, await user())); }
export async function sendAnonymousMessageAction(exchangeId: string, threadId: string, body: string) {
  return safe(async () => {
    const result = await sendAnonymousMessage(exchangeId, threadId, await user(), body);
    await notifyUser(result.recipientId, `message:${result.messageId}`, { body: 'Tenés un nuevo mensaje en tu intercambio. Abrí Papelito para leerlo.', exchangeId }).catch(() => undefined);
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
    if (!(await ownsPushSubscription(id, endpoint))) throw new Error('Suscripción inválida.');
    return notifyUser(id, `test:${Math.floor(Date.now() / 60_000)}`, { body: '¡Listo! Los recordatorios de Papelito llegan a este dispositivo.' }, undefined, endpoint);
  });
}
