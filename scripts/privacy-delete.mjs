import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { register } from 'node:module';
import { loadEnvFiles, verifyNeonLinkFile, validateMigrationUrls, EXPECTED_NEON_CONFIG } from './db-migrate.mjs';

register('./ts-loader.mjs', import.meta.url);
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parsePrivacyDeleteArgs(argv = process.argv.slice(2)) {
  const opts = { list: false, requestId: null, execute: false, confirmOrganizerTransfer: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--list') opts.list = true;
    else if (arg === '--execute') opts.execute = true;
    else if (arg === '--dry-run') opts.execute = false;
    else if (arg === '--confirm-organizer-transfer') opts.confirmOrganizerTransfer = true;
    else if (arg === '--request-id' && argv[i + 1]) opts.requestId = argv[++i];
    else throw new Error(`Opción inválida: ${arg}`);
  }
  if (opts.requestId && !UUID.test(opts.requestId)) throw new Error('request-id debe ser un UUID.');
  if (opts.execute && !opts.requestId) throw new Error('--execute requiere una solicitud concreta --request-id.');
  return opts;
}

export function deleteManagedAuthUser(userId) {
  if (!UUID.test(userId)) throw new Error('Identificador Auth inválido.');
  const args = ['neon-auth', 'user', 'delete', userId, '--project-id', EXPECTED_NEON_CONFIG.projectId, '--branch', EXPECTED_NEON_CONFIG.branch];
  if (process.platform === 'win32') {
    // Execute npm's JS entry with Node, without interpolating a shell command.
    const cli = (process.env.PATH || '').split(path.delimiter)
      .map(dir => path.join(dir, 'node_modules', 'neon', 'dist', 'cli.js'))
      .find(candidate => fs.existsSync(candidate));
    if (!cli) throw new Error('No se encontró la CLI de Neon. Instalá npm i -g neon.');
    execFileSync(process.execPath, [cli, ...args], { stdio: 'pipe', timeout: 60000 });
  } else execFileSync('neon', args, { stdio: 'pipe', timeout: 60000 });
}

/** Auth failures preserve the request and application data so an operator can retry. */
export async function processPrivacyDeletion(requestId, options, deps) {
  if (!UUID.test(requestId)) throw new Error('Solicitud inválida.');
  return deps.transaction(async client => {
    const request = await client.query(`SELECT user_id, status FROM privacy_requests
      WHERE id=$1 AND request_type='delete' AND status IN ('received','processing') FOR UPDATE`, [requestId]);
    if (!request.rowCount) throw new Error('No existe una solicitud de baja pendiente con ese identificador.');
    const userId = request.rows[0].user_id;
    if (!UUID.test(userId)) throw new Error('Identidad inválida para Neon Auth.');
    await client.query('SELECT user_id FROM profiles WHERE user_id=$1 FOR UPDATE', [userId]);
    await client.query(`SELECT id FROM exchanges WHERE organizer_id=$1 OR id IN
      (SELECT exchange_id FROM memberships WHERE user_id=$1) ORDER BY id FOR UPDATE`, [userId]);

    // Validate the entire deletion before touching Auth, then roll back the preview.
    await client.query('SAVEPOINT deletion_preflight');
    const plan = await deps.purge(client, userId, { confirmOrganizerImpact: options.confirmOrganizerTransfer });
    await client.query('ROLLBACK TO SAVEPOINT deletion_preflight');
    await client.query('RELEASE SAVEPOINT deletion_preflight');
    if (!options.execute) return { dryRun: true, ...plan };

    await client.query("UPDATE privacy_requests SET status='processing' WHERE id=$1", [requestId]);
    if (await deps.authUserExists(client, userId)) await deps.deleteAuthUser(userId);
    if (await deps.authUserExists(client, userId)) throw new Error('Neon Auth aún conserva la cuenta; no se borraron sus datos.');
    return { dryRun: false, authDeleted: true,
      ...await deps.purge(client, userId, { confirmOrganizerImpact: options.confirmOrganizerTransfer }) };
  });
}

async function runCli() {
  const opts = parsePrivacyDeleteArgs();
  loadEnvFiles(rootDir);
  verifyNeonLinkFile(rootDir);
  validateMigrationUrls(process.env.DATABASE_URL, process.env.DATABASE_URL_UNPOOLED);
  const { dbQuery, dbTransaction, closeDbPool } = await import('../src/lib/db/client.ts');
  const { purgeUserAppDataWithClient } = await import('../src/lib/repositories/profiles.ts');
  try {
    if (opts.list || !opts.requestId) {
      const result = await dbQuery(`SELECT id, user_id, status, created_at FROM privacy_requests
        WHERE request_type='delete' AND status IN ('received','processing') ORDER BY created_at`);
      console.log(JSON.stringify({ pendingRequests: result.rows }, null, 2));
      if (!opts.requestId) return;
    }
    const result = await processPrivacyDeletion(opts.requestId, opts, {
      transaction: dbTransaction, purge: purgeUserAppDataWithClient, deleteAuthUser: deleteManagedAuthUser,
      authUserExists: async (client, userId) => {
        const r = await client.query('SELECT id FROM neon_auth."user" WHERE id=$1', [userId]);
        return r.rowCount > 0;
      },
    });
    console.log(JSON.stringify(result, null, 2));
  } finally { await closeDbPool(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runCli().catch(() => {
    // Never dump child-process errors, which may contain provider credentials.
    console.error('No se completó la baja. Revisá la solicitud, el impacto y la sesión de la CLI de Neon; podés reintentar el mismo request-id. Un error nunca se considera eliminación exitosa.');
    process.exitCode = 1;
  });
}
