import assert from "node:assert/strict";
import fs from "node:fs";
import { randomUUID, randomBytes } from "node:crypto";
import { register } from "node:module";
import { PGlite } from "@electric-sql/pglite";
register("./ts-loader.mjs", import.meta.url);
process.env.NODE_ENV = "test";
process.env.INVITATION_TOKEN_SECRET = randomBytes(32).toString("hex");
const { setTestDbAdapter } = await import("../src/lib/db/client.ts");
const {
  createExchangeWithInvitation,
  acceptInvitationAtomic,
  manageMemberStatus,
  getInvitationPreview,
  regenerateExchangeInvitation,
  updateExchangeLifecycleStatus,
} = await import("../src/lib/repositories/exchanges.ts");
const { getOrCreateProfile, recordConsent, getLatestConsentStatus } =
  await import("../src/lib/repositories/profiles.ts");
const { saveWish, toggleWishInExchange, deleteWish } =
  await import("../src/lib/repositories/wishes.ts");
const { executeAndCommitDraw } =
  await import("../src/lib/repositories/draw.ts");
const { revealAssignment, toggleWishPurchase } =
  await import("../src/lib/repositories/assignments.ts");
const { readAppSnapshot } =
  await import("../src/lib/repositories/app-snapshot.ts");
const { LEGAL_CONSTANTS } = await import("../src/lib/legal/constants.ts");
const pg = new PGlite();
let queries = 0;
for (const file of [
  "20261016_init_papelito_neon.sql",
  "20261017_retention_and_lifecycle.sql",
  "20261018_social_and_reminders.sql",
])
  await pg.exec(
    fs.readFileSync(
      new URL(`../neon/migrations/${file}`, import.meta.url),
      "utf8",
    ),
  );
setTestDbAdapter({
  async query(sql, params = []) {
    queries++;
    const r = await pg.query(sql, params);
    return { rows: r.rows, rowCount: r.rows.length || r.affectedRows || 0 };
  },
});
const people = Array.from({ length: 6 }, () => randomUUID());
try {
  for (const [i, id] of people.entries()) {
    await getOrCreateProfile(id, `persona-${i}@example.com`, `Persona ${i}`);
    // Synthetic fixtures only: no agreement is accepted for a human account.
    await recordConsent(
      id,
      LEGAL_CONSTANTS.VERSION,
      LEGAL_CONSTANTS.VERSION,
      null,
      "synthetic-journey",
    );
  }
  const [owner, b, c, d, pending, outsider] = people;
  const consent = await getLatestConsentStatus(owner);
  const before = queries;
  const blocked = await readAppSnapshot(owner, {
    hasCurrentConsent: false,
    latestVersion: null,
  });
  assert.deepEqual(blocked.exchanges, []);
  assert.equal(queries, before);
  const { exchangeId, inviteToken } = await createExchangeWithInvitation(
    owner,
    {
      name: "Fiesta de prueba aislada",
      description: "",
      eventDate: "2099-12-24",
      registrationDeadline: "2099-12-17",
      budgetAmount: 15000,
      currency: "CRC",
      suggestedTheme: "navidad",
      selectedTheme: "navidad",
      requiresApproval: true,
    },
  );
  assert.equal((await getInvitationPreview(inviteToken)).valid, true);
  for (const id of [b, c, d, pending])
    assert.equal(
      (await acceptInvitationAtomic(inviteToken, id)).status,
      "pending",
    );
  for (const id of [b, c, d])
    await manageMemberStatus(exchangeId, id, "approved", owner);
  const limited = await readAppSnapshot(pending, consent, exchangeId);
  assert.equal(
    limited.selected.details.exchange.currentUserMemberStatus,
    "pending",
  );
  assert.deepEqual(limited.selected.details.participants, []);
  assert.equal(limited.selected.details.invitationToken, null);
  assert.equal(limited.selected.assignment, null);
  const outside = await readAppSnapshot(outsider, consent, exchangeId);
  assert.equal(outside.selected, null);
  assert.ok(outside.detailError);
  assert.equal(outside.exchanges.length, 0);
  const shared = await saveWish(b, {
    title: "Mi libro favorito",
    approximatePrice: 0,
  });
  const privateWish = await saveWish(b, { title: "Idea que no compartí" });
  await toggleWishInExchange(b, exchangeId, shared.wishId, true);
  await assert.rejects(
    toggleWishInExchange(c, exchangeId, shared.wishId, true),
    /cuenta/,
  );
  await assert.rejects(
    toggleWishInExchange(pending, exchangeId, shared.wishId, true),
    /cuenta|aprobado/,
  );
  const ready = await readAppSnapshot(owner, consent, exchangeId);
  assert.equal(
    ready.selected.details.participants.filter((p) => p.status === "approved")
      .length,
    4,
  );
  assert.equal(
    ready.selected.details.participants.find((p) => p.userId === b).wishCount,
    1,
  );
  assert.equal(ready.wishes.length, 0);
  const renewed = await regenerateExchangeInvitation(exchangeId, owner);
  assert.equal((await getInvitationPreview(inviteToken)).valid, false);
  assert.equal(
    (await getInvitationPreview(renewed.inviteToken, new Date("2100-01-01")))
      .valid,
    false,
  );
  await assert.rejects(executeAndCommitDraw(exchangeId, b, 0), /organizador/);
  await executeAndCommitDraw(exchangeId, owner, 0);
  const receivers = [];
  let giverOfB;
  for (const id of [owner, b, c, d]) {
    const snapshot = await readAppSnapshot(id, consent, exchangeId);
    const assignment = snapshot.selected.assignment;
    assert.ok(assignment);
    assert.equal(assignment.giverId, id);
    assert.notEqual(assignment.receiverId, id);
    assert.equal(snapshot.wishes.length, id === b ? 2 : 0);
    assert.equal(
      snapshot.selected.details.invitationToken,
      id === owner ? renewed.inviteToken : null,
    );
    assert.equal(assignment.wishes.length, assignment.receiverId === b ? 1 : 0);
    assert.ok(!assignment.wishes.some((w) => w.id === privateWish.wishId));
    if (assignment.receiverId === b) {
      giverOfB = id;
      assert.equal(assignment.wishes[0].approximatePrice, 0);
    }
    receivers.push(assignment.receiverId);
  }
  assert.equal(new Set(receivers).size, 4);
  await revealAssignment(exchangeId, giverOfB);
  await toggleWishPurchase(exchangeId, giverOfB, shared.wishId, true);
  assert.equal(
    (await readAppSnapshot(giverOfB, consent, exchangeId)).selected.assignment
      .wishes[0].isPurchasedByGiver,
    true,
  );
  assert.equal(
    "isPurchasedByGiver" in (await readAppSnapshot(b, consent)).wishes[0],
    false,
  );
  await assert.rejects(executeAndCommitDraw(exchangeId, owner, 0), /versión/);
  await assert.rejects(
    executeAndCommitDraw(exchangeId, owner, 1, ""),
    /motivo/,
  );
  await deleteWish(b, shared.wishId);
  assert.equal(
    (await readAppSnapshot(giverOfB, consent, exchangeId)).selected.assignment
      .wishes.length,
    0,
  );
  await updateExchangeLifecycleStatus(exchangeId, owner, "finalizado");
  assert.equal((await getInvitationPreview(renewed.inviteToken)).valid, false);
  console.log(
    "PASS recorrido PostgreSQL: 4 participantes, aprobación, renovación/vencimiento, sorteo privado, pistas seleccionadas, compra privada, versión y cierre",
  );
  console.log(
    "PASS carga agrupada: sin consentimiento no consulta datos; pendiente y externo restringidos; deseos y asignación propios",
  );
} finally {
  setTestDbAdapter(null);
  await pg.close();
}
