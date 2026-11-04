// FUN-04/05: rejection is reversible before the draw, removal cleans its
// restrictions, nobody can transfer the organization (manually or on account
// deletion) to a represented person without an account.
import assert from 'node:assert/strict';

const test = globalThis.__papelitoTest;
const { getOrCreateProfile, recordConsent, getAccountDeletionImpact, requestAccountDeletion, purgeUserAppDataTransactional } = await import('../../src/lib/repositories/profiles.ts');
const ex = await import('../../src/lib/repositories/exchanges.ts');
const { executeAndCommitDraw } = await import('../../src/lib/repositories/draw.ts');
const selected = await import('../../src/lib/repositories/selected-features.ts');
const { LEGAL_CONSTANTS } = await import('../../src/lib/legal/constants.ts');

const input = { name: 'Intercambio ficticio', eventDate: '2099-12-24', registrationDeadline: '2099-12-10', budgetAmount: 10000, currency: 'CRC', suggestedTheme: 'navidad', selectedTheme: 'navidad', requiresApproval: true };
let counter = 0;
async function people(...names) {
  const ids = [];
  for (const name of names) {
    const id = `p${++counter}-${name}`;
    await getOrCreateProfile(id, `${id}@example.com`, `Persona ${name}`);
    await recordConsent(id, LEGAL_CONSTANTS.VERSION, LEGAL_CONSTANTS.VERSION);
    ids.push(id);
  }
  return ids;
}
async function group(organizer, members) {
  const created = await ex.createExchangeWithInvitation(organizer, input);
  for (const m of members) { await ex.acceptInvitationAtomic(created.inviteToken, m); await ex.manageMemberStatus(created.exchangeId, m, 'approved', organizer); }
  return created;
}

test('participantes: rechazar es reversible antes del sorteo y quitar borra restricciones', async ({ query }) => {
  const [org, a, b, c] = await people('org', 'a', 'b', 'c');
  const { exchangeId, inviteToken } = await group(org, [a, b]);
  await ex.acceptInvitationAtomic(inviteToken, c);
  await ex.manageMemberStatus(exchangeId, c, 'rejected', org);
  assert.equal((await ex.acceptInvitationAtomic(inviteToken, c)).status, 'rejected', 'the link alone does not readmit');
  await ex.manageMemberStatus(exchangeId, c, 'approved', org);
  assert.equal((await query('SELECT status FROM memberships WHERE exchange_id=$1 AND user_id=$2', [exchangeId, c])).rows[0].status, 'approved');
  await ex.setExchangeExclusions(exchangeId, org, [{ giverUserId: a, excludedReceiverUserId: b }, { giverUserId: b, excludedReceiverUserId: a }, { giverUserId: c, excludedReceiverUserId: org }]);
  await ex.manageMemberStatus(exchangeId, a, 'rejected', org);
  const rules = (await query('SELECT giver_user_id, receiver_user_id FROM exclusions WHERE exchange_id=$1', [exchangeId])).rows;
  assert.deepEqual(rules, [{ giver_user_id: c, receiver_user_id: org }], 'only restrictions between remaining people stay');
  const details = await ex.getExchangeDetails(exchangeId, org);
  assert.equal(details.participants.find((p) => p.userId === a).status, 'rejected', 'the organizer still sees who was removed');
  await ex.manageMemberStatus(exchangeId, a, 'approved', org);
  await executeAndCommitDraw(exchangeId, org, 0);
  await assert.rejects(() => ex.manageMemberStatus(exchangeId, b, 'rejected', org), /una vez realizado el sorteo/, 'never invalidates a draw silently');
});

test('organización: nunca pasa a una persona representada, ni a mano ni al darse de baja', async ({ query }) => {
  const [org, a] = await people('org', 'adulto');
  const { exchangeId } = await group(org, [a]);
  const child = await selected.addRepresented(exchangeId, a, 'Familiar menor', true);
  await ex.manageMemberStatus(exchangeId, child, 'approved', org);
  await assert.rejects(() => ex.transferExchangeOrganizer(exchangeId, org, child), /no tiene cuenta propia/);
  assert.equal((await ex.getExchangeDetails(exchangeId, org)).participants.find((p) => p.userId === child).represented, true);

  // The organizer's own represented person is not a successor either.
  const [org2] = await people('org2');
  const second = await group(org2, []);
  const own = await selected.addRepresented(second.exchangeId, org2, 'Familiar propio', true);
  const impact = await getAccountDeletionImpact(org2);
  assert.equal(impact.activeOrganizedWithOthers.length, 0, 'own represented people leave with the account');
  assert.ok(impact.soloOrganizedExchanges.some((e) => e.id === second.exchangeId));
  void own;

  // Someone else's represented person blocks deletion until confirmed, and the
  // succession goes to the adult with an account, not to the alias.
  const firstImpact = await getAccountDeletionImpact(org);
  const entry = firstImpact.activeOrganizedWithOthers.find((e) => e.id === exchangeId);
  assert.deepEqual(entry.otherApprovedMembers.map((m) => m.userId), [a]);
  const now = new Date().toISOString();
  const result = await requestAccountDeletion(org, { confirmPhrase: 'ELIMINAR MI CUENTA', confirmIrreversible: true, confirmOrganizerImpact: true, sessionAuthenticatedAt: now });
  assert.equal(result.transferredExchanges[0].newOrganizerUserId, a);
  assert.equal((await query('SELECT organizer_id FROM exchanges WHERE id=$1', [exchangeId])).rows[0].organizer_id, a);
});

test('organización: sin sucesor con cuenta, el intercambio con solo representados ajenos se cancela', async ({ query }) => {
  const [org, adult] = await people('org3', 'adulto3');
  const { exchangeId } = await group(org, [adult]);
  const child = await selected.addRepresented(exchangeId, adult, 'Representado', true);
  await ex.manageMemberStatus(exchangeId, child, 'approved', org);
  // The adult leaves; their represented person stays rejected with them.
  await ex.manageMemberStatus(exchangeId, adult, 'rejected', org);
  const impact = await getAccountDeletionImpact(org);
  assert.equal(impact.activeOrganizedWithOthers.some((e) => e.id === exchangeId), false, 'no approved or pending people remain');
  const [org4, adult4] = await people('org4', 'adulto4');
  const fourth = await group(org4, [adult4]);
  const kid = await selected.addRepresented(fourth.exchangeId, adult4, 'Representado 4', true);
  await ex.manageMemberStatus(fourth.exchangeId, kid, 'approved', org4);
  await query("UPDATE memberships SET status='pending' WHERE exchange_id=$1 AND user_id=$2", [fourth.exchangeId, adult4]);
  const result = await requestAccountDeletion(org4, { confirmPhrase: 'ELIMINAR MI CUENTA', confirmIrreversible: true, confirmOrganizerImpact: true, sessionAuthenticatedAt: new Date().toISOString() });
  assert.equal(result.transferredExchanges.length, 0, 'never transferred to the represented alias');
  assert.deepEqual(result.canceledExchanges.map((e) => e.id), [fourth.exchangeId]);
  assert.equal((await query('SELECT status FROM exchanges WHERE id=$1', [fourth.exchangeId])).rows[0].status, 'cancelado');
});

test('baja administrativa: el sucesor automático nunca es un alias representado', async ({ query }) => {
  const [org, adult, other] = await people('org5', 'adulto5', 'otra5');
  const { exchangeId } = await group(org, [adult, other]);
  const kid = await selected.addRepresented(exchangeId, adult, 'Representado 5', true);
  await ex.manageMemberStatus(exchangeId, kid, 'approved', org);
  // Make the represented alias the earliest member so ordering alone would pick it.
  await query("UPDATE memberships SET joined_at = now() - interval '10 days' WHERE exchange_id=$1 AND user_id=$2", [exchangeId, kid]);
  const result = await purgeUserAppDataTransactional(org, { confirmOrganizerImpact: true });
  assert.equal(result.transferredExchangeIds[0].newOrganizerUserId, adult);
  assert.equal((await query('SELECT organizer_id FROM exchanges WHERE id=$1', [exchangeId])).rows[0].organizer_id, adult);
  void other;
});
