import { register } from 'node:module';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  EXPECTED_PAPELITO_SCHEMA,
  loadEnvFiles,
  verifyNeonLinkFile,
  validateMigrationUrls,
  verifyExpectedColumns,
} from './db-migrate.mjs';

register('./ts-loader.mjs', import.meta.url);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Fallo de aserción: ${message}`);
  }
}

export async function runNeonSmokeTest() {
  console.log('=== Papelito — Prueba Real de Persistencia SQL en Neon PostgreSQL (sin PGlite, con ROLLBACK) ===');
  console.log('Nota: Esta prueba valida conexión real, esquema y CRUD transaccional SQL; NO constituye prueba E2E de Google OAuth.');

  // Ensure we NEVER use testDbAdapter or NODE_ENV=test
  if (process.env.NODE_ENV === 'test') {
    process.env.NODE_ENV = 'development';
  }

  loadEnvFiles(rootDir);
  const neonMeta = verifyNeonLinkFile(rootDir);
  const { directHost, databaseName } = validateMigrationUrls(
    process.env.DATABASE_URL,
    process.env.DATABASE_URL_UNPOOLED
  );
  console.log(
    `✓ 1. Vínculo .neon (${neonMeta.projectId}/${neonMeta.branch}) y par de URLs Neon autorizadas (host=${directHost}, base=${databaseName}) verificados`
  );

  const { isDatabaseConfigured, dbQuery, dbTransaction, closeDbPool } = await import(
    '../src/lib/db/client.ts'
  );

  assert(isDatabaseConfigured() === true, 'isDatabaseConfigured() debe devolver true con DATABASE_URL real');

  try {
    // 1. Verificar consulta básica en servidor
    const pingRes = await dbQuery(
      `SELECT current_database() AS db_name, current_schema() AS schema_name`
    );
    assert(
      pingRes.rowCount === 1 && pingRes.rows[0].schema_name === 'public',
      'La consulta inicial a Neon PostgreSQL debe responder en el esquema public'
    );
    console.log(`✓ 2. Conexión activa verificada con src/lib/db/client.ts (base=${pingRes.rows[0].db_name})`);

    // 2. Verificar las 12 tablas y columnas esperadas en public (sin tocar neon_auth ni datos existentes)
    const tablesRes = await dbQuery(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
       ORDER BY table_name ASC`
    );
    const expectedTables = Object.keys(EXPECTED_PAPELITO_SCHEMA);
    const expectedSet = new Set(expectedTables);
    const actualTables = tablesRes.rows.map((r) => r.table_name);
    const foreignTables = actualTables.filter((t) => !expectedSet.has(t));

    assert(
      foreignTables.length === 0,
      `El esquema public contiene tablas no pertenecientes a Papelito: ${foreignTables.join(', ')}`
    );
    assert(
      actualTables.length === expectedTables.length,
      `Se esperaban las 12 tablas de Papelito en public (encontradas: ${actualTables.length}). Ejecuta primero npm run db:migrate.`
    );
    await verifyExpectedColumns({ query: dbQuery });
    console.log('✓ 3. Esquema public verificado (12/12 tablas y todas las columnas esperadas presentes)');

    // 3. Ejecutar CRUD de perfil y deseo dentro de dbTransaction y forzar ROLLBACK con error marcador
    const runUuid = crypto.randomUUID();
    const testUserId = `neon_tx_probe_${runUuid}`;
    const wishId1 = crypto.randomUUID();
    const wishId2 = crypto.randomUUID();
    const markerCode = `NEON_ROLLBACK_MARKER_${runUuid}`;

    let markerCaught = false;
    try {
      await dbTransaction(async (tx) => {
        // CREATE profile
        const insertProf = await tx.query(
          `INSERT INTO profiles (user_id, alias, full_name, avatar_color)
           VALUES ($1, $2, $3, $4)
           RETURNING user_id, alias`,
          [testUserId, 'ProbeInicial', 'Usuario Sonda Transaccional', '#46245D']
        );
        assert(
          insertProf.rowCount === 1 && insertProf.rows[0].alias === 'ProbeInicial',
          'INSERT en profiles dentro de dbTransaction debe devolver la fila creada'
        );

        // READ & UPDATE profile
        await tx.query(
          `UPDATE profiles SET alias = $2, updated_at = now() WHERE user_id = $1`,
          [testUserId, 'ProbeActualizado']
        );
        const readProf = await tx.query(
          `SELECT alias FROM profiles WHERE user_id = $1`,
          [testUserId]
        );
        assert(
          readProf.rowCount === 1 && readProf.rows[0].alias === 'ProbeActualizado',
          'UPDATE/SELECT en profiles dentro de dbTransaction debe reflejar el nuevo alias'
        );

        // CREATE wishes (2 items)
        await tx.query(
          `INSERT INTO wishes (id, user_id, title, description, approximate_price, currency, priority)
           VALUES ($1, $2, $3, $4, $5, 'CRC', 'media')`,
          [wishId1, testUserId, 'Deseo Sonda 1', 'Creado en transacción con rollback', 15000]
        );
        await tx.query(
          `INSERT INTO wishes (id, user_id, title, description, approximate_price, currency, priority)
           VALUES ($1, $2, $3, $4, $5, 'CRC', 'baja')`,
          [wishId2, testUserId, 'Deseo Sonda 2', 'Para probar DELETE en transacción', 7500]
        );

        // READ & UPDATE wish 1
        await tx.query(
          `UPDATE wishes SET title = $2, priority = 'alta', updated_at = now() WHERE id = $1 AND user_id = $3`,
          [wishId1, 'Deseo Sonda 1 Editado', testUserId]
        );
        const readWish = await tx.query(
          `SELECT title, priority FROM wishes WHERE id = $1 AND user_id = $2`,
          [wishId1, testUserId]
        );
        assert(
          readWish.rowCount === 1 &&
            readWish.rows[0].title === 'Deseo Sonda 1 Editado' &&
            readWish.rows[0].priority === 'alta',
          'UPDATE/SELECT en wishes dentro de dbTransaction debe reflejar los cambios'
        );

        // DELETE wish 2
        const delWish = await tx.query(
          `DELETE FROM wishes WHERE id = $1 AND user_id = $2`,
          [wishId2, testUserId]
        );
        assert(delWish.rowCount === 1, 'DELETE de deseo dentro de dbTransaction debe afectar 1 fila');

        // Forzar ROLLBACK intencional mediante error marcador
        const markerErr = new Error(markerCode);
        markerErr.code = markerCode;
        throw markerErr;
      });
    } catch (err) {
      if (err instanceof Error && err.message === markerCode) {
        markerCaught = true;
      } else {
        throw err;
      }
    }

    assert(markerCaught === true, 'dbTransaction debía propagar el error marcador tras ejecutar ROLLBACK');

    // 4. Verificar ausencia total de los UUIDs propios tras el ROLLBACK (cero datos residuales)
    const checkProfileAfter = await dbQuery(
      `SELECT COUNT(*)::int AS cnt FROM profiles WHERE user_id = $1`,
      [testUserId]
    );
    const checkWishesAfter = await dbQuery(
      `SELECT COUNT(*)::int AS cnt FROM wishes WHERE id IN ($1, $2) OR user_id = $3`,
      [wishId1, wishId2, testUserId]
    );

    assert(
      Number(checkProfileAfter.rows[0].cnt) === 0,
      `El perfil temporal (${testUserId}) no debe existir tras el ROLLBACK`
    );
    assert(
      Number(checkWishesAfter.rows[0].cnt) === 0,
      `Los deseos temporales (${wishId1}, ${wishId2}) no deben existir tras el ROLLBACK`
    );

    console.log('✓ 4. CRUD transaccional (profiles/wishes) y ROLLBACK verificados: 0 filas residuales en Neon');
    console.log('=== Prueba SQL en Neon PostgreSQL completada con éxito ===');
  } finally {
    await closeDbPool();
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  runNeonSmokeTest().catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`❌ Error en test:neon: ${msg}`);
    process.exitCode = 1;
  });
}
