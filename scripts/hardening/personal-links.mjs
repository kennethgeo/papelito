// People who open their own papelito with a personal link (for example, older
// adults): no account, and the assignment is never sent to the representative's
// account. Managed people (for example, children) keep the previous behaviour.
// Opening is explicit and its first time stays visible, so an opening by
// someone else can be seen. The link's secret never appears in a URL path.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const test = globalThis.__papelitoTest;
const { query, setDatabaseDown } = globalThis.__papelitoHardening;
const { getOrCreateProfile, recordConsent, exportUserData } = await import('../../src/lib/repositories/profiles.ts');
const ex = await import('../../src/lib/repositories/exchanges.ts');
const { executeAndCommitDraw } = await import('../../src/lib/repositories/draw.ts');
const { saveWish, toggleWishInExchange } = await import('../../src/lib/repositories/wishes.ts');
const { readWishPhoto } = await import('../../src/lib/repositories/photos.ts');
const selected = await import('../../src/lib/repositories/selected-features.ts');
const links = await import('../../src/lib/repositories/personal-links.ts');
const publicActions = await import('../../src/lib/data/personal-link-actions.ts');
const { LEGAL_CONSTANTS } = await import('../../src/lib/legal/constants.ts');

const input = { name: 'Familia ficticia', eventDate: '2099-12-24', registrationDeadline: '2099-12-10', budgetAmount: 15000, currency: 'CRC', suggestedTheme: 'navidad', selectedTheme: 'navidad', requiresApproval: true };
const tokenOf = (path) => path.split('#')[1];
const photo = Buffer.from('foto ficticia');

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
const addPhoto = (wishId) => query('INSERT INTO wish_photos (wish_id, image) VALUES ($1, $2) ON CONFLICT (wish_id) DO NOTHING', [wishId, photo]);

test('enlace personal: elección al inscribir, solo para quien abre personalmente y estados antes del sorteo', async () => {
  const s = await setup('pl1');
  await assert.rejects(() => selected.addRepresented(s.exchangeId, s.guardian, 'Sin elección', true, 'adulto'), /Elegí si vos gestionás/);
  const personal = await selected.addRepresented(s.exchangeId, s.guardian, 'Abuela Rosa', true, 'personal');
  const managed = await selected.addRepresented(s.exchangeId, s.guardian, 'Nieto Leo', true, 'managed');
  await assert.rejects(() => links.createPersonalLink(s.exchangeId, s.guardian, managed), /abre su papelito personalmente/);
  await assert.rejects(() => links.createPersonalLink(s.exchangeId, s.ana, personal), /a tu cargo/);

  // The secret travels in the URL fragment: never in a path, a query or a header.
  const first = await links.createPersonalLink(s.exchangeId, s.guardian, personal);
  assert.match(first.path, /^\/papelito#[0-9a-f]{64}$/);
  assert.equal((await links.previewPersonalLink(tokenOf(first.path))).state, 'waiting');
  assert.equal((await links.previewPersonalLink(tokenOf(first.path))).reason, 'approval', 'pending until the organizer approves');
  await ex.manageMemberStatus(s.exchangeId, personal, 'approved', s.org);
  const waiting = await links.previewPersonalLink(tokenOf(first.path));
  assert.equal(waiting.state, 'waiting'); assert.equal(waiting.reason, 'draw'); assert.equal(waiting.alias, 'Abuela Rosa');
  assert.equal((await links.openPersonalLink(tokenOf(first.path))).papelito, null);

  // Only the hash is stored, and a new link replaces the previous one.
  const stored = await query('SELECT token_hash FROM represented_access_links WHERE represented_user_id = $1', [personal]);
  assert(!stored.rows.some((r) => r.token_hash === tokenOf(first.path)));
  const second = await links.createPersonalLink(s.exchangeId, s.guardian, personal);
  assert.equal((await links.previewPersonalLink(tokenOf(first.path))).state, 'invalid');
  assert.notEqual((await links.previewPersonalLink(tokenOf(second.path))).state, 'invalid');
  for (const bad of ['', 'corto', 'x'.repeat(64), 'A'.repeat(64), '../../etc/passwd', null, { token: 1 }]) {
    assert.equal((await links.previewPersonalLink(bad)).state, 'invalid');
    assert.equal((await links.openPersonalLink(bad)).papelito, null);
  }

  // Before the draw the choice can go back to managed; that revokes the link.
  await links.setRepresentedAccess(s.exchangeId, s.guardian, personal, 'managed');
  assert.equal((await links.previewPersonalLink(tokenOf(second.path))).state, 'invalid');
  await links.setRepresentedAccess(s.exchangeId, s.guardian, personal, 'personal');
});

test('enlace personal: la asignación no llega a la cuenta de quien representa y la primera apertura queda visible', async () => {
  const s = await setup('pl2');
  const personal = await selected.addRepresented(s.exchangeId, s.guardian, 'Abuelo Tito', true, 'personal');
  const managed = await selected.addRepresented(s.exchangeId, s.guardian, 'Nieta Sofi', true, 'managed');
  for (const id of [personal, managed]) await ex.manageMemberStatus(s.exchangeId, id, 'approved', s.org);
  for (const id of [s.org, s.guardian, s.ana, s.beto]) await shareWish(id, s.exchangeId, `Idea de ${id}`);
  await selected.representedWish(s.exchangeId, s.guardian, personal, 'Bufanda de lana');
  await selected.representedWish(s.exchangeId, s.guardian, managed, 'Rompecabezas');
  const { path } = await links.createPersonalLink(s.exchangeId, s.guardian, personal);
  const token = tokenOf(path);
  await executeAndCommitDraw(s.exchangeId, s.org, 0);

  const receiver = (await query(`SELECT a.receiver_id, p.alias FROM assignments a JOIN profiles p ON p.user_id = a.receiver_id
    JOIN exchanges e ON e.id = a.exchange_id JOIN draw_versions dv ON dv.id = a.draw_version_id AND dv.version_number = e.current_draw_version
    WHERE a.exchange_id = $1 AND a.giver_id = $2`, [s.exchangeId, personal])).rows[0];

  // The representative's account receives no assignment for this person.
  const view = await selected.getRepresented(s.exchangeId, s.guardian);
  const personalView = view.find((p) => p.user_id === personal);
  const managedView = view.find((p) => p.user_id === managed);
  assert.equal(personalView.access, 'personal'); assert.equal(personalView.assignment, null); assert.equal(personalView.opened, false);
  assert(personalView.link?.createdAt);
  assert(!JSON.stringify(personalView).includes(receiver.receiver_id));
  assert.equal(managedView.access, 'managed'); assert(managedView.assignment, 'managed people keep the previous behaviour');
  await assert.rejects(() => selected.revealRepresented(s.exchangeId, s.guardian, personal), /enlace personal/);
  await selected.revealRepresented(s.exchangeId, s.guardian, managed);

  // Looking at the page before opening records nothing.
  assert.equal((await links.previewPersonalLink(token)).state, 'ready');
  assert.equal((await query('SELECT open_count FROM represented_access_links WHERE represented_user_id = $1', [personal])).rows[0].open_count, 0);

  const opened = await links.openPersonalLink(token);
  assert.equal(opened.papelito.receiverAlias, receiver.alias);
  assert.equal(opened.papelito.firstTimeNow, true);
  assert(opened.papelito.firstOpenedAt);
  assert.equal(opened.papelito.budgetAmount, 15000);
  const shownWishes = opened.papelito.wishes.map((w) => w.title);
  assert(shownWishes.length >= 1, 'the receiver\'s shared wishes are shown');
  assert(!shownWishes.includes('Bufanda de lana'), 'never the person\'s own wishes');

  const again = await links.openPersonalLink(token);
  assert.equal(again.papelito.firstTimeNow, false);
  assert.equal(again.papelito.firstOpenedAt, opened.papelito.firstOpenedAt, 'the first opening stays visible');
  const after = (await selected.getRepresented(s.exchangeId, s.guardian)).find((p) => p.user_id === personal);
  assert.equal(after.opened, true); assert.equal(after.link.openCount, 2); assert.equal(after.assignment, null);

  // A new link cannot hide an earlier opening (for example, by whoever created the links).
  const renewed = await links.createPersonalLink(s.exchangeId, s.guardian, personal);
  assert.equal((await links.openPersonalLink(token)).preview.state, 'invalid');
  const viaNew = await links.openPersonalLink(tokenOf(renewed.path));
  assert.equal(viaNew.papelito.firstTimeNow, false);
  assert.equal(viaNew.papelito.firstOpenedAt, opened.papelito.firstOpenedAt);

  // After the draw the choice cannot go back to managed; managed can become personal.
  await assert.rejects(() => links.setRepresentedAccess(s.exchangeId, s.guardian, personal, 'managed'), /lo sigue abriendo así/);
  await links.setRepresentedAccess(s.exchangeId, s.guardian, managed, 'personal');
  assert.equal((await selected.getRepresented(s.exchangeId, s.guardian)).find((p) => p.user_id === managed).assignment, null);
  await assert.rejects(() => selected.revealRepresented(s.exchangeId, s.guardian, managed), /enlace personal/);
  const managedLink = await links.createPersonalLink(s.exchangeId, s.guardian, managed);
  const managedOpen = await links.openPersonalLink(tokenOf(managedLink.path));
  assert.equal(managedOpen.papelito.firstTimeNow, false, 'an assignment the representative already saw shows its first opening');

  // A new draw is a new papelito: the old assignment is gone and nothing is mixed.
  await executeAndCommitDraw(s.exchangeId, s.org, 1, 'Prueba de un sorteo nuevo');
  const redrawn = await links.openPersonalLink(tokenOf(renewed.path));
  const newReceiver = (await query(`SELECT p.alias FROM assignments a JOIN profiles p ON p.user_id = a.receiver_id
    JOIN exchanges e ON e.id = a.exchange_id JOIN draw_versions dv ON dv.id = a.draw_version_id AND dv.version_number = e.current_draw_version
    WHERE a.exchange_id = $1 AND a.giver_id = $2`, [s.exchangeId, personal])).rows[0];
  assert.equal(redrawn.papelito.receiverAlias, newReceiver.alias);
  assert.equal(redrawn.papelito.firstTimeNow, true, 'the new assignment had not been opened');

  // The guardian's export shows the choice and link dates, never the link or its hash.
  const exported = await exportUserData(s.guardian);
  const people = exported.peopleIRepresent ?? exported.data?.peopleIRepresent;
  const exportedPersonal = people.find((p) => p.user_id === personal);
  assert.equal(exportedPersonal.represented_access, 'personal');
  assert.equal(exportedPersonal.personal_links.length, 2);
  assert(!JSON.stringify(people).includes('token'));

  // When the exchange ends, the link shows nothing private.
  await query("UPDATE exchanges SET status = 'cancelado' WHERE id = $1", [s.exchangeId]);
  assert.equal((await links.previewPersonalLink(tokenOf(renewed.path))).state, 'closed');
  assert.equal((await links.openPersonalLink(tokenOf(renewed.path))).papelito, null);
  await assert.rejects(() => links.createPersonalLink(s.exchangeId, s.guardian, personal), /ya terminó/);
});

test('enlace personal: las fotos tienen permiso propio (solo deseos compartidos por el destinatario vigente)', async () => {
  const s = await setup('pl3');
  const personal = await selected.addRepresented(s.exchangeId, s.guardian, 'Tía Mirna', true, 'personal');
  await ex.manageMemberStatus(s.exchangeId, personal, 'approved', s.org);
  const shared = {}; const unshared = {};
  for (const id of [s.org, s.guardian, s.ana, s.beto]) {
    shared[id] = await shareWish(id, s.exchangeId, `Compartido de ${id}`);
    unshared[id] = (await saveWish(id, { title: `Privado de ${id}` })).wishId;
    await addPhoto(shared[id]); await addPhoto(unshared[id]);
  }
  await selected.representedWish(s.exchangeId, s.guardian, personal, 'Deseo propio con foto');
  const ownWish = (await query('SELECT id FROM wishes WHERE user_id = $1', [personal])).rows[0].id;
  await addPhoto(ownWish);
  const token = tokenOf((await links.createPersonalLink(s.exchangeId, s.guardian, personal)).path);

  assert.equal(await links.readPersonalLinkPhoto(token, shared[s.ana]), null, 'nothing before the draw');
  await executeAndCommitDraw(s.exchangeId, s.org, 0);
  const receiverId = (await query(`SELECT a.receiver_id FROM assignments a JOIN exchanges e ON e.id = a.exchange_id
    JOIN draw_versions dv ON dv.id = a.draw_version_id AND dv.version_number = e.current_draw_version
    WHERE a.exchange_id = $1 AND a.giver_id = $2`, [s.exchangeId, personal])).rows[0].receiver_id;
  assert.equal(await links.readPersonalLinkPhoto(token, shared[receiverId]), null, 'nothing before the papelito is opened');
  await links.openPersonalLink(token);

  assert(await links.readPersonalLinkPhoto(token, shared[receiverId]), 'the receiver\'s shared wish');
  assert.equal(await links.readPersonalLinkPhoto(token, unshared[receiverId]), null, 'a wish the receiver did not share in this exchange');
  for (const other of [s.org, s.guardian, s.ana, s.beto].filter((id) => id !== receiverId)) {
    assert.equal(await links.readPersonalLinkPhoto(token, shared[other]), null, 'another participant\'s wish');
  }
  // The account rule would allow a person's own wish; the link's rule does not.
  assert(await readWishPhoto(personal, ownWish), 'the account rule covers own wishes');
  assert.equal(await links.readPersonalLinkPhoto(token, ownWish), null, 'the link never serves the person\'s own wishes');
  assert.equal(await links.readPersonalLinkPhoto(token, 'no-es-un-id'), null);
  assert.equal(await links.readPersonalLinkPhoto('f'.repeat(64), shared[receiverId]), null, 'an unknown link');

  // A replaced link and a new draw both end the access.
  const renewed = tokenOf((await links.createPersonalLink(s.exchangeId, s.guardian, personal)).path);
  assert.equal(await links.readPersonalLinkPhoto(token, shared[receiverId]), null, 'a replaced link shows nothing');
  assert(await links.readPersonalLinkPhoto(renewed, shared[receiverId]));
  await executeAndCommitDraw(s.exchangeId, s.org, 1, 'Prueba de un sorteo nuevo');
  assert.equal(await links.readPersonalLinkPhoto(renewed, shared[receiverId]), null, 'the new papelito has not been opened');
});

test('enlace personal: una falla del servicio no se presenta como enlace inválido y el secreto no viaja en rutas', async () => {
  const s = await setup('pl4');
  const personal = await selected.addRepresented(s.exchangeId, s.guardian, 'Don Chepe', true, 'personal');
  await ex.manageMemberStatus(s.exchangeId, personal, 'approved', s.org);
  const token = tokenOf((await links.createPersonalLink(s.exchangeId, s.guardian, personal)).path);
  const errors = [];
  const original = console.error;
  console.error = (line) => errors.push(String(line));
  setDatabaseDown(true);
  try {
    for (const action of [publicActions.previewPersonalPapelitoAction, publicActions.openPersonalPapelitoAction]) {
      const result = await action(token);
      assert.equal(result.success, false, 'an outage is a failure, not an invalid link');
      assert(!/inválid|no disponible/i.test(result.error));
    }
  } finally { setDatabaseDown(false); console.error = original; }
  assert(errors.length >= 2 && errors.every((line) => !line.includes(token) && !line.includes('example.com')), 'logs never contain the secret');
  const ok = await publicActions.previewPersonalPapelitoAction(token);
  assert.equal(ok.success, true); assert.equal(ok.data.state, 'waiting');

  // No route takes the secret as a path segment or query: only POST bodies.
  assert(!fs.existsSync('src/app/papelito/[token]'), 'the page has no token segment');
  assert(!fs.existsSync('src/app/api/papelito/[token]'), 'the photo route has no token segment');
  const page = fs.readFileSync('src/components/PersonalPapelito.tsx', 'utf8');
  assert.match(page, /window\.location\.hash/);
  assert.doesNotMatch(page, /\/papelito\/\$\{|searchParams|\?token=/);
});
