// Passkey attempts: starting a sign-in writes nothing (no global cap to
// exhaust); tampered, expired and replayed attempts are rejected.
import assert from 'node:assert/strict';

const test = globalThis.__papelitoTest;
const keys = await import('../../src/lib/repositories/passkeys.ts');

test('passkeys: mil intentos anónimos no agotan nada y la persona legítima puede empezar', async ({ query }) => {
  const before = (await query('SELECT count(*)::int AS n FROM webauthn_challenges')).rows[0].n;
  for (let i = 0; i < 1000; i++) await keys.authenticationOptions('http://localhost:3042');
  assert.equal((await query('SELECT count(*)::int AS n FROM webauthn_challenges')).rows[0].n, before, 'starting writes no rows');
  const legit = await keys.authenticationOptions('http://localhost:3042');
  assert.ok(legit.token && legit.options.challenge);
});

test('passkeys: intentos alterados, vencidos o repetidos se rechazan', async () => {
  const { token } = await keys.authenticationOptions('http://localhost:3042');
  const [body, mac] = token.split('.');
  const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url').toString()), e: Date.now() + 3_600_000 })).toString('base64url');
  await assert.rejects(() => keys.finishAuthentication(`${forged}.${mac}`, { id: 'x', response: {} }, 'ua', 'http://localhost:3042'), /venció/);
  await assert.rejects(() => keys.finishAuthentication('basura', { id: 'x', response: {} }, 'ua', 'http://localhost:3042'), /venció/);
  // First use is consumed even though the fictitious credential is unknown...
  await assert.rejects(() => keys.finishAuthentication(token, { id: 'desconocida', response: {} }, 'ua', 'http://localhost:3042'), /No pudimos verificar/);
  // ...so the same attempt cannot be replayed.
  await assert.rejects(() => keys.finishAuthentication(token, { id: 'desconocida', response: {} }, 'ua', 'http://localhost:3042'), /ya se utilizó/);
  const realNow = Date.now;
  try {
    const fresh = await keys.authenticationOptions('http://localhost:3042');
    Date.now = () => realNow() + 6 * 60 * 1000;
    await assert.rejects(() => keys.finishAuthentication(fresh.token, { id: 'x', response: {} }, 'ua', 'http://localhost:3042'), /venció/);
  } finally {
    Date.now = realNow;
  }
});
