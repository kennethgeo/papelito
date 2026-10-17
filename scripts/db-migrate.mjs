import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Pool } from '@neondatabase/serverless';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

export const EXPECTED_NEON_CONFIG = {
  orgId: 'org-solitary-voice-24830396',
  projectId: 'spring-frog-51248337',
  branch: 'production',
  branchId: 'br-royal-tooth-b4ru7kif',
  directHost: 'ep-frosty-hall-b42n8gmw.c-6.us-east-2.aws.neon.tech',
  databaseName: 'neondb',
};

export const EXPECTED_PAPELITO_SCHEMA = {
  profiles: ['user_id', 'alias', 'full_name', 'avatar_color', 'created_at', 'updated_at'],
  consent_records: ['id', 'user_id', 'terms_version', 'privacy_version', 'accepted_at', 'revoked_at', 'ip_address', 'user_agent'],
  exchanges: [
    'id',
    'organizer_id',
    'name',
    'description',
    'event_date',
    'registration_deadline',
    'budget_amount',
    'currency',
    'suggested_theme',
    'selected_theme',
    'manual_theme_override',
    'requires_approval',
    'min_participants',
    'status',
    'current_draw_version',
    'created_at',
    'updated_at',
  ],
  invitations: [
    'id',
    'exchange_id',
    'token_hash',
    'encrypted_token',
    'max_uses',
    'use_count',
    'expires_at',
    'revoked_at',
    'created_by',
    'created_at',
  ],
  memberships: ['id', 'exchange_id', 'user_id', 'is_organizer', 'status', 'joined_at', 'approved_at', 'approved_by'],
  exclusions: ['id', 'exchange_id', 'giver_user_id', 'receiver_user_id', 'created_at'],
  draw_versions: ['id', 'exchange_id', 'version_number', 'created_at', 'invalidation_reason'],
  assignments: ['id', 'exchange_id', 'draw_version_id', 'giver_id', 'receiver_id', 'revealed_at', 'created_at'],
  wishes: ['id', 'user_id', 'title', 'description', 'url', 'approximate_price', 'currency', 'priority', 'created_at', 'updated_at'],
  wish_selections: ['id', 'exchange_id', 'wish_id', 'user_id', 'created_at'],
  gift_purchases: ['id', 'exchange_id', 'wish_id', 'buyer_id', 'purchased_at'],
  privacy_requests: ['id', 'user_id', 'request_type', 'notes', 'status', 'created_at', 'processed_at'],
};

/**
 * Loads .env.local and .env into process.env without overwriting existing variables
 * and without printing any secret values.
 */
export function loadEnvFiles(baseDir = rootDir) {
  const candidates = ['.env.local', '.env'];
  for (const fileName of candidates) {
    const filePath = path.join(baseDir, fileName);
    if (!fs.existsSync(filePath)) continue;
    const content = fs.readFileSync(filePath, 'utf8');
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const cleaned = line.startsWith('export ') ? line.slice(7).trim() : line;
      const eqIdx = cleaned.indexOf('=');
      if (eqIdx <= 0) continue;
      const key = cleaned.slice(0, eqIdx).trim();
      let value = cleaned.slice(eqIdx + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  }
}

/**
 * Verifies that .neon exists and points strictly to the authorized Neon org, project, and branch.
 */
export function verifyNeonLinkFile(baseDir = rootDir) {
  const neonFilePath = path.join(baseDir, '.neon');
  if (!fs.existsSync(neonFilePath)) {
    throw new Error('No se encontró el archivo .neon en la raíz del proyecto.');
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(neonFilePath, 'utf8'));
  } catch {
    throw new Error('El archivo .neon no contiene un JSON válido.');
  }

  if (
    parsed.orgId !== EXPECTED_NEON_CONFIG.orgId ||
    parsed.projectId !== EXPECTED_NEON_CONFIG.projectId ||
    parsed.branch !== EXPECTED_NEON_CONFIG.branch
  ) {
    throw new Error(
      `El archivo .neon no coincide con el proyecto/rama autorizados (esperado: org=${EXPECTED_NEON_CONFIG.orgId}, project=${EXPECTED_NEON_CONFIG.projectId}, branch=${EXPECTED_NEON_CONFIG.branch}).`
    );
  }
  return parsed;
}

/**
 * Validates DATABASE_URL and DATABASE_URL_UNPOOLED without printing credentials.
 * Requires DATABASE_URL_UNPOOLED to be a direct Neon URL (without -pooler) matching
 * the exact endpoint and database name of DATABASE_URL and the authorized Papelito Neon host/db.
 */
export function validateMigrationUrls(databaseUrl, unpooledUrl) {
  if (!databaseUrl || typeof databaseUrl !== 'string') {
    throw new Error('Falta configurar DATABASE_URL en el entorno (.env.local o .env).');
  }
  if (!unpooledUrl || typeof unpooledUrl !== 'string') {
    throw new Error(
      'Falta configurar DATABASE_URL_UNPOOLED (conexión directa sin -pooler) para ejecutar migraciones.'
    );
  }

  let pooledParsed;
  let unpooledParsed;
  try {
    pooledParsed = new URL(databaseUrl);
    unpooledParsed = new URL(unpooledUrl);
  } catch {
    throw new Error('DATABASE_URL o DATABASE_URL_UNPOOLED no tienen un formato de URL válido.');
  }

  const validProtocols = new Set(['postgres:', 'postgresql:']);
  if (!validProtocols.has(pooledParsed.protocol) || !validProtocols.has(unpooledParsed.protocol)) {
    throw new Error('Las URLs de base de datos deben usar el protocolo postgres:// o postgresql://.');
  }

  if (!pooledParsed.hostname.endsWith('.neon.tech') || !unpooledParsed.hostname.endsWith('.neon.tech')) {
    throw new Error('Las URLs de base de datos deben apuntar a un host oficial de Neon (*.neon.tech).');
  }

  if (unpooledParsed.hostname.includes('-pooler.')) {
    throw new Error(
      'DATABASE_URL_UNPOOLED no debe contener "-pooler" en el host; las migraciones exigen una conexión directa.'
    );
  }

  const normalizedPooledHost = pooledParsed.hostname.replace(/-pooler(?=\.)/, '');
  if (normalizedPooledHost !== unpooledParsed.hostname) {
    throw new Error(
      'El endpoint de DATABASE_URL_UNPOOLED no coincide con el endpoint de DATABASE_URL (comparando el host sin -pooler).'
    );
  }

  const pooledDbName = pooledParsed.pathname.replace(/^\//, '');
  const unpooledDbName = unpooledParsed.pathname.replace(/^\//, '');
  if (!unpooledDbName || pooledDbName !== unpooledDbName) {
    throw new Error(
      'El nombre de base de datos en DATABASE_URL_UNPOOLED no coincide con el de DATABASE_URL.'
    );
  }

  if (unpooledParsed.hostname !== EXPECTED_NEON_CONFIG.directHost) {
    throw new Error(
      `El endpoint Neon (${unpooledParsed.hostname}) no coincide con el host directo autorizado de Papelito (${EXPECTED_NEON_CONFIG.directHost}).`
    );
  }

  if (unpooledDbName !== EXPECTED_NEON_CONFIG.databaseName) {
    throw new Error(
      `La base de datos (${unpooledDbName}) no coincide con la base autorizada de Papelito (${EXPECTED_NEON_CONFIG.databaseName}).`
    );
  }

  return {
    directHost: unpooledParsed.hostname,
    databaseName: unpooledDbName,
  };
}

export async function verifyExpectedColumns(client) {
  const colsRes = await client.query(
    `SELECT table_name, column_name
     FROM information_schema.columns
     WHERE table_schema = 'public'`
  );

  const columnsByTable = new Map();
  for (const row of colsRes.rows) {
    if (!columnsByTable.has(row.table_name)) {
      columnsByTable.set(row.table_name, new Set());
    }
    columnsByTable.get(row.table_name).add(row.column_name);
  }

  for (const [tableName, expectedCols] of Object.entries(EXPECTED_PAPELITO_SCHEMA)) {
    const actualCols = columnsByTable.get(tableName);
    if (!actualCols) {
      throw new Error(`Falta la tabla esperada "${tableName}" en el esquema public.`);
    }
    const missingCols = expectedCols.filter((col) => !actualCols.has(col));
    if (missingCols.length > 0) {
      throw new Error(
        `La tabla "public.${tableName}" no contiene las columnas esperadas: faltan [${missingCols.join(', ')}].`
      );
    }
  }
}

/**
 * Inspects public schema and applies migration inside a transaction if public is empty,
 * or validates all 12 tables and expected columns before no-op.
 * Never executes DROP, TRUNCATE, or DELETE.
 */
export async function inspectAndMigratePublicSchema(client, migrationSql) {
  const expectedTableNames = Object.keys(EXPECTED_PAPELITO_SCHEMA);
  const expectedTableSet = new Set(expectedTableNames);

  const tablesRes = await client.query(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
     ORDER BY table_name ASC`
  );

  const existingTables = tablesRes.rows.map((r) => r.table_name);
  const foreignTables = existingTables.filter((t) => !expectedTableSet.has(t));

  if (foreignTables.length > 0) {
    throw new Error(
      `Rechazado: el esquema public contiene tablas ajenas a Papelito (${foreignTables.join(', ')}). Se aborta sin modificar nada.`
    );
  }

  if (existingTables.length > 0 && existingTables.length < expectedTableNames.length) {
    const missingTables = expectedTableNames.filter((t) => !existingTables.includes(t));
    throw new Error(
      `Rechazado: esquema public parcial detectado (${existingTables.length}/${expectedTableNames.length} tablas; faltan: ${missingTables.join(', ')}).`
    );
  }

  if (existingTables.length === expectedTableNames.length) {
    await verifyExpectedColumns(client);
    return { status: 'noop', tablesCount: existingTables.length };
  }

  // public schema is completely empty (0 tables): apply migration atomically inside transaction
  await client.query('BEGIN');
  try {
    if (typeof client.exec === 'function') {
      await client.exec(migrationSql);
    } else {
      await client.query(migrationSql);
    }
    await verifyExpectedColumns(client);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }

  return { status: 'migrated', tablesCount: expectedTableNames.length };
}

async function runCliMigration() {
  console.log('=== Papelito — Migración Segura de Esquema en Neon PostgreSQL ===');
  loadEnvFiles(rootDir);
  const neonMeta = verifyNeonLinkFile(rootDir);
  console.log(`✓ Vínculo .neon verificado: proyecto=${neonMeta.projectId}, rama=${neonMeta.branch}`);

  const { directHost, databaseName } = validateMigrationUrls(
    process.env.DATABASE_URL,
    process.env.DATABASE_URL_UNPOOLED
  );
  console.log(`✓ URLs validadas (host directo=${directHost}, base=${databaseName})`);

  const migrationPath = path.join(rootDir, 'neon', 'migrations', '20261016_init_papelito_neon.sql');
  const migrationSql = fs.readFileSync(migrationPath, 'utf8');

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL_UNPOOLED,
    max: 1,
    idleTimeoutMillis: 5000,
  });

  let client;
  try {
    client = await pool.connect();
    const result = await inspectAndMigratePublicSchema(client, migrationSql);
    if (result.status === 'migrated') {
      console.log(
        `✓ Migración aplicada exitosamente dentro de transacción (${result.tablesCount}/12 tablas creadas y verificadas en public).`
      );
    } else {
      console.log(
        `✓ Esquema Papelito ya presente y verificado (${result.tablesCount}/12 tablas y columnas esperadas íntegras). No-op sin cambios.`
      );
    }
  } finally {
    if (client) {
      client.release();
    }
    await pool.end();
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  runCliMigration().catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`❌ Error en db:migrate: ${msg}`);
    process.exitCode = 1;
  });
}
