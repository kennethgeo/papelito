// Represented older adults: a personal link shows their own papelito without an
// account; the representative never receives that assignment. Children keep the
// previous behaviour (the representative sees it). Opening is explicit and its
// first time stays visible, so an opening by someone else leaves a trace.
import assert from 'node:assert/strict';

const test = globalThis.__papelitoTest;
const { query } = globalThis.__papelitoHardening;
const { getOrCreateProfile, recordConsent, exportUserData } = await import('../../src/lib/repositories/profiles.ts');
const ex = await import('../../src/lib/repositories/exchanges.ts');
const { executeAndCommitDraw } = await import('../../src/lib/repositories/draw.ts');
const { saveWish, toggleWishInExchange } = await import('../../src/lib/repositories/wishes.ts');
const selected = await import('../../src/lib/repositories/selected-features.ts');
const links = await import('../../src/lib/repositories/personal-links.ts');
const { LEGAL_CONSTANTS } = await import('../../src/lib/legal/constants.ts');

const input = { name: 'Familia ficticia', eventDate: '2099-12-24', registrationDeadline: '2099-12-10', budgetAmount: 15000, currency: 'CRC', suggestedTheme: 'navidad', selectedTheme: 'navidad', requiresApproval: true };
const tokenOf = (path) => path.split('/').pop();

async function setup(prefix) {
  const ids = {};
  for (const name of ['org', 'guardian', 'ana', 'beto']) {
    ids[name] = `${prefix}-${name}`;
    await getOrCreateProfile(ids[name], `${ids[name]}@example.com`, `Persona ${prefix} ${name}`);
    await recordConsent(ids[name], LEGAL_CONSTANTS.VERSION, LEGAL_CONSTANTS.VERSION);
  }
  const created = await ex.createExchangeWithInvitation(ids.org, input);
  for (const m of [ids.guardian, ids.ana, ids.beto]) {
    await ex.acceptInvitationAtomic(created.inviteToken, m);
    await ex.manageMemberStatus(created.exchangeId, m, 'approved', ids.org);
  }
  return { ...ids, exchangeId: created.exchangeId };
}

async function shareWish(userId, exchangeId, title) {
  const { wishId } = await saveWish(userId, { title });
  await toggleWishInExchange(userId, exchangeId, wishId, true);
  return wishId;
}

test('enlace personal: tipo al inscribir, solo para adultos mayores y estados antes del sorteo', async () => {
  const s = await setup('pl1');
  await assert.rejects(() => selected.addRepresented(s.exchangeId, s.guardian, 'Sin tipo', true, 'adulto'), /Elegí si es/);
  const senior = await selected.addRepresented(s.exchangeId, s.guardian, 'Abuela Rosa', true, 'senior');
  const child = await selected.addRepresented(s.exchangeId, s.guardian, 'Nieto Leo', true, 'child');
  await assert.rejects(() => links.createPersonalLink(s.exchangeId, s.guardian, child), /personas adultas mayores/);
  await assert.rejects(() => links.createPersonalLink(s.exchangeId, s.ana, senior), /a tu cargo/);

  const first = await links.createPersonalLink(s.exchangeId, s.guardian, senior);
  assert.match(first.path, /^\/papelito\/[A-Za-z0-9_-]{43}$/);
  assert.equal((await links.previewPersonalLink(tokenOf(first.path))).state, 'waiting');
  assert.equal((await links.previewPersonalLink(tokenOf(first.path))).reason, 'approval', 'pending until the organizer approves');
  await ex.manageMemberStatus(s.exchangeId, senior, 'approved', s.org);
  const waiting = await links.previewPersonalLink(tokenOf(first.path));
  assert.equal(waiting.state, 'waiting'); assert.equal(waiting.reason, 'draw'); assert.equal(waiting.alias, 'Abuela Rosa');
  assert.equal((await links.openPersonalLink(tokenOf(first.path))).papelito, null);

  // Only the hash is stored, and a new link replaces the previous one.
  const stored = await query('SELECT token_hash FROM represented_access_links WHERE represented_user_id = $1', [senior]);
  assert(!stored.rows.some((r) => r.token_hash === tokenOf(first.path)));
  const second = await links.createPersonalLink(s.exchangeId, s.guardian, senior);
  assert.equal((await links.previewPersonalLink(tokenOf(first.path))).state, 'invalid');
  assert.notEqual((await links.previewPersonalLink(tokenOf(second.path))).state, 'invalid');
  for (const bad of ['', 'corto', 'x'.repeat(43), '../../etc/passwd', null]) assert.equal((await links.previewPersonalLink(bad)).state, 'invalid');

  // Before the draw the type can go back to child; that revokes the link.
  await links.setRepresentedKind(s.exchangeId, s.guardian, senior, 'child');
  assert.equal((await links.previewPersonalLink(tokenOf(second.path))).state, 'invalid');
  await links.setRepresentedKind(s.exchangeId, s.guardian, senior, 'senior');
});

test('enlace personal: solo la persona mayor ve su papelito y deseos; quien la representa no', async () => {
  const s = await setup('pl2');
  const senior = await selected.addRepresented(s.exchangeId, s.guardian, 'Abuelo Tito', true, 'senior');
  const child = await selected.addRepresented(s.exchangeId, s.guardian, 'Nieta Sofi', true, 'child');
  for (const id of [senior, child]) await ex.manageMemberStatus(s.exchangeId, id, 'approved', s.org);
  const wishes = {};
  for (const id of [s.org, s.guardian, s.ana, s.beto]) wishes[id] = await shareWish(id, s.exchangeId, `Idea de ${id}`);
  await selected.representedWish(s.exchangeId, s.guardian, senior, 'Bufanda de lana');
  await selected.representedWish(s.exchangeId, s.guardian, child, 'Rompecabezas');
  const { path } = await links.createPersonalLink(s.exchangeId, s.guardian, senior);
  const token = tokenOf(path);
  await executeAndCommitDraw(s.exchangeId, s.org, 0);

  const receiver = (await query(`SELECT a.receiver_id, p.alias FROM assignments a JOIN profiles p ON p.user_id = a.receiver_id
    JOIN exchanges e ON e.id = a.exchange_id JOIN draw_versions dv ON dv.id = a.draw_version_id AND dv.version_number = e.current_draw_version
    WHERE a.exchange_id = $1 AND a.giver_id = $2`, [s.exchangeId, senior])).rows[0];

  // The representative's view carries no assignment for the older adult.
  const view = await selected.getRepresented(s.exchangeId, s.guardian);
  const seniorView = view.find((p) => p.user_id === senior);
  const childView = view.find((p) => p.user_id === child);
  assert.equal(seniorView.kind, 'senior'); assert.equal(seniorView.assignment, null); assert.equal(seniorView.opened, false);
  assert(seniorView.link?.createdAt);
  assert(!JSON.stringify(seniorView).includes(receiver.receiver_id));
  assert.equal(childView.kind, 'child'); assert(childView.assignment, 'children keep the previous behaviour');
  await assert.rejects(() => selected.revealRepresented(s.exchangeId, s.guardian, senior), /enlace personal/);
  await selected.revealRepresented(s.exchangeId, s.guardian, child);

  // Loading the page records nothing (link previews in messaging apps).
  assert.equal((await links.previewPersonalLink(token)).state, 'ready');
  assert.equal((await query('SELECT open_count FROM represented_access_links WHERE represented_user_id = $1', [senior])).rows[0].open_count, 0);

  const opened = await links.openPersonalLink(token);
  assert.equal(opened.papelito.receiverAlias, receiver.alias);
  assert.equal(opened.papelito.firstTimeNow, true);
  assert(opened.papelito.firstOpenedAt);
  assert.equal(opened.papelito.budgetAmount, 15000);
  const shownWishes = opened.papelito.wishes.map((w) => w.title);
  assert(shownWishes.length >= 1, 'the receiver\'s shared wishes are shown');
  assert(!shownWishes.includes('Bufanda de lana'), 'never the older adult\'s own wishes');

  const again = await links.openPersonalLink(token);
  assert.equal(again.papelito.firstTimeNow, false);
  assert.equal(again.papelito.firstOpenedAt, opened.papelito.firstOpenedAt, 'the first opening stays visible');
  const after = (await selected.getRepresented(s.exchangeId, s.guardian)).find((p) => p.user_id === senior);
  assert.equal(after.opened, true); assert.equal(after.link.openCount, 2); assert.equal(after.assignment, null);

  // A new link (or an earlier peek) cannot hide the first opening.
  const renewed = await links.createPersonalLink(s.exchangeId, s.guardian, senior);
  assert.equal((await links.openPersonalLink(token)).preview.state, 'invalid');
  const viaNew = await links.openPersonalLink(tokenOf(renewed.path));
  assert.equal(viaNew.papelito.firstTimeNow, false);
  assert.equal(viaNew.papelito.firstOpenedAt, opened.papelito.firstOpenedAt);

  // Photos: only the current receiver's wish and only with a working link.
  const receiverWish = receiver.receiver_id === senior ? null : (wishes[receiver.receiver_id] ?? (await query("SELECT w.id FROM wishes w WHERE w.user_id = $1 LIMIT 1", [receiver.receiver_id])).rows[0].id);
  const otherWish = wishes[[s.org, s.guardian, s.ana, s.beto].find((id) => id !== receiver.receiver_id)];
  await query('INSERT INTO wish_photos (wish_id, image) VALUES ($1, $2), ($3, $2) ON CONFLICT (wish_id) DO NOTHING', [receiverWish, Buffer.from('foto ficticia'), otherWish]);
  assert(await links.readPersonalLinkPhoto(tokenOf(renewed.path), receiverWish));
  assert.equal(await links.readPersonalLinkPhoto(tokenOf(renewed.path), otherWish), null);
  assert.equal(await links.readPersonalLinkPhoto(token, receiverWish), null, 'a replaced link shows nothing');
  assert.equal(await links.readPersonalLinkPhoto(tokenOf(renewed.path), 'no-es-un-id'), null);

  // After the draw an older adult cannot become a child again; a child can become an older adult.
  await assert.rejects(() => links.setRepresentedKind(s.exchangeId, s.guardian, senior, 'child'), /sigue siendo solo suyo/);
  await links.setRepresentedKind(s.exchangeId, s.guardian, child, 'senior');
  assert.equal((await selected.getRepresented(s.exchangeId, s.guardian)).find((p) => p.user_id === child).assignment, null);
  await assert.rejects(() => selected.revealRepresented(s.exchangeId, s.guardian, child), /enlace personal/);
  const childLink = await links.createPersonalLink(s.exchangeId, s.guardian, child);
  const childOpen = await links.openPersonalLink(tokenOf(childLink.path));
  assert.equal(childOpen.papelito.firstTimeNow, false, 'an assignment the representative already saw shows its first opening');

  // The guardian's export shows the type and link dates, never the token or its hash.
  const exported = await exportUserData(s.guardian);
  const people = exported.peopleIRepresent ?? exported.data?.peopleIRepresent;
  const exportedSenior = people.find((p) => p.user_id === senior);
  assert.equal(exportedSenior.represented_kind, 'senior');
  assert.equal(exportedSenior.personal_links.length, 2);
  assert(!JSON.stringify(people).includes('token'));

  // When the exchange ends, the link shows nothing private.
  await query("UPDATE exchanges SET status = 'cancelado' WHERE id = $1", [s.exchangeId]);
  assert.equal((await links.previewPersonalLink(tokenOf(renewed.path))).state, 'closed');
  assert.equal((await links.openPersonalLink(tokenOf(renewed.path))).papelito, null);
  await assert.rejects(() => links.createPersonalLink(s.exchangeId, s.guardian, senior), /ya terminó/);
});
