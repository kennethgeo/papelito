import 'server-only';
import { cookies } from 'next/headers';
import { dbQuery, isDatabaseConfigured } from '@/lib/db/client';
import { hashToken, readPasskeyToken } from '@/lib/repositories/passkeys';
import { passkeyAppURL } from './passkey-config';
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
export async function clearPasskeySession() {
  const store = await cookies(); const name = passkeyCookie().name; const token = store.get(name)?.value;
  if (token && isDatabaseConfigured()) await dbQuery('DELETE FROM app_passkey_sessions WHERE token_hash = $1', [hashToken(token)]);
  store.delete(name);
}
export async function neonSessionIsRevoked(sessionId: string) {
  if (!isDatabaseConfigured()) return false;
  const result = await dbQuery('SELECT session_id FROM app_session_revocations WHERE session_id = $1 AND expires_at > now()', [sessionId]);
  return !!result.rowCount;
}
