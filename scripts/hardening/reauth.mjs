// Re-authentication keeps the destination, and only internal destinations.
import assert from 'node:assert/strict';

const test = globalThis.__papelitoTest;
const { NextRequest } = await import('next/server.js');
const { POST } = await import('../../src/app/auth/logout/route.ts');

test('reingreso: vuelve al mismo lugar interno y nunca a otro sitio', async () => {
  const back = '/?vista=intercambio&intercambio=00000000-0000-4000-8000-000000000000&abrir=eliminar';
  const response = await POST(new NextRequest(`https://papelitocr.pages.dev/auth/logout?next=${encodeURIComponent(back)}`, { method: 'POST' }));
  assert.equal(response.status, 303);
  const location = new URL(response.headers.get('location'));
  assert.equal(location.searchParams.get('reingreso'), '1');
  assert.equal(location.searchParams.get('next'), back);
  assert.ok(response.headers.getSetCookie().some((c) => c.startsWith('__Secure-neon-auth.session_token=;')));
  for (const evil of ['//evil.example', 'https://evil.example', '/\\evil.example', '%2F%2Fevil.example']) {
    const blocked = await POST(new NextRequest(`https://papelitocr.pages.dev/auth/logout?next=${encodeURIComponent(evil)}`, { method: 'POST' }));
    const target = new URL(blocked.headers.get('location'));
    assert.equal(target.searchParams.get('next'), null, evil);
    assert.equal(target.host, 'papelitocr.pages.dev');
  }
});
