// SEG-01: a session closed from «Seguridad» cannot keep acting on the account
// through the Neon Auth proxy; sign-in, recovery and sign-out keep working, and
// a failed revocation lookup fails closed instead of looking signed out.
import assert from 'node:assert/strict';

const test = globalThis.__papelitoTest;
const guard = await import('../../src/lib/auth/session-guard.ts');
const { revokeAccountSession } = await import('../../src/lib/repositories/passkeys.ts');
const { getOrCreateProfile } = await import('../../src/lib/repositories/profiles.ts');
const { sanitizeLogFields, describeError } = await import('../../src/lib/observability/log.ts');

const BASE = 'https://auth.invalid/neondb/auth';
const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const SESSION_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SESSION_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SESSION_OTHER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const TOKENS = { 'tok-a': SESSION_A, 'tok-b': SESSION_B, 'tok-other': SESSION_OTHER };
const cookie = (token) => `theme=1; ${guard.NEON_SESSION_COOKIE}=${token}; other=x`;

let providerUp = true;
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : input.url;
  if (!url.startsWith(BASE)) return realFetch(input, init);
  if (!providerUp) throw new TypeError('fetch failed');
  const header = new Headers(init.headers).get('cookie') || '';
  const token = header.split('=').slice(1).join('=');
  const id = TOKENS[token];
  return id ? Response.json({ session: { id }, user: { id: id === SESSION_OTHER ? OTHER : USER } }) : Response.json(null);
};

async function seed({ query }) {
  for (const id of [USER, OTHER]) await getOrCreateProfile(id, `${id.slice(0, 4)}@example.com`, 'Persona ficticia');
  await query(`INSERT INTO neon_auth.session (id, "userId", token) VALUES ($1, $2, 'tok-a'), ($3, $2, 'tok-b'), ($4, $5, 'tok-other') ON CONFLICT DO NOTHING`, [SESSION_A, USER, SESSION_B, SESSION_OTHER, OTHER]);
}

test('sesiones: rutas de inicio, recuperación y salida no se bloquean; el resto exige sesión vigente', async () => {
  for (const path of ['sign-in/email', 'sign-in/social', 'sign-up/email', 'sign-out', 'forget-password', 'request-password-reset', 'reset-password', 'reset-password/abc', 'email-otp/send-verification-otp', 'callback/google', 'verify-email'])
    assert.equal(guard.authPathPolicy(path), 'sessionless', path);
  assert.equal(guard.authPathPolicy('get-session'), 'session-read');
  for (const path of ['link-social', 'list-sessions', 'revoke-session', 'revoke-all-sessions', 'update-user', 'change-password', 'change-email', 'unlink-account', 'list-accounts', 'get-access-token', 'token', 'delete-user', 'something-new'])
    assert.equal(guard.authPathPolicy(path), 'session', path);
});

test('sesiones: dos dispositivos; el revocado no puede vincular Google, listar ni revocar sesiones', async (shared) => {
  await seed(shared);
  const providerCalls = [];
  const result = await revokeAccountSession(USER, SESSION_B, 'neon', async (id) => { providerCalls.push(id); return 'revoked'; });
  assert.deepEqual(result, { provider: 'revoked' });
  assert.deepEqual(providerCalls, [SESSION_B], 'the provider receives the public id; the token is resolved server-side');

  for (const path of ['link-social', 'list-sessions', 'revoke-all-sessions', 'update-user']) {
    const blocked = await guard.guardAuthProxyRequest(new Request(`https://papelito.test/api/auth/${path}`, { method: 'POST', headers: { cookie: cookie('tok-b') } }), path, BASE);
    assert.equal(blocked?.status, 401, path);
    assert.equal((await blocked.json()).code, 'SESSION_REVOKED');
    assert.ok(blocked.headers.getSetCookie().some((c) => c.startsWith(`${guard.NEON_SESSION_COOKIE}=;`) && c.includes('Max-Age=0')));
    const allowed = await guard.guardAuthProxyRequest(new Request(`https://papelito.test/api/auth/${path}`, { method: 'POST', headers: { cookie: cookie('tok-a') } }), path, BASE);
    assert.equal(allowed, null, `the other device keeps working: ${path}`);
  }
  for (const path of ['sign-out', 'sign-in/social', 'sign-in/email', 'request-password-reset']) {
    const passthrough = await guard.guardAuthProxyRequest(new Request(`https://papelito.test/api/auth/${path}`, { method: 'POST', headers: { cookie: cookie('tok-b') } }), path, BASE);
    assert.equal(passthrough, null, `a revoked cookie must not trap the person outside: ${path}`);
  }
});

test('sesiones: get-session de una sesión revocada se lee como cerrada, incluso desde la caché firmada', async (shared) => {
  await seed(shared);
  await revokeAccountSession(USER, SESSION_B, 'neon', async () => 'revoked');
  const revoked = await guard.filterSessionReadResponse(Response.json({ session: { id: SESSION_B }, user: { id: USER } }));
  assert.equal(await revoked.json(), null);
  assert.equal(revoked.headers.getSetCookie().length, 2);
  const active = await guard.filterSessionReadResponse(Response.json({ session: { id: SESSION_A }, user: { id: USER } }));
  assert.equal((await active.json()).session.id, SESSION_A);
  const anonymous = await guard.filterSessionReadResponse(Response.json(null));
  assert.equal(await anonymous.json(), null);
});

test('sesiones: no se puede revocar una sesión ajena y el proveedor caído no deshace el bloqueo local', async (shared) => {
  await seed(shared);
  await assert.rejects(() => revokeAccountSession(USER, SESSION_OTHER, 'neon', async () => 'revoked'), /ya no está activo/);
  const providerDown = await revokeAccountSession(USER, SESSION_A, 'neon', async () => { throw new Error('provider down'); });
  assert.deepEqual(providerDown, { provider: 'unavailable' });
  assert.equal(await guard.neonSessionIsRevoked(SESSION_A), true);
  const again = await revokeAccountSession(USER, SESSION_A, 'neon', async () => 'not-found');
  assert.deepEqual(again, { provider: 'not-found' }, 'revoking twice is idempotent');
  await assert.rejects(() => revokeAccountSession(USER, 'x'.repeat(101), 'neon'), /inválida/);
});

test('sesiones: una falla al consultar revocaciones responde 503 y no finge sesión cerrada', async (shared) => {
  await seed(shared);
  shared.setDatabaseDown(true);
  await assert.rejects(() => guard.neonSessionIsRevoked(SESSION_A), (error) => error instanceof guard.SessionUnavailableError);
  const unavailable = await guard.guardAuthProxyRequest(new Request('https://papelito.test/api/auth/update-user', { method: 'POST', headers: { cookie: cookie('tok-a') } }), 'update-user', BASE);
  assert.equal(unavailable.status, 503);
  assert.equal((await unavailable.json()).code, 'SESSION_CHECK_UNAVAILABLE');
  assert.equal(unavailable.headers.getSetCookie().length, 0, 'an outage must not clear a valid session');
  const read = await guard.filterSessionReadResponse(Response.json({ session: { id: SESSION_A }, user: { id: USER } }));
  assert.equal(read.status, 503);
  shared.setDatabaseDown(false);
  providerUp = false;
  const providerOutage = await guard.guardAuthProxyRequest(new Request('https://papelito.test/api/auth/link-social', { method: 'POST', headers: { cookie: cookie('tok-a') } }), 'link-social', BASE);
  assert.equal(providerOutage.status, 503);
  providerUp = true;
  const guest = await guard.guardAuthProxyRequest(new Request('https://papelito.test/api/auth/update-user', { method: 'POST' }), 'update-user', BASE);
  assert.equal(guest, null, 'requests without a session cookie go to the provider, which rejects them');
});

test('registros: sin cookies, tokens, correos ni mensajes del controlador', async () => {
  const fields = sanitizeLogFields({ cookie: 'secret', token: 't', email: 'x@example.com', userName: 'Ana', sqlParams: '[1]', url: '/reset-password/abc', action: 'createExchange', status: 503, long: 'z'.repeat(500) });
  assert.deepEqual(Object.keys(fields).sort(), ['action', 'long', 'status']);
  assert.equal(fields.long.length, 120);
  const described = describeError(Object.assign(new Error('duplicate key (email)=(ana@example.com)'), { code: '23505' }));
  assert.deepEqual(described, { errorType: 'Error', errorCode: '23505' });
  assert.ok(!JSON.stringify(described).includes('example.com'));
});
