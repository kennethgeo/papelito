// CSP report-only endpoint: accepts both report formats, logs only the
// directive, the kind/origin of what would be blocked and the page path with
// ids removed; never query strings, samples or full URLs.
import assert from 'node:assert/strict';

const test = globalThis.__papelitoTest;
const { POST } = await import('../../src/app/api/csp-report/route.ts');

async function capture(fn) {
  const lines = [];
  const original = console.warn;
  console.warn = (line) => lines.push(String(line));
  try { return { result: await fn(), lines }; } finally { console.warn = original; }
}

const post = (body, type = 'application/csp-report') => POST(new Request('https://papelito.test/api/csp-report', {
  method: 'POST', headers: { 'content-type': type }, body: typeof body === 'string' ? body : JSON.stringify(body),
}));

test('csp: reportes sin datos personales, ambos formatos y entradas inválidas', async () => {
  const legacy = await capture(() => post({ 'csp-report': {
    'document-uri': 'https://papelito.test/unirse/token-secreto-0123456789abcdef?correo=persona@example.com',
    'violated-directive': 'img-src', 'effective-directive': 'img-src',
    'blocked-uri': 'https://tienda.example/foto.jpg?usuario=persona', 'script-sample': 'Nombre Persona', disposition: 'report',
  } }));
  assert.equal(legacy.result.status, 204);
  assert.equal(legacy.lines.length, 1);
  const logged = JSON.parse(legacy.lines[0]);
  assert.deepEqual(logged, { event: 'csp_violation', directive: 'img-src', blocked: 'https://tienda.example', path: '/unirse/:id', disposition: 'report' });
  assert(!/secreto|persona|Nombre|correo|usuario/.test(legacy.lines[0]));

  const modern = await capture(() => post([
    { type: 'csp-violation', url: 'https://papelito.test/?vista=deseos', body: { documentURL: 'https://papelito.test/?vista=deseos', effectiveDirective: 'script-src-elem', blockedURL: 'inline', disposition: 'report', sample: 'alert(1)' } },
    { type: 'deprecation', body: { message: 'otra cosa' } },
  ], 'application/reports+json'));
  assert.equal(modern.result.status, 204);
  assert.deepEqual(modern.lines.map((line) => JSON.parse(line)), [{ event: 'csp_violation', directive: 'script-src-elem', blocked: 'inline', path: '/', disposition: 'report' }]);

  const many = await capture(() => post(Array.from({ length: 50 }, () => ({ type: 'csp-violation', body: { effectiveDirective: 'img-src', blockedURL: 'data' } })), 'application/reports+json'));
  assert.equal(many.lines.length, 10, 'at most ten reports are logged per request');

  assert.equal((await post('{}', 'text/plain')).status, 415);
  assert.equal((await post('no es json')).status, 400);
  assert.equal((await post('x'.repeat(20_000))).status, 413);
});
