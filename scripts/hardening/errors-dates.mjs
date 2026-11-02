// FUN-06 / OPS-02: timestamps travel as ISO 8601 and never break rendering;
// only messages written for people reach the browser.
import assert from 'node:assert/strict';

const test = globalThis.__papelitoTest;
const { toIsoTimestamp, formatTimestamp } = await import('../../src/lib/date/timestamps.ts');
const { PublicError, publicErrorMessage } = await import('../../src/lib/data/errors.ts');

test('fechas: el texto de PostgreSQL se normaliza a ISO y lo inválido no rompe la pantalla', async ({ query }) => {
  assert.equal(toIsoTimestamp('2026-11-02 14:00:00.123456+00'), '2026-11-02T14:00:00.123Z');
  assert.equal(toIsoTimestamp('2026-11-02 08:00:00-06'), '2026-11-02T14:00:00.000Z');
  assert.equal(toIsoTimestamp('2026-11-02 14:00:00+05:30'), '2026-11-02T08:30:00.000Z');
  assert.equal(toIsoTimestamp('2026-11-02T14:00:00Z'), '2026-11-02T14:00:00.000Z');
  for (const invalid of ['', null, undefined, 'mañana', '2026-13-45 99:00:00+00', 42]) assert.equal(toIsoTimestamp(invalid), null, String(invalid));
  const fromDb = (await query("SELECT '2026-12-24 18:30:00-06'::timestamptz::text AS t")).rows[0].t;
  assert.equal(toIsoTimestamp(fromDb), '2026-12-25T00:30:00.000Z');
  assert.match(formatTimestamp(fromDb, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }), /24/, 'shown in Costa Rica time');
  assert.equal(formatTimestamp('no es una fecha', { dateStyle: 'medium' }, 'fecha no disponible'), 'fecha no disponible');
});

test('errores: solo los mensajes públicos llegan al navegador; el resto se registra sin su texto', async () => {
  const lines = [];
  const original = console.error;
  console.error = (line) => lines.push(String(line));
  try {
    assert.equal(publicErrorMessage(new PublicError('Solo quien organiza puede hacerlo.'), 'Genérico'), 'Solo quien organiza puede hacerlo.');
    const driver = Object.assign(new Error('invalid input syntax for type uuid: "ana@example.com"'), { code: '22P02' });
    assert.equal(publicErrorMessage(driver, 'No pudimos guardar.'), 'No pudimos guardar.');
    assert.equal(publicErrorMessage(new TypeError('Error connecting to database: fetch failed'), 'No pudimos guardar.'), 'No pudimos guardar.');
  } finally {
    console.error = original;
  }
  assert.equal(lines.length, 2);
  assert.ok(lines.every((line) => !line.includes('example.com') && !line.includes('connecting')), lines.join('\n'));
  assert.ok(lines[0].includes('"errorCode":"22P02"'));
});

test('registros de Neon Auth: sin URLs con tokens ni detalles del error', async () => {
  const { neonAuthLogger } = await import('../../src/lib/observability/log.ts');
  const lines = [];
  const original = console.warn;
  console.warn = (line) => lines.push(String(line));
  try {
    neonAuthLogger.warn('[trySessionCache] Invalid session cookie, minting new one:', { url: 'https://papelito.test/api/auth/reset-password/secreto123?callbackURL=x', detail: 'JWT for ana@example.com', err: new Error('x'), component: 'server-api', status: 401, path: '/neondb/auth/reset-password/AbCdEf0123456789xyz?token=1' });
  } finally {
    console.warn = original;
  }
  assert.equal(lines.length, 1);
  assert.ok(!/secreto123|example\.com|callbackURL/.test(lines[0]), lines[0]);
  assert.match(lines[0], /"component":"server-api"/);
  assert.match(lines[0], /"path":"\/neondb\/auth\/reset-password\/:id"/);
});
