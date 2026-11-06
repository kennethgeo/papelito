// Block 2: idempotent retries, quotas, server-side validation and the
// versioned migration ledger (PGlite; real concurrency in test:concurrency).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

const test = globalThis.__papelitoTest;
const { getOrCreateProfile } = await import('../../src/lib/repositories/profiles.ts');
const ex = await import('../../src/lib/repositories/exchanges.ts');
const wishes = await import('../../src/lib/repositories/wishes.ts');
const { executeAndCommitDraw } = await import('../../src/lib/repositories/draw.ts');
const actions = await import('../../src/lib/data/server-actions.ts');
const { applyVersionedMigrations, MIGRATION_LEDGER_TABLE, inspectAndMigratePublicSchema } = await import('../db-migrate.mjs');
const { getCostaRicaTodayDate } = await import('../../src/lib/date/costa-rica.ts');

const base = { name: 'Límites ficticios', eventDate: '2099-12-24', registrationDeadline: '2099-12-10', budgetAmount: 5000, currency: 'CRC', suggestedTheme: 'navidad', selectedTheme: 'navidad', requiresApproval: true };

test('reintentos: el mismo intento devuelve el intercambio y la idea ya creados', async ({ query }) => {
  await getOrCreateProfile('retry', 'retry@example.com', 'Reintento');
  const attempt = randomUUID();
  const first = await ex.createExchangeWithInvitation('retry', { ...base, clientRequestId: attempt });
  const again = await ex.createExchangeWithInvitation('retry', { ...base, clientRequestId: attempt });
  assert.deepEqual(again, first);
  const other = await ex.createExchangeWithInvitation('retry', { ...base, clientRequestId: randomUUID() });
  assert.notEqual(other.exchangeId, first.exchangeId, 'a new attempt is a new exchange');
  const wishAttempt = randomUUID();
  const w1 = await wishes.saveWish('retry', { title: 'Libro', clientRequestId: wishAttempt });
  const w2 = await wishes.saveWish('retry', { title: 'Libro', clientRequestId: wishAttempt });
  assert.equal(w1.wishId, w2.wishId);
  assert.equal((await query("SELECT count(*)::int AS n FROM wishes WHERE user_id='retry'")).rows[0].n, 1);
});

test('cuotas: 20 intercambios activos y 100 ideas por persona, sin tocar lo existente', async ({ query }) => {
  await getOrCreateProfile('quota', 'quota@example.com', 'Cuota');
  for (let i = 0; i < ex.MAX_ACTIVE_ORGANIZED_EXCHANGES; i++) await ex.createExchangeWithInvitation('quota', { ...base, name: `Grupo ${i}` });
  await assert.rejects(() => ex.createExchangeWithInvitation('quota', base), /Ya organizás 20 intercambios activos/);
  const someone = (await query("SELECT id FROM exchanges WHERE organizer_id='quota' LIMIT 1")).rows[0].id;
  await ex.updateExchangeLifecycleStatus(someone, 'quota', 'cancelado');
  await ex.createExchangeWithInvitation('quota', base);
  for (let i = 0; i < wishes.MAX_WISHES_PER_PERSON; i++) await query("INSERT INTO wishes (user_id, title) VALUES ('quota', $1)", [`Idea ${i}`]);
  await assert.rejects(() => wishes.saveWish('quota', { title: 'Una más' }), /Ya tenés 100 ideas/);
  const existing = (await query("SELECT id FROM wishes WHERE user_id='quota' LIMIT 1")).rows[0].id;
  await wishes.saveWish('quota', { id: existing, title: 'Editada' });
  assert.equal((await query('SELECT title FROM wishes WHERE id=$1', [existing])).rows[0].title, 'Editada', 'editing is never blocked by the quota');
});

test('validación en servidor: fechas pasadas, enlaces largos, motivos largos y reglas excesivas', async () => {
  const today = getCostaRicaTodayDate();
  const past = actions.createExchangeAction({ ...base, registrationDeadline: '2020-01-01', eventDate: today });
  assert.match((await past).error, /fecha pasada/);
  assert.match((await actions.createExchangeAction({ ...base, clientRequestId: 'no-es-uuid' })).error, /Intento de creación inválido/);
  assert.match((await actions.saveWishAction({ title: 'Idea', url: `https://example.com/${'a'.repeat(2100)}` })).error, /demasiado largo/);
  assert.match((await actions.triggerDrawAction('00000000-0000-4000-8000-000000000000', 1, 'x'.repeat(501))).error, /hasta 500/);
  const rules = Array.from({ length: 2001 }, () => ({ giverUserId: 'a', excludedReceiverUserId: 'b' }));
  assert.match((await actions.setExchangeExclusionsAction('00000000-0000-4000-8000-000000000000', rules)).error, /inválidos/);
});

test('sorteo y restricciones: duplicados ignorados y motivo acotado en el repositorio', async ({ query }) => {
  for (const id of ['d1', 'd2', 'd3']) await getOrCreateProfile(id, `${id}@example.com`, `Persona ${id}`);
  const { exchangeId, inviteToken } = await ex.createExchangeWithInvitation('d1', base);
  for (const id of ['d2', 'd3']) { await ex.acceptInvitationAtomic(inviteToken, id); await ex.manageMemberStatus(exchangeId, id, 'approved', 'd1'); }
  await ex.setExchangeExclusions(exchangeId, 'd1', Array.from({ length: 50 }, () => ({ giverUserId: 'd2', excludedReceiverUserId: 'd3' })));
  assert.equal((await query('SELECT count(*)::int AS n FROM exclusions WHERE exchange_id=$1', [exchangeId])).rows[0].n, 1);
  await executeAndCommitDraw(exchangeId, 'd1', 0);
  await assert.rejects(() => executeAndCommitDraw(exchangeId, 'd1', 1, 'x'.repeat(501)), /hasta 500/);
});

test('migraciones versionadas: se registran con SHA-256, no se repiten y no aceptan cambios', async () => {
  const fresh = new PGlite();
  const migrationSql = fs.readFileSync('neon/migrations/20261016_init_papelito_neon.sql', 'utf8');
  await inspectAndMigratePublicSchema(fresh, migrationSql);
  assert.deepEqual(await applyVersionedMigrations(fresh), ['20261102_idempotency_and_limits.sql','20261106_organization.sql']);
  assert.deepEqual(await applyVersionedMigrations(fresh), [], 'second run is a no-op');
  const noop = await inspectAndMigratePublicSchema(fresh, migrationSql);
  assert.equal(noop.status, 'noop', 'the ledger table is not treated as a foreign table');
  await fresh.query(`UPDATE ${MIGRATION_LEDGER_TABLE} SET sha256 = 'otro'`);
  await assert.rejects(() => applyVersionedMigrations(fresh), /cambió después de aplicarse/);
  await fresh.close();
});

test('sorteo imposible: el error nombra el alias, nunca el identificador interno', async () => {
  for (const [id, alias] of [['al1', 'Ana'], ['al2', 'Beto'], ['al3', 'Caro']]) await getOrCreateProfile(id, `${id}@example.com`, alias);
  const { exchangeId, inviteToken } = await ex.createExchangeWithInvitation('al1', base);
  for (const id of ['al2', 'al3']) { await ex.acceptInvitationAtomic(inviteToken, id); await ex.manageMemberStatus(exchangeId, id, 'approved', 'al1'); }
  await ex.setExchangeExclusions(exchangeId, 'al1', [{ giverUserId: 'al2', excludedReceiverUserId: 'al1' }, { giverUserId: 'al2', excludedReceiverUserId: 'al3' }]);
  await assert.rejects(() => executeAndCommitDraw(exchangeId, 'al1', 0), (error) => /^Beto no tiene a quién regalar/.test(error.message) && !error.message.includes('al2'));
});

test('recursos: las mutaciones no invalidan una caché compartida que la app no usa', async () => {
  for (const file of ['src/lib/data/server-actions.ts', 'src/lib/data/selected-actions.ts', 'src/lib/data/social-actions.ts', 'src/lib/data/photo-actions.ts', 'src/lib/data/passkey-actions.ts']) {
    assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /revalidatePath|revalidateTag|updateTag/, file);
  }
  assert.doesNotMatch(fs.readFileSync('vite.config.ts', 'utf8'), /kvDataAdapter\(/);
  assert.doesNotMatch(fs.readFileSync('cloudflare.config.ts', 'utf8'), /VINEXT_KV_CACHE/);
  const pages = fs.readdirSync('src', { recursive: true }).filter((f) => /\.(ts|tsx)$/.test(f));
  for (const f of pages) assert.doesNotMatch(fs.readFileSync(`src/${f}`, 'utf8'), /['"]use cache['"]|unstable_cache\(/, f);
});

test('consultas: el snapshot con detalle y asignación usa menos viajes a la base', async ({ query }) => {
  const { setTestDbAdapter } = await import('../../src/lib/db/client.ts');
  const { readAppSnapshot } = await import('../../src/lib/repositories/app-snapshot.ts');
  for (const id of ['q1', 'q2', 'q3']) await getOrCreateProfile(id, `${id}@example.com`, `Persona ${id}`);
  const { exchangeId, inviteToken } = await ex.createExchangeWithInvitation('q1', base);
  for (const id of ['q2', 'q3']) { await ex.acceptInvitationAtomic(inviteToken, id); await ex.manageMemberStatus(exchangeId, id, 'approved', 'q1'); }
  await executeAndCommitDraw(exchangeId, 'q1', 0);
  let count = 0;
  setTestDbAdapter({ query: async (sql, params) => { count++; return query(sql, params); } });
  try {
    const snapshot = await readAppSnapshot('q2', { hasCurrentConsent: true, latestVersion: 'x' }, exchangeId);
    assert.ok(snapshot.selected?.assignment, 'the participant sees their own assignment');
    assert.equal(snapshot.selected.details.invitationToken, null, 'participants never receive the invitation token');
    assert.ok(count <= 9, `snapshot used ${count} queries (was 14 before grouping)`);
    count = 0;
    const organizer = await readAppSnapshot('q1', { hasCurrentConsent: true, latestVersion: 'x' }, exchangeId);
    assert.ok(organizer.selected.details.invitationToken === null || typeof organizer.selected.details.invitationToken === 'string');
    assert.ok(count <= 9, `organizer snapshot used ${count} queries`);
    await assert.rejects(() => ex.getExchangeDetails(exchangeId, 'outsider'), /No tenés acceso/);
  } finally {
    setTestDbAdapter({ query });
  }
});
