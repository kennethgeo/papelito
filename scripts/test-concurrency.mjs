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
  const organization=await import('../src/lib/repositories/organization.ts');
  for(const u of ['slot-one','slot-two','slot-three'])await getOrCreateProfile(u,`${u}@example.com`,u);
  const limited=await ex.createExchangeWithInvitation('org',{...input,name:'Tres cupos',requiresApproval:false});
  await organization.saveOrganization(limited.exchangeId,'org',{capacity:3,rules:'',revision:0});
  await ex.acceptInvitationAtomic(limited.inviteToken,'slot-one');
  const joined=await Promise.all(['slot-two','slot-three'].map(u=>ex.acceptInvitationAtomic(limited.inviteToken,u)));
  assert.equal(joined.filter(r=>r.status==='approved').length,1);
  assert.equal(joined.filter(r=>r.status==='pending').length,1);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM memberships WHERE exchange_id=$1 AND status='approved'",[limited.exchangeId])).rows[0].n,3);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM exchange_waitlist WHERE exchange_id=$1',[limited.exchangeId])).rows[0].n,1);
  console.log('PASS concurrencia: dos ingresos compiten por el último cupo; solo uno entra y el otro queda en espera.');

  // Personal links: an opening runs in one transaction that shares a lock on the
  // exchange with replacing the link and drawing again, so it sees each of them
  // entirely before or entirely after.
  const { executeAndCommitDraw } = await import('../src/lib/repositories/draw.ts');
  const selected = await import('../src/lib/repositories/selected-features.ts');
  const links = await import('../src/lib/repositories/personal-links.ts');
  const family = ['pl-org', 'pl-guardian', 'pl-ana', 'pl-beto'];
  for (const id of family) await getOrCreateProfile(id, `${id}@example.com`, id);
  const linked = await ex.createExchangeWithInvitation('pl-org', { ...input, name: 'Enlaces personales', requiresApproval: false });
  for (const id of family.slice(1)) await ex.acceptInvitationAtomic(linked.inviteToken, id);
  const elder = await selected.addRepresented(linked.exchangeId, 'pl-guardian', 'pl-abuela', true, 'personal');
  // Each wish names its owner, to detect a papelito that mixes two people.
  for (const id of family) { const w = await wishes.saveWish(id, { title: `Idea de ${id}` }); await wishes.toggleWishInExchange(id, linked.exchangeId, w.wishId, true); }
  await selected.representedWish(linked.exchangeId, 'pl-guardian', elder, 'Idea de pl-abuela');
  const tokenOf = (created) => created.path.split('#')[1];
  let token = tokenOf(await links.createPersonalLink(linked.exchangeId, 'pl-guardian', elder));
  await executeAndCommitDraw(linked.exchangeId, 'pl-org', 0);
  const receiverNow = async () => (await pool.query(`SELECT p.alias FROM assignments a JOIN profiles p ON p.user_id = a.receiver_id
    JOIN exchanges e ON e.id = a.exchange_id JOIN draw_versions dv ON dv.id = a.draw_version_id AND dv.version_number = e.current_draw_version
    WHERE a.exchange_id = $1 AND a.giver_id = $2`, [linked.exchangeId, elder])).rows[0].alias;
  const coherent = (papelito) => papelito.wishes.length === 1 && papelito.wishes[0].title === `Idea de ${papelito.receiverAlias}`;

  const together = await Promise.all(Array.from({ length: 8 }, () => links.openPersonalLink(token)));
  assert(together.every((r) => r.papelito && coherent(r.papelito)), 'every simultaneous opening gets the papelito');
  assert.equal(together.filter((r) => r.papelito.firstTimeNow).length, 1, 'exactly one opening is the first');
  assert.equal(new Set(together.map((r) => r.papelito.firstOpenedAt)).size, 1, 'all of them show the same first opening');
  assert.equal((await pool.query('SELECT open_count FROM represented_access_links WHERE revoked_at IS NULL AND represented_user_id = $1', [elder])).rows[0].open_count, 8);
  console.log('PASS concurrencia: ocho aperturas simultáneas del mismo enlace; una sola es la primera y todas quedan registradas.');

  for (let round = 0; round < 12; round++) {
    const previous = token;
    const [renewed, ...openings] = await Promise.all([
      links.createPersonalLink(linked.exchangeId, 'pl-guardian', elder),
      ...Array.from({ length: 4 }, () => links.openPersonalLink(previous)),
    ]);
    token = tokenOf(renewed);
    for (const opening of openings) {
      assert(opening.papelito ? coherent(opening.papelito) : opening.preview.state === 'invalid', 'an opening is complete or refused, never partial');
    }
    const row = (await pool.query(`SELECT open_count, revoked_at FROM represented_access_links WHERE token_hash = encode(sha256($1::bytea), 'hex')`, [Buffer.from(previous)])).rows[0];
    assert(row.revoked_at, 'the previous link was replaced');
    const before = round === 0 ? 8 : 0;
    assert.equal(row.open_count - before, openings.filter((o) => o.papelito).length, 'every served opening was recorded on the link that served it');
    assert.equal((await links.openPersonalLink(previous)).preview.state, 'invalid', 'the replaced link never works again');
  }
  assert((await links.openPersonalLink(token)).papelito, 'the newest link works');
  console.log('PASS concurrencia: abrir mientras se reemplaza el enlace; cada apertura se sirve completa y registrada, o se rechaza.');

  let version = 1;
  for (let round = 0; round < 10; round++) {
    const before = await receiverNow();
    const [, ...openings] = await Promise.all([
      executeAndCommitDraw(linked.exchangeId, 'pl-org', version, 'Sorteo nuevo de prueba'),
      ...Array.from({ length: 4 }, () => links.openPersonalLink(token)),
    ]);
    version++;
    const after = await receiverNow();
    for (const opening of openings) {
      assert(opening.papelito, 'the link keeps working across a new draw');
      assert(coherent(opening.papelito), 'receiver and wishes come from the same draw');
      assert([before, after].includes(opening.papelito.receiverAlias), 'the papelito is the previous or the new one, nothing else');
    }
    const settled = await links.openPersonalLink(token);
    assert.equal(settled.papelito.receiverAlias, after, 'after the new draw, the papelito is the new one');
    assert(coherent(settled.papelito));
  }
  console.log('PASS concurrencia: abrir mientras se repite el sorteo; nunca se mezclan dos sorteos y al terminar se ve el nuevo.');
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
