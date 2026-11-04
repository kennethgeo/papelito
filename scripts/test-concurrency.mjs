// Concurrency on a real PostgreSQL server (PGlite has a single connection and
// cannot show locking). Starts a throwaway local cluster with the PostgreSQL
// binaries of the machine (GitHub's Ubuntu runners include them), applies the
// migrations and runs simultaneous transactions through the real repositories.
// Fictitious data only; the cluster is deleted at the end.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { register } from 'node:module';
import { createServer } from 'node:net';
import { randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';

register('./ts-loader.mjs', import.meta.url);
process.env.NODE_ENV = 'test';
process.env.INVITATION_TOKEN_SECRET = randomBytes(32).toString('hex');

function findBin() {
  const fromPath = spawnSync('pg_config', ['--bindir'], { encoding: 'utf8' });
  const candidates = [fromPath.status === 0 ? fromPath.stdout.trim() : '', ...fs.existsSync('/usr/lib/postgresql') ? fs.readdirSync('/usr/lib/postgresql').sort().reverse().map((v) => `/usr/lib/postgresql/${v}/bin`) : []];
  return candidates.find((dir) => dir && fs.existsSync(path.join(dir, 'initdb')));
}
const bin = findBin();
if (!bin) {
  if (process.env.CI) throw new Error('PostgreSQL binaries not found (initdb).');
  console.log('SKIP concurrencia: no hay binarios de PostgreSQL en esta máquina.');
  process.exit(0);
}
const port = await new Promise((resolve) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const { port: p } = s.address(); s.close(() => resolve(p)); }); });
// As root the cluster runs as `postgres`, which must be able to reach the directory.
const dir = fs.mkdtempSync(path.join(process.getuid?.() === 0 ? '/tmp' : os.tmpdir(), 'papelito-pg-'));
// initdb refuses to run as root; use the postgres system user in that case.
const asUser = process.getuid?.() === 0 ? ['runuser', ['-u', 'postgres', '--']] : null;
const run = (cmd, args, opts = {}) => asUser ? spawnSync(asUser[0], [...asUser[1], cmd, ...args], opts) : spawnSync(cmd, args, opts);
if (asUser) spawnSync('chown', ['postgres', dir]);
const init = run(path.join(bin, 'initdb'), ['-D', path.join(dir, 'data'), '-A', 'trust', '-U', 'papelito', '--no-sync'], { encoding: 'utf8' });
if (init.status !== 0) throw new Error(init.stderr);
const server = asUser
  ? spawn(asUser[0], [...asUser[1], path.join(bin, 'postgres'), '-D', path.join(dir, 'data'), '-p', String(port), '-h', '127.0.0.1', '-k', dir, '-c', 'fsync=off'], { stdio: 'ignore' })
  : spawn(path.join(bin, 'postgres'), ['-D', path.join(dir, 'data'), '-p', String(port), '-h', '127.0.0.1', '-k', dir, '-c', 'fsync=off'], { stdio: 'ignore' });

const pool = new pg.Pool({ host: '127.0.0.1', port, user: 'papelito', database: 'postgres', max: 12 });
// The server can terminate idle pooled connections (57P01). pg-pool re-emits that
// on the pool and, without a listener, Node aborts the process. It is expected
// while stopping the server; at any other moment it fails the run.
let stopping = false;
const idleErrors = [];
pool.on('error', (error) => { if (!stopping) idleErrors.push(error); });
let openConnections = 0;
pool.on('connect', () => { openConnections++; });
pool.on('remove', () => { openConnections--; });
try {
  let ready = false;
  for (let i = 0; i < 100 && !ready && server.exitCode === null; i++) {
    try { await pool.query('SELECT 1'); ready = true; } catch { await new Promise((r) => setTimeout(r, 100)); }
  }
  if (!ready) throw new Error('The temporary PostgreSQL server did not start.');
  for (const file of fs.readdirSync('neon/migrations').sort()) await pool.query(fs.readFileSync(`neon/migrations/${file}`, 'utf8'));

  const { setTestDbAdapter } = await import('../src/lib/db/client.ts');
  const wrap = (c) => ({ async query(sql, params = []) { const r = await c.query(sql, params); return { rows: r.rows, rowCount: r.rowCount ?? r.rows.length }; } });
  setTestDbAdapter({
    ...wrap(pool),
    async transaction(callback) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await callback(wrap(client));
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
      } finally { client.release(); }
    },
  });
  const { getOrCreateProfile } = await import('../src/lib/repositories/profiles.ts');
  const ex = await import('../src/lib/repositories/exchanges.ts');
  const wishes = await import('../src/lib/repositories/wishes.ts');
  const input = { name: 'Concurrencia ficticia', eventDate: '2099-12-24', registrationDeadline: '2099-12-10', budgetAmount: 5000, currency: 'CRC', suggestedTheme: 'navidad', selectedTheme: 'navidad', requiresApproval: true };

  await getOrCreateProfile('org', 'org@example.com', 'Organiza');
  const requestId = randomUUID();
  const created = await Promise.all(Array.from({ length: 6 }, () => ex.createExchangeWithInvitation('org', { ...input, clientRequestId: requestId })));
  assert.equal(new Set(created.map((c) => c.exchangeId)).size, 1, 'six simultaneous retries create one exchange');
  assert.equal(new Set(created.map((c) => c.inviteToken)).size, 1, 'every retry gets the same invitation link');
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM exchanges WHERE organizer_id='org'")).rows[0].n, 1);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM invitations')).rows[0].n, 1);
  console.log('PASS concurrencia: seis reintentos simultáneos de crear un intercambio dejan uno y el mismo enlace.');

  const wishRequest = randomUUID();
  const saved = await Promise.all(Array.from({ length: 6 }, () => wishes.saveWish('org', { title: 'Idea ficticia', clientRequestId: wishRequest })));
  assert.equal(new Set(saved.map((w) => w.wishId)).size, 1);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM wishes WHERE user_id='org'")).rows[0].n, 1);
  console.log('PASS concurrencia: seis reintentos simultáneos de guardar una idea dejan una.');

  await getOrCreateProfile('busy', 'busy@example.com', 'Muy activa');
  for (let i = 0; i < ex.MAX_ACTIVE_ORGANIZED_EXCHANGES - 1; i++) await ex.createExchangeWithInvitation('busy', { ...input, name: `Grupo ${i}` });
  const race = await Promise.allSettled([ex.createExchangeWithInvitation('busy', { ...input, name: 'Último A' }), ex.createExchangeWithInvitation('busy', { ...input, name: 'Último B' })]);
  assert.equal(race.filter((r) => r.status === 'fulfilled').length, 1, 'the quota holds under simultaneous creation');
  assert.match(race.find((r) => r.status === 'rejected').reason.message, /Ya organizás 20 intercambios activos/);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM exchanges WHERE organizer_id='busy'")).rows[0].n, ex.MAX_ACTIVE_ORGANIZED_EXCHANGES);
  console.log('PASS concurrencia: la cuota de intercambios activos se respeta con creaciones simultáneas.');

  await assert.rejects(pool.query("INSERT INTO exchanges (organizer_id, name, event_date, registration_deadline, budget_amount, currency, suggested_theme, selected_theme, client_request_id) VALUES ('org','x','2099-01-01','2099-01-01',1,'CRC','general','general',$1)", [requestId]), /uq_exchanges_client_request/);
  console.log('PASS base de datos: el índice único impide duplicar un intento aunque se salte el repositorio.');
  if (idleErrors.length) throw idleErrors[0];
} finally {
  stopping = true;
  await pool.end().catch(() => undefined);
  // pool.end() resolves once every connection was asked to close, not once it
  // closed: wait for them before stopping the server.
  for (let i = 0; i < 100 && openConnections > 0; i++) await new Promise((r) => setTimeout(r, 50));
  if (server.exitCode === null) {
    const exited = new Promise((r) => server.once('exit', r));
    server.kill('SIGINT');
    await Promise.race([exited, new Promise((r) => setTimeout(r, 10_000))]);
  }
  fs.rmSync(dir, { recursive: true, force: true });
}
