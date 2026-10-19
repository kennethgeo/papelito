'use server';
import { cookies, headers } from 'next/headers';
import { requireUser, safeAction, PublicError } from './access';
import { registrationOptions, authenticationOptions, finishRegistration, finishAuthentication, listAccountAccess, removePasskey, revokeAccountSession } from '@/lib/repositories/passkeys';
import { clearPasskeySession, getPasskeySession, passkeyCookie } from '@/lib/auth/passkey-session';
import { getNeonAuth } from '@/lib/auth/server';
import type { RegistrationResponseJSON, AuthenticationResponseJSON } from '@simplewebauthn/server';
const CHALLENGE_COOKIE = 'papelito_webauthn_attempt';
async function origin() { return (await headers()).get('origin') || ''; }
async function challengeCookie(token: string) { (await cookies()).set(CHALLENGE_COOKIE, token, { httpOnly: true, sameSite: 'strict', secure: passkeyCookie().secure, path: '/', maxAge: 300 }); }
export async function beginPasskeyRegistration() { return safeAction(async () => { const u = await requireUser(true); const result = await registrationOptions(u, await origin()); await challengeCookie(result.token); return result.options; }); }
export async function completePasskeyRegistration(response: RegistrationResponseJSON, label: string) { return safeAction(async () => { const u = await requireUser(true); const store = await cookies(); const token = store.get(CHALLENGE_COOKIE)?.value || ''; store.delete(CHALLENGE_COOKIE); return finishRegistration(u.id, token, response, label, await origin()); }); }
export async function beginPasskeyLogin() { return safeAction(async () => { const result = await authenticationOptions(await origin()); await challengeCookie(result.token); return result.options; }); }
export async function completePasskeyLogin(response: AuthenticationResponseJSON) {
  return safeAction(async () => {
    const store = await cookies(); const token = store.get(CHALLENGE_COOKIE)?.value || ''; store.delete(CHALLENGE_COOKIE);
    const sessionToken = await finishAuthentication(token, response, (await headers()).get('user-agent') || '', await origin());
    const signedOut = await getNeonAuth()?.signOut();
    if (signedOut?.error) throw new PublicError('No pudimos preparar la sesión. Intentá de nuevo.');
    const config = passkeyCookie(); store.set(config.name, sessionToken, { httpOnly: true, secure: config.secure, sameSite: 'lax', path: '/', maxAge: 7 * 86400 });
    return true;
  });
}
export async function accountAccessAction() { return safeAction(async () => {
  const u = await requireUser(); const own = await getPasskeySession(); const data = await listAccountAccess(u.id, own?.id);
  const neon = await getNeonAuth()?.getSession({ query: { disableCookieCache: 'true' } }).catch(() => null);
  return { ...data, currentCredentialId: own?.credentialId, neon: data.neon.map(s => ({ ...s, current: !own && s.id === neon?.data?.session?.id })) };
}); }
export async function removePasskeyAction(id: string) { return safeAction(async () => { const u = await requireUser(true); if (typeof id !== 'string') throw new PublicError('Passkey inválida.'); await removePasskey(u.id, id); return true; }); }
export async function revokeSessionAction(id: string, kind: 'neon' | 'passkey') { return safeAction(async () => revokeAccountSession((await requireUser()).id, id, kind)); }
export async function clearPasskeyLoginAction() { return safeAction(async () => { await clearPasskeySession(); return true; }); }
