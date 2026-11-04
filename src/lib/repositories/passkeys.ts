import 'server-only';
import crypto from 'node:crypto';
import { dbQuery, dbTransaction } from '@/lib/db/client';
import { PublicError } from '@/lib/data/errors';
import { passkeyAppURL } from '@/lib/auth/passkey-config';
import { toIsoTimestamp } from '@/lib/date/timestamps';
import { generateRegistrationOptions, generateAuthenticationOptions, verifyRegistrationResponse, verifyAuthenticationResponse,
  type RegistrationResponseJSON, type AuthenticationResponseJSON, type AuthenticatorTransport } from '@simplewebauthn/server';
export const hashToken = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
export function browserName(ua: string) {
  const device = /iPhone|iPad/.test(ua) ? 'iPhone/iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Macintosh/.test(ua) ? 'Mac' : 'Dispositivo';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Navegador';
  return `${browser} · ${device}`;
}
export function trustedPasskeyOrigin(raw: string) {
  const configured = new URL(passkeyAppURL());
  const requested = new URL(raw);
  const loopback = ['localhost', '127.0.0.1', '127.0.0.2'];
  const local = loopback.includes(configured.hostname) && loopback.includes(requested.hostname) && configured.port === requested.port;
  if (requested.origin !== configured.origin && !local) throw new PublicError('Abrí Papelito desde su dirección oficial para usar una passkey.');
  if (requested.protocol !== 'https:' && !local) throw new PublicError('Las passkeys requieren una conexión segura.');
  return { origin: requested.origin, rpID: requested.hostname };
}
/**
 * WebAuthn attempts are signed, short-lived tokens kept in an HttpOnly cookie:
 * starting a sign-in writes nothing to the database, so no global table or
 * cap can be exhausted by anonymous requests. Completing an attempt records
 * its nonce once (webauthn_challenges) so a captured token cannot be replayed.
 */
const ATTEMPT_TTL_MS = 5 * 60 * 1000;
type Attempt = { c: string; k: 'registration' | 'authentication'; u: string | null; o: string; r: string; e: number; n: string };

function attemptKey(): Buffer {
  const secret = process.env.INVITATION_TOKEN_SECRET?.trim() || process.env.NEON_AUTH_COOKIE_SECRET?.trim();
  if (!secret || secret.length < 32) throw new PublicError('Las passkeys no están disponibles en este momento.');
  // Separate purpose from invitation encryption and Web Push keys.
  return Buffer.from(crypto.hkdfSync('sha256', Buffer.from(secret, 'utf8'), Buffer.from('papelito-webauthn-attempt-v1'), Buffer.from('hmac-sha256'), 32));
}
function sealAttempt(attempt: Attempt): string {
  const body = Buffer.from(JSON.stringify(attempt)).toString('base64url');
  return `${body}.${crypto.createHmac('sha256', attemptKey()).update(body).digest('base64url')}`;
}
function openAttempt(token: string): Attempt | null {
  if (typeof token !== 'string' || token.length > 2048) return null;
  const [body, mac, extra] = token.split('.');
  if (!body || !mac || extra !== undefined) return null;
  const expected = crypto.createHmac('sha256', attemptKey()).update(body).digest();
  const given = Buffer.from(mac, 'base64url');
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  try {
    const a = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Attempt;
    const valid = typeof a.c === 'string' && (a.k === 'registration' || a.k === 'authentication') && (a.u === null || typeof a.u === 'string')
      && typeof a.o === 'string' && typeof a.r === 'string' && Number.isFinite(a.e) && typeof a.n === 'string' && /^[A-Za-z0-9_-]{22}$/.test(a.n);
    return valid ? a : null;
  } catch {
    return null;
  }
}
async function storeChallenge(challenge: string, kind: Attempt['k'], userId: string | null, origin: string, rpID: string) {
  return sealAttempt({ c: challenge, k: kind, u: userId, o: origin, r: rpID, e: Date.now() + ATTEMPT_TTL_MS, n: crypto.randomBytes(16).toString('base64url') });
}
async function consumeChallenge(token: string, kind: string, userId?: string) {
  const attempt = openAttempt(token);
  if (!attempt || attempt.e <= Date.now()) throw new PublicError('El intento de acceso venció. Volvé a empezar.');
  // One use per attempt, recorded before any other check (as before).
  await dbQuery('DELETE FROM webauthn_challenges WHERE expires_at < now()');
  const used = await dbQuery(`INSERT INTO webauthn_challenges (token_hash, challenge, kind, user_id, origin, rp_id, expires_at)
    VALUES ($1, $2, $3, $4, $5, $6, to_timestamp($7::double precision / 1000)) ON CONFLICT (token_hash) DO NOTHING RETURNING token_hash`,
    [hashToken(attempt.n), attempt.c, attempt.k, attempt.u, attempt.o, attempt.r, attempt.e]);
  if (!used.rowCount || attempt.k !== kind || (userId && attempt.u !== userId)) throw new PublicError('El intento de acceso venció o ya se utilizó. Volvé a empezar.');
  return { challenge: attempt.c, origin: attempt.o, rp_id: attempt.r, user_id: attempt.u };
}
export async function registrationOptions(user: { id: string; email: string }, rawOrigin: string) {
  const { origin, rpID } = trustedPasskeyOrigin(rawOrigin);
  const existing = await dbQuery<{ credential_id: string }>('SELECT credential_id FROM app_passkeys WHERE user_id = $1 AND rp_id = $2', [user.id, rpID]);
  if (existing.rowCount >= 8) throw new PublicError('Podés registrar hasta ocho passkeys por cuenta y dominio.');
  const options = await generateRegistrationOptions({ rpName: 'Papelito Costa Rica', rpID, userName: user.email,
    userID: new TextEncoder().encode(user.id), attestationType: 'none',
    excludeCredentials: existing.rows.map(r => ({ id: r.credential_id })), authenticatorSelection: { residentKey: 'required', userVerification: 'required' } });
  return { options, token: await storeChallenge(options.challenge, 'registration', user.id, origin, rpID) };
}
export async function finishRegistration(userId: string, token: string, response: RegistrationResponseJSON, label: string, rawOrigin: string) {
  const expected = await consumeChallenge(token, 'registration', userId);
  if (trustedPasskeyOrigin(rawOrigin).origin !== expected.origin) throw new PublicError('El origen del registro cambió. Volvé a empezar.');
  if (typeof label !== 'string' || !label.trim() || label.trim().length > 50) throw new PublicError('Elegí un nombre de hasta 50 caracteres para esta passkey.');
  const result = await verifyRegistrationResponse({ response, expectedChallenge: expected.challenge, expectedOrigin: expected.origin, expectedRPID: expected.rp_id, requireUserVerification: true });
  if (!result.verified || !result.registrationInfo) throw new PublicError('No se pudo verificar la passkey.');
  const credential = result.registrationInfo.credential;
  await dbTransaction(async client => {
    await client.query('SELECT user_id FROM profiles WHERE user_id = $1 FOR UPDATE', [userId]);
    const count = await client.query('SELECT credential_id FROM app_passkeys WHERE user_id = $1 AND rp_id = $2', [userId, expected.rp_id]);
    if (count.rowCount >= 8) throw new PublicError('Podés registrar hasta ocho passkeys por cuenta y dominio.');
    await client.query(`INSERT INTO app_passkeys (credential_id, user_id, public_key, counter, transports, rp_id, label) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)`,
      [credential.id, userId, Buffer.from(credential.publicKey), credential.counter, JSON.stringify(credential.transports || []), expected.rp_id, label.trim()]);
  });
  return true;
}
export async function authenticationOptions(rawOrigin: string) {
  const { origin, rpID } = trustedPasskeyOrigin(rawOrigin);
  const options = await generateAuthenticationOptions({ rpID, userVerification: 'required' });
  return { options, token: await storeChallenge(options.challenge, 'authentication', null, origin, rpID) };
}
export async function finishAuthentication(token: string, response: AuthenticationResponseJSON, ua: string, rawOrigin: string) {
  const expected = await consumeChallenge(token, 'authentication');
  if (trustedPasskeyOrigin(rawOrigin).origin !== expected.origin) throw new PublicError('El origen del acceso cambió. Volvé a empezar.');
  const key = await dbQuery<{ user_id: string; credential_id: string; public_key: Uint8Array; counter: string; transports: AuthenticatorTransport[] }>(`SELECT k.user_id, k.credential_id, k.public_key, k.counter::text, k.transports FROM app_passkeys k
    JOIN neon_auth."user" u ON u.id::text = k.user_id WHERE k.credential_id = $1 AND k.rp_id = $2 AND COALESCE(u.banned, false) = false`, [response.id, expected.rp_id]);
  if (!key.rows[0]) throw new PublicError('No pudimos verificar este acceso. Usá Google o correo para recuperar tu cuenta.');
  const row = key.rows[0];
  if (response.response.userHandle !== Buffer.from(row.user_id).toString('base64url')) throw new PublicError('No pudimos verificar este acceso.');
  const result = await verifyAuthenticationResponse({ response, expectedChallenge: expected.challenge, expectedOrigin: expected.origin, expectedRPID: expected.rp_id, requireUserVerification: true,
    credential: { id: row.credential_id, publicKey: new Uint8Array(row.public_key), counter: Number(row.counter), transports: row.transports } });
  if (!result.verified) throw new PublicError('No pudimos verificar este acceso.');
  const sessionToken = crypto.randomBytes(32).toString('base64url');
  await dbTransaction(async client => {
    const updated = await client.query('UPDATE app_passkeys SET counter = $2, last_used_at = now() WHERE credential_id = $1 AND counter = $3 RETURNING credential_id', [row.credential_id, result.authenticationInfo.newCounter, row.counter]);
    if (!updated.rowCount) throw new PublicError('Este intento ya no es válido. Volvé a empezar.');
    await client.query('INSERT INTO app_passkey_sessions (token_hash, user_id, credential_id, browser) VALUES ($1, $2, $3, $4)', [hashToken(sessionToken), row.user_id, row.credential_id, browserName(ua)]);
    await client.query('DELETE FROM app_passkey_sessions WHERE expires_at < now()');
  });
  return sessionToken;
}
export async function readPasskeyToken(token?: string) {
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const res = await dbQuery<{ id: string; credential_id: string; created_at: string; user_id: string; email: string; name: string }>(`SELECT s.id, s.credential_id, s.created_at::text, s.user_id, u.email, u.name FROM app_passkey_sessions s JOIN neon_auth."user" u ON u.id::text = s.user_id WHERE s.token_hash = $1 AND s.expires_at > now() AND COALESCE(u.banned, false) = false`, [hashToken(token)]);
  const row = res.rows[0];
  return row ? { id: row.id, credentialId: row.credential_id, authenticatedAt: row.created_at, user: { id: row.user_id, email: row.email, name: row.name, avatarColor: '#46245D' } } : null;
}
export async function removePasskey(userId: string, id: string) {
  await dbTransaction(async client => {
    await client.query('SELECT user_id FROM profiles WHERE user_id = $1 FOR UPDATE', [userId]);
    const keys = await client.query('SELECT credential_id FROM app_passkeys WHERE user_id = $1', [userId]);
    const native = await client.query('SELECT id FROM neon_auth.account WHERE "userId"::text = $1', [userId]);
    if (keys.rowCount <= 1 && !native.rowCount) throw new PublicError('Conservá otro método de acceso antes de quitar tu última passkey.');
    await client.query('DELETE FROM app_passkeys WHERE user_id = $1 AND credential_id = $2', [userId, id]);
  });
}
export async function listAccountAccess(userId: string, currentOwnSession?: string) {
  const [keys, own, neon, providers] = await Promise.all([
    dbQuery<{ id: string; label: string; rp_id: string; created_at: string; last_used_at: string | null }>('SELECT credential_id AS id, label, rp_id, created_at::text, last_used_at::text FROM app_passkeys WHERE user_id = $1 ORDER BY created_at DESC', [userId]),
    dbQuery<{ id: string; browser: string; created_at: string; expires_at: string }>('SELECT id, browser, created_at::text, expires_at::text FROM app_passkey_sessions WHERE user_id = $1 AND expires_at > now()', [userId]),
    dbQuery<{ id: string; ua: string; created_at: string; expires_at: string }>(`SELECT s.id, s."userAgent" AS ua, s."createdAt"::text AS created_at, s."expiresAt"::text AS expires_at FROM neon_auth.session s WHERE s."userId"::text = $1 AND s."expiresAt" > now() AND NOT EXISTS (SELECT 1 FROM app_session_revocations r WHERE r.session_id = s.id::text AND r.user_id = $1)`, [userId]),
    dbQuery<{ provider: string }>('SELECT DISTINCT "providerId" AS provider FROM neon_auth.account WHERE "userId"::text = $1', [userId]),
  ]);
  const iso = (value: string | null) => toIsoTimestamp(value);
  return { keys: keys.rows.map(k => ({ ...k, created_at: iso(k.created_at) ?? '', last_used_at: iso(k.last_used_at) })), own: own.rows.map(s => ({ ...s, created_at: iso(s.created_at) ?? '', expires_at: iso(s.expires_at) ?? '', current: s.id === currentOwnSession })), neon: neon.rows.map(s => ({ id: s.id, browser: browserName(s.ua || ''), created_at: iso(s.created_at) ?? '', expires_at: iso(s.expires_at) ?? '' })), providers: providers.rows.map(p => p.provider) };
}
/** Result of closing the same session at Neon Auth (the identity provider). */
export type ProviderRevocation = 'revoked' | 'not-found' | 'unavailable' | 'not-applicable';

/**
 * Closes one of the user's own accesses. Neon sessions are first added to the
 * local revocation list (immediate effect in Papelito and in the auth proxy)
 * and then revoked at the provider when its API allows it. The provider needs
 * the secret session token, which never leaves the server: callers pass only
 * the public session id.
 */
export async function revokeAccountSession(userId: string, id: string, kind: 'passkey' | 'neon',
  revokeAtProvider?: (sessionId: string) => Promise<ProviderRevocation>): Promise<{ provider: ProviderRevocation }> {
  if (typeof id !== 'string' || !id || id.length > 100) throw new PublicError('Sesión inválida.');
  if (kind === 'passkey') {
    await dbQuery('DELETE FROM app_passkey_sessions WHERE user_id = $1 AND id::text = $2', [userId, id]);
    return { provider: 'not-applicable' };
  }
  if (kind !== 'neon') throw new PublicError('Sesión inválida.');
  const local = await dbQuery(`INSERT INTO app_session_revocations (session_id, user_id, expires_at)
    SELECT id::text, "userId"::text, "expiresAt" FROM neon_auth.session WHERE id::text = $1 AND "userId"::text = $2
    ON CONFLICT (session_id) DO UPDATE SET expires_at = EXCLUDED.expires_at WHERE app_session_revocations.user_id = EXCLUDED.user_id
    RETURNING session_id`, [id, userId]);
  if (!local.rowCount) throw new PublicError('Ese acceso ya no está activo en tu cuenta.');
  let provider: ProviderRevocation = 'unavailable';
  if (revokeAtProvider) {
    try { provider = await revokeAtProvider(id); } catch { provider = 'unavailable'; }
  }
  return { provider };
}
