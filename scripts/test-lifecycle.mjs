import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { register } from 'node:module';
import { PGlite } from '@electric-sql/pglite';

register('./ts-loader.mjs', import.meta.url);
process.env.NODE_ENV = 'test';
const { setTestDbAdapter, dbTransaction } = await import('../src/lib/db/client.ts');
const { updateExchangeLifecycleStatus, transferExchangeOrganizer } = await import('../src/lib/repositories/exchanges.ts');
const { requestAccountDeletion, getAccountDeletionImpact, purgeUserAppDataWithClient } = await import('../src/lib/repositories/profiles.ts');
const { executeAndCommitDraw } = await import('../src/lib/repositories/draw.ts');
const { getMyAssignment } = await import('../src/lib/repositories/assignments.ts');
const { purgeExpiredClosedExchangesWithClient, runNetlifyScheduledRetentionEvent } = await import('../src/lib/retention/cleanup.ts');
const { parsePrivacyDeleteArgs, processPrivacyDeletion } = await import('./privacy-delete.mjs');
const pg = new PGlite();
for (const file of ['20261016_init_papelito_neon.sql', '20261017_retention_and_lifecycle.sql']) {
  await pg.exec(fs.readFileSync(new URL(`../neon/migrations/${file}`, import.meta.url), 'utf8'));
}
const client = { async query(sql, params = []) {
  const r = await pg.query(sql, params);
  return { rows: r.rows, rowCount: r.rows.length || r.affectedRows || 0 };
} };
setTestDbAdapter(client);
const now = new Date('2026-10-17T18:00:00Z');
const users = Array.from({ length: 5 }, () => randomUUID());
for (const [i, id] of users.entries()) await client.query('INSERT INTO profiles(user_id,alias,full_name) VALUES($1,$2,$2)', [id, `Persona ${i}`]);

async function group(owner, members = [], status = 'inscripcion_abierta', closedAt = null) {
  const r = await client.query(`INSERT INTO exchanges(organizer_id,name,event_date,registration_deadline,budget_amount,currency,suggested_theme,selected_theme,status,closed_at)
    VALUES($1,'Prueba aislada','2026-12-25','2026-12-18',15000,'CRC','navidad','navidad',$2,$3) RETURNING id`, [owner, status, closedAt]);
  const id = r.rows[0].id;
  for (const [i, uid] of [owner, ...members].entries()) await client.query(`INSERT INTO memberships(exchange_id,user_id,status,is_organizer,joined_at) VALUES($1,$2,'approved',$3,$4)`, [id, uid, i === 0, new Date(now.getTime() + i * 1000)]);
  await client.query(`INSERT INTO invitations(exchange_id,token_hash,encrypted_token,expires_at,created_by) VALUES($1,$2,'test-only','2026-12-18',$3)`, [id, randomUUID(), owner]);
  return id;
}
try {
  const a = await group(users[0], [users[1], users[2]]);
  await assert.rejects(updateExchangeLifecycleStatus(a, users[1], 'cancelado'), /Solo/);
  await assert.rejects(updateExchangeLifecycleStatus(a, users[0], 'finalizado'), /Solo se puede/);
  await assert.rejects(transferExchangeOrganizer(a, users[0], users[4]), /aprobado/);
  await transferExchangeOrganizer(a, users[0], users[1]);
  await assert.rejects(updateExchangeLifecycleStatus(a, users[0], 'cancelado'), /Solo/);
  const flags = await client.query('SELECT user_id FROM memberships WHERE exchange_id=$1 AND is_organizer', [a]);
  assert.deepEqual(flags.rows.map(r => r.user_id), [users[1]]);
  await executeAndCommitDraw(a, users[1], 0);
  const assignments = await Promise.all([users[0], users[1], users[2]].map(id => getMyAssignment(a, id)));
  assert.equal(new Set(assignments.map(r => r.receiverId)).size, 3);
  for (let i = 0; i < assignments.length; i++) assert.notEqual(assignments[i].receiverId, users[i]);
  assert.equal(await getMyAssignment(a, users[4]), null);
  const close = await updateExchangeLifecycleStatus(a, users[1], 'finalizado', now);
  assert.equal(new Date(close.closedAt).toISOString(), now.toISOString());
  assert.equal((await updateExchangeLifecycleStatus(a, users[1], 'finalizado', new Date('2026-11-17'))).closedAt, close.closedAt);
  assert.equal((await client.query('SELECT id FROM invitations WHERE exchange_id=$1 AND revoked_at IS NULL', [a])).rowCount, 0);
  await assert.rejects(executeAndCommitDraw(a, users[1], 1, 'Intento tras cierre'), /estado/);
  console.log('PASS lifecycle: permisos, transferencia, sorteo privado de tres personas, cierre idempotente e invitaciones revocadas');

  const b = await group(users[3], [users[0], users[2]]);
  await executeAndCommitDraw(b, users[3], 0);
  const input = { confirmPhrase: 'ELIMINAR MI CUENTA', confirmIrreversible: true, sessionAuthenticatedAt: now, referenceNow: now };
  await assert.rejects(requestAccountDeletion(users[3], { ...input, confirmIrreversible: false }), /confirmar/);
  await assert.rejects(requestAccountDeletion(users[3], { ...input, sessionAuthenticatedAt: '2026-10-17T17:44:59Z' }), /15 minutos/);
  await assert.rejects(requestAccountDeletion(users[3], { ...input, sessionAuthenticatedAt: '2026-10-17T18:00:01Z' }), /15 minutos/);
  await assert.rejects(requestAccountDeletion(users[3], input), /Organizas/);
  const request = await requestAccountDeletion(users[3], { ...input, confirmOrganizerImpact: true });
  assert.equal(request.transferredExchanges[0].newOrganizerUserId, users[0]);
  assert.equal((await requestAccountDeletion(users[3], input)).requestId, request.requestId);
  assert.equal((await getAccountDeletionImpact(users[3])).activeDeleteRequest.id, request.requestId);
  console.log('PASS solicitudes: autenticación reciente, confirmación de impacto, transferencia y reintento sin duplicar');

  const pendingOnly = await group(users[4], [users[2]]);
  await client.query("UPDATE memberships SET status='pending' WHERE exchange_id=$1 AND user_id=$2", [pendingOnly, users[2]]);
  const pendingRequest = await requestAccountDeletion(users[4], { ...input, confirmOrganizerImpact: true });
  assert.equal(pendingRequest.canceledExchanges[0].id, pendingOnly);
  assert.equal((await client.query('SELECT status FROM exchanges WHERE id=$1', [pendingOnly])).rows[0].status, 'cancelado');
  assert.equal((await client.query('SELECT id FROM invitations WHERE exchange_id=$1 AND revoked_at IS NULL', [pendingOnly])).rowCount, 0);

  assert.equal(parsePrivacyDeleteArgs(['--request-id', request.requestId]).execute, false);
  assert.throws(() => parsePrivacyDeleteArgs(['--execute']), /requiere/);
  const authIds = new Set([users[3]]);
  let calls = 0;
  const deps = { transaction: dbTransaction, purge: purgeUserAppDataWithClient,
    authUserExists: async (_, id) => authIds.has(id), deleteAuthUser: async id => { calls++; authIds.delete(id); } };
  const preview = await processPrivacyDeletion(request.requestId, { execute: false }, deps);
  assert.equal(preview.dryRun, true); assert.equal(calls, 0);
  assert.ok(await getMyAssignment(b, users[3]));
  await assert.rejects(processPrivacyDeletion(request.requestId, { execute: true }, { ...deps, deleteAuthUser: async () => { throw new Error('Auth no disponible'); } }), /Auth no disponible/);
  assert.ok(await getMyAssignment(b, users[3]));
  assert.equal((await client.query('SELECT status FROM privacy_requests WHERE id=$1', [request.requestId])).rows[0].status, 'received');
  let purgeCalls = 0;
  await assert.rejects(processPrivacyDeletion(request.requestId, { execute: true }, { ...deps, purge: async (...args) => {
    if (++purgeCalls === 2) throw new Error('Fallo después de Auth');
    return purgeUserAppDataWithClient(...args);
  } }), /Fallo después de Auth/);
  assert.equal(authIds.has(users[3]), false);
  assert.equal((await client.query('SELECT user_id FROM profiles WHERE user_id=$1', [users[3]])).rowCount, 1);
  const deleted = await processPrivacyDeletion(request.requestId, { execute: true }, deps);
  assert.equal(calls, 1); assert.equal(deleted.authDeleted, true); assert.equal(deleted.deletedProfile, true);
  assert.deepEqual(deleted.invalidatedDrawnExchangeIds, [b]);
  assert.equal(await getMyAssignment(b, users[0]), null);
  const invalid = await client.query('SELECT invalidation_reason FROM draw_versions WHERE exchange_id=$1', [b]);
  assert.match(invalid.rows[0].invalidation_reason, /eliminó/);
  assert.equal((await client.query('SELECT id FROM assignments WHERE exchange_id=$1', [b])).rowCount, 0);
  await assert.rejects(processPrivacyDeletion(request.requestId, { execute: true }, deps), /No existe/);
  console.log('PASS baja: simulación sin cambios, fallo Auth conserva datos, fallo posterior recuperable, borrado e invalidación sin revelar asignaciones');

  const old = await group(users[4], [], 'cancelado', '2025-10-17T18:00:00Z');
  const recent = await group(users[4], [], 'finalizado', '2025-10-17T18:00:00.001Z');
  const active = await group(users[4], [], 'inscripcion_abierta', '2020-01-01');
  const unknown = await group(users[4], [], 'cancelado');
  await client.query("INSERT INTO wishes(user_id,title) VALUES($1,'Lista personal conservada')", [users[4]]);
  const run = opts => dbTransaction(tx => purgeExpiredClosedExchangesWithClient(tx, { ...opts, referenceNow: now }));
  assert.equal((await run({ dryRun: true })).eligibleCount, 1);
  assert.equal((await client.query('SELECT id FROM exchanges WHERE id=$1', [old])).rowCount, 1);
  assert.equal((await run({})).deletedCount, 1);
  for (const id of [recent, active, unknown]) assert.equal((await client.query('SELECT id FROM exchanges WHERE id=$1', [id])).rowCount, 1);
  assert.equal((await client.query('SELECT id FROM invitations WHERE exchange_id=$1', [old])).rowCount, 0);
  assert.equal((await client.query('SELECT id FROM wishes WHERE user_id=$1', [users[4]])).rowCount, 1);
  assert.equal((await run({})).deletedCount, 0);
  await assert.rejects(run({ retentionMonths: 1 }), /al menos 12/);
  const handlerDeps = { runCleanup: run, referenceNow: now, env: {} };
  assert.equal((await runNetlifyScheduledRetentionEvent(new Request('https://example.test'), handlerDeps)).status, 405);
  assert.equal((await runNetlifyScheduledRetentionEvent(new Request('https://example.test', { method: 'POST', body: '{}' }), handlerDeps)).status, 400);
  assert.equal((await runNetlifyScheduledRetentionEvent(new Request('https://example.test', { method: 'POST', body: JSON.stringify({ next_run: '2026-10-18T00:00:00Z' }) }), handlerDeps)).status, 200);
  console.log('PASS retención: límite de 12 meses, 1ms antes, protección de activos y listas, cascada, idempotencia y evento programado');
  console.log('Todas las pruebas de ciclo de vida y privacidad pasaron.');
} finally { setTestDbAdapter(null); await pg.close(); }
