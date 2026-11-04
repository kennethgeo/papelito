// Escrituras agrupadas del sorteo y de las exclusiones: mismas reglas, una sola
// sentencia por lista y reversión completa ante una falla real de PostgreSQL.
import assert from "node:assert/strict";
import fs from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";
import { register } from "node:module";
import { PGlite } from "@electric-sql/pglite";

register("./ts-loader.mjs", import.meta.url);
process.env.NODE_ENV = "test";
process.env.INVITATION_TOKEN_SECRET = randomBytes(32).toString("hex");

const { setTestDbAdapter } = await import("../src/lib/db/client.ts");
const { createExchangeWithInvitation, setExchangeExclusions } =
  await import("../src/lib/repositories/exchanges.ts");
const { getOrCreateProfile } = await import("../src/lib/repositories/profiles.ts");
const { executeAndCommitDraw } = await import("../src/lib/repositories/draw.ts");

const pg = new PGlite();
for (const file of fs.readdirSync(new URL("../neon/migrations/", import.meta.url)).sort())
  await pg.exec(fs.readFileSync(new URL(`../neon/migrations/${file}`, import.meta.url), "utf8"));

let log = [];
setTestDbAdapter({
  async query(sql, params = []) {
    log.push(sql);
    const r = await pg.query(sql, params);
    return { rows: r.rows, rowCount: r.rows.length || r.affectedRows || 0 };
  },
});
const measure = async (run) => {
  log = [];
  const result = await run();
  return { result, total: log.length, statements: [...log] };
};
const inserts = (statements, table) => statements.filter((sql) => sql.includes(`INSERT INTO ${table}`)).length;
const rows = async (sql, params) => (await pg.query(sql, params)).rows;

async function groupWith(count) {
  const owner = randomUUID();
  await getOrCreateProfile(owner, `${owner}@example.com`, "Organiza");
  const { exchangeId } = await createExchangeWithInvitation(owner, {
    name: "Grupo grande",
    description: "",
    eventDate: "2099-12-24",
    registrationDeadline: "2099-12-17",
    budgetAmount: 10000,
    currency: "CRC",
    suggestedTheme: "general",
    selectedTheme: "general",
    requiresApproval: true,
  });
  const people = [owner];
  for (let i = 1; i < count; i++) {
    const id = randomUUID();
    await pg.query(`INSERT INTO profiles (user_id, alias, full_name) VALUES ($1, $2, $2)`, [id, `Persona ${i}`]);
    await pg.query(`INSERT INTO memberships (exchange_id, user_id, status) VALUES ($1, $2, 'approved')`, [exchangeId, id]);
    people.push(id);
  }
  return { owner, exchangeId, people };
}

try {
  // Exclusiones: 100 participantes, con duplicados y parejas repetidas.
  const { owner, exchangeId, people } = await groupWith(100);
  const pairs = people.slice(0, 99).map((giver, i) => ({ giverUserId: giver, excludedReceiverUserId: people[i + 1] }));
  const withDuplicates = [...pairs, ...pairs.slice(0, 40), pairs[0], pairs[0]];
  const saved = await measure(() => setExchangeExclusions(exchangeId, owner, withDuplicates));
  const exclusionsBefore = saved.total;
  console.log(`Exclusiones (${withDuplicates.length} reglas, ${pairs.length} únicas): ${saved.total} viajes, ${inserts(saved.statements, "exclusions")} INSERT.`);
  const stored = await rows(`SELECT giver_user_id, receiver_user_id FROM exclusions WHERE exchange_id = $1`, [exchangeId]);
  assert.equal(stored.length, pairs.length, "los duplicados no se guardan");
  assert.deepEqual(
    new Set(stored.map((row) => `${row.giver_user_id}>${row.receiver_user_id}`)),
    new Set(pairs.map((rule) => `${rule.giverUserId}>${rule.excludedReceiverUserId}`)),
  );
  assert.ok(saved.statements.some((sql) => sql.includes("FOR UPDATE")), "conserva el bloqueo del intercambio");
  assert.ok(saved.statements[0].includes("BEGIN"), "conserva la transacción");
  assert.equal(inserts(saved.statements, "exclusions"), 1, "una sola sentencia para todas las exclusiones");

  // Lista vacía: limpia sin un INSERT de más.
  const smaller = pairs.slice(0, 5);
  await setExchangeExclusions(exchangeId, owner, smaller);
  assert.equal((await rows(`SELECT id FROM exclusions WHERE exchange_id = $1`, [exchangeId])).length, 5);

  // Reversión de exclusiones: una fila rechazada por PostgreSQL no deja nada a medias.
  const blocked = people[50];
  await pg.exec(`ALTER TABLE exclusions ADD CONSTRAINT prueba_falla CHECK (receiver_user_id <> '${blocked}')`);
  await assert.rejects(setExchangeExclusions(exchangeId, owner, pairs));
  await pg.exec(`ALTER TABLE exclusions DROP CONSTRAINT prueba_falla`);
  const afterFailure = await rows(`SELECT receiver_user_id FROM exclusions WHERE exchange_id = $1`, [exchangeId]);
  assert.equal(afterFailure.length, 5, "las exclusiones anteriores siguen intactas");

  // Las reglas no cambian: autoexclusión y personas sin aprobar se rechazan sin escribir.
  await assert.rejects(setExchangeExclusions(exchangeId, owner, [{ giverUserId: owner, excludedReceiverUserId: owner }]), /regalarse a sí misma/);
  await assert.rejects(setExchangeExclusions(exchangeId, owner, [{ giverUserId: owner, excludedReceiverUserId: randomUUID() }]), /aprobados/);
  await assert.rejects(setExchangeExclusions(exchangeId, people[1], []), /organizador/);
  assert.equal((await rows(`SELECT id FROM exclusions WHERE exchange_id = $1`, [exchangeId])).length, 5);

  // Sorteo: reversión primero, con una fila que PostgreSQL rechaza.
  await pg.exec(`ALTER TABLE assignments ADD CONSTRAINT prueba_falla CHECK (receiver_id <> '${blocked}')`);
  await assert.rejects(executeAndCommitDraw(exchangeId, owner, 0));
  await pg.exec(`ALTER TABLE assignments DROP CONSTRAINT prueba_falla`);
  const [untouched] = await rows(`SELECT status, current_draw_version FROM exchanges WHERE id = $1`, [exchangeId]);
  assert.equal(untouched.status, "inscripcion_abierta");
  assert.equal(untouched.current_draw_version, 0);
  assert.equal((await rows(`SELECT id FROM draw_versions WHERE exchange_id = $1`, [exchangeId])).length, 0);
  assert.equal((await rows(`SELECT id FROM assignments WHERE exchange_id = $1`, [exchangeId])).length, 0);

  // Sorteo de 100 personas.
  const drawn = await measure(() => executeAndCommitDraw(exchangeId, owner, 0));
  const drawTrips = drawn.total;
  console.log(`Sorteo de 100 personas: ${drawn.total} viajes, ${inserts(drawn.statements, "assignments")} INSERT de asignaciones.`);
  assert.deepEqual(drawn.result, { success: true, version: 1, count: 100 });
  assert.ok(drawn.statements.some((sql) => sql.includes("FOR UPDATE")), "conserva el bloqueo del intercambio");
  const assignments = await rows(`SELECT giver_id, receiver_id, draw_version_id FROM assignments WHERE exchange_id = $1`, [exchangeId]);
  assert.equal(assignments.length, 100);
  assert.equal(new Set(assignments.map((row) => row.giver_id)).size, 100);
  assert.equal(new Set(assignments.map((row) => row.receiver_id)).size, 100);
  assert.ok(assignments.every((row) => row.giver_id !== row.receiver_id));
  assert.equal(new Set(assignments.map((row) => row.draw_version_id)).size, 1, "todas en la misma versión");
  for (const rule of smaller)
    assert.ok(!assignments.some((row) => row.giver_id === rule.giverUserId && row.receiver_id === rule.excludedReceiverUserId), "respeta las exclusiones");
  assert.equal(inserts(drawn.statements, "assignments"), 1, "una sola sentencia para todas las asignaciones");

  // Repetir conserva la versión anterior y su control de versión.
  await assert.rejects(executeAndCommitDraw(exchangeId, owner, 0, "Versión vieja"), /Conflicto de versión/);
  const again = await executeAndCommitDraw(exchangeId, owner, 1, "Se repite por prueba");
  assert.equal(again.version, 2);
  assert.equal((await rows(`SELECT id FROM assignments WHERE exchange_id = $1`, [exchangeId])).length, 200);

  // Los valores viajan como datos, también con comillas y comas.
  const odd = [`usuario,"raro'${randomUUID()}`, `otro\\{${randomUUID()}}`];
  const { owner: ownerB, exchangeId: oddGroup, people: base } = await groupWith(3);
  for (const id of odd) {
    await pg.query(`INSERT INTO profiles (user_id, alias, full_name) VALUES ($1, 'Rara', 'Rara')`, [id]);
    await pg.query(`INSERT INTO memberships (exchange_id, user_id, status) VALUES ($1, $2, 'approved')`, [oddGroup, id]);
  }
  await setExchangeExclusions(oddGroup, ownerB, [{ giverUserId: odd[0], excludedReceiverUserId: odd[1] }, { giverUserId: base[1], excludedReceiverUserId: odd[0] }]);
  assert.deepEqual((await rows(`SELECT receiver_user_id FROM exclusions WHERE exchange_id = $1 AND giver_user_id = $2`, [oddGroup, odd[0]])).map((row) => row.receiver_user_id), [odd[1]]);
  await executeAndCommitDraw(oddGroup, ownerB, 0);
  assert.equal((await rows(`SELECT id FROM assignments WHERE exchange_id = $1`, [oddGroup])).length, 5);

  console.log(`PASS escrituras agrupadas: exclusiones ${exclusionsBefore} viajes, sorteo ${drawTrips} viajes; reversión completa ante fallas.`);
} finally {
  setTestDbAdapter(null);
  await pg.close();
}
