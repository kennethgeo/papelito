import 'server-only';
import { cookies } from 'next/headers';
import { dbQuery, isDatabaseConfigured } from '@/lib/db/client';
import { hashToken, readPasskeyToken } from '@/lib/repositories/passkeys';
import { logError } from '@/lib/observability/log';
import { passkeyAppURL } from './passkey-config';
export { neonSessionIsRevoked } from './session-guard';
export function passkeyCookie() {
  const secure = passkeyAppURL().startsWith('https://');
  return { name: secure ? '__Host-papelito_passkey' : 'papelito_passkey_dev', secure };
}
export async function getPasskeySession() {
  if (!isDatabaseConfigured()) return null;
  const token = (await cookies()).get(passkeyCookie().name)?.value;
  if (!token) return null;
  return readPasskeyToken(token);
}
/** Signing out must always remove the cookie, even if the database is unreachable. */
export async function clearPasskeySession() {
  const store = await cookies(); const name = passkeyCookie().name; const token = store.get(name)?.value;
  store.delete(name);
  if (!token || !isDatabaseConfigured()) return;
  try {
    await dbQuery('DELETE FROM app_passkey_sessions WHERE token_hash = $1', [hashToken(token)]);
  } catch (error) {
    // The cookie is gone; the stored session expires on its own (7 days) and is
    // purged by the retention job.
    logError('auth.passkey_session_delete_failed', error);
  }
}
