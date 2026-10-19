import assert from 'node:assert/strict';
import fs from 'node:fs';
import { register } from 'node:module';
import { randomBytes } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import webpush from 'web-push';
register('./ts-loader.mjs', import.meta.url);
process.env.NODE_ENV = 'test';
process.env.INVITATION_TOKEN_SECRET = randomBytes(32).toString('hex');
const { setTestDbAdapter } = await import('../src/lib/db/client.ts');
const { getOrCreateProfile, recordConsent, exportUserData, revokeConsent } = await import('../src/lib/repositories/profiles.ts');
const { createExchangeWithInvitation, acceptInvitationAtomic, manageMemberStatus } = await import('../src/lib/repositories/exchanges.ts');
const { executeAndCommitDraw } = await import('../src/lib/repositories/draw.ts');
const { getMyAssignment } = await import('../src/lib/repositories/assignments.ts');
const { getAnonymousThreads, sendAnonymousMessage, saveGiftPreferences } = await import('../src/lib/repositories/social.ts');
const { createPushService, validatePushSubscription, getPushKeys } = await import('../src/lib/notifications/delivery.ts');
const { LEGAL_CONSTANTS } = await import('../src/lib/legal/constants.ts');
const pg = new PGlite();
for (const file of fs.readdirSync('neon/migrations').sort()) await pg.exec(fs.readFileSync(`neon/migrations/${file}`, 'utf8'));
const query = async (sql, params = []) => { const r = await pg.query(sql, params); return { rows: r.rows, rowCount: r.rows.length || r.affectedRows || 0 }; };
setTestDbAdapter({ query });
const users = ['a', 'b', 'c', 'd', 'outsider'];
try {
  for (const id of users) { await getOrCreateProfile(id, `${id}@example.com`, `Persona ${id}`); await recordConsent(id, LEGAL_CONSTANTS.VERSION, LEGAL_CONSTANTS.VERSION); }
  const input = { name: 'Primera edición', eventDate: '2099-12-24', registrationDeadline: '2099-12-10', budgetAmount: 10000, currency: 'CRC', suggestedTheme: 'navidad', selectedTheme: 'navidad', requiresApproval: true };
  async function fill(created) {
    for (const id of users.slice(1, 4)) { await acceptInvitationAtomic(created.inviteToken, id); await manageMemberStatus(created.exchangeId, id, 'approved', 'a'); }
    await executeAndCommitDraw(created.exchangeId, 'a', 0);
  }
  const original = await createExchangeWithInvitation('a', input); await fill(original);
  const assignment = await getMyAssignment(original.exchangeId, 'a');
  await saveGiftPreferences(assignment.receiverId, { interests: 'Jardinería', colors: 'Verde', sizes: '', avoid: 'Perfumes' });
  const withTastes = await getMyAssignment(original.exchangeId, 'a');
  assert.equal(withTastes.receiverPreferences.interests, 'Jardinería');
  assert.equal(await getMyAssignment(original.exchangeId, 'outsider'), null);
  await assert.rejects(() => saveGiftPreferences('a', { interests: 'x'.repeat(281) }));
  console.log('PASS gustos opcionales, validación y acceso solo mediante la asignación autorizada.');

  const giving = (await getAnonymousThreads(original.exchangeId, 'a')).find(t => t.direction === 'giving');
  const sent = await sendAnonymousMessage(original.exchangeId, giving.id, 'a', '¿Qué color preferís?');
  assert.equal(sent.recipientId, assignment.receiverId);
  const inbox = (await getAnonymousThreads(original.exchangeId, assignment.receiverId)).find(t => t.direction === 'receiving');
  assert.equal(inbox.messages[0].body, '¿Qué color preferís?'); assert.equal(inbox.messages[0].mine, false);
  assert.deepEqual(Object.keys(inbox).sort(), ['direction', 'id', 'messages']);
  assert.deepEqual(Object.keys(inbox.messages[0]).sort(), ['body', 'createdAt', 'id', 'mine']);
  await sendAnonymousMessage(original.exchangeId, giving.id, assignment.receiverId, 'Azul, gracias.');
  assert.equal((await getAnonymousThreads(original.exchangeId, 'a')).find(t => t.id === giving.id).messages[1].mine, false);
  await assert.rejects(() => sendAnonymousMessage(original.exchangeId, giving.id, 'outsider', 'Intruso'), /disponible/);
  await assert.rejects(() => sendAnonymousMessage(original.exchangeId, giving.id, 'a', 'Otra pregunta'), /Esperá/);
  await assert.rejects(() => sendAnonymousMessage(original.exchangeId, giving.id, 'a', 'x'.repeat(1001)), /1000/);
  const exported = await exportUserData('a'); assert.equal(exported.mySentMessages.length, 1);
  assert(!JSON.stringify(exported.mySentMessages).includes('Azul, gracias.'));
  console.log('PASS mensajes bidireccionales sin identidad del amigo secreto, aislamiento, límite y exportación de mensajes propios.');

  const pairSets = new Map(users.slice(0, 4).map(u => [u, new Set()]));
  async function capture(id) { for (const u of users.slice(0, 4)) { const a = await getMyAssignment(id, u); assert(!pairSets.get(u).has(a.receiverId)); pairSets.get(u).add(a.receiverId); } }
  await capture(original.exchangeId);
  let previous = original;
  for (let edition = 2; edition <= 3; edition++) {
    const next = await createExchangeWithInvitation('a', { ...input, name: `Edición ${edition}`, previousExchangeId: previous.exchangeId });
    assert.notEqual(next.inviteToken, previous.inviteToken);
    assert.equal((await query('SELECT count(*) AS n FROM memberships WHERE exchange_id = $1', [next.exchangeId])).rows[0].n, 1);
    await fill(next); await capture(next.exchangeId); previous = next;
  }
  const impossible = await createExchangeWithInvitation('a', { ...input, previousExchangeId: previous.exchangeId });
  await assert.rejects(() => fill(impossible), /No hay una combinación/);
  await assert.rejects(() => createExchangeWithInvitation('outsider', { ...input, previousExchangeId: original.exchangeId }), /Solo podés/);
  assert.equal((await query('SELECT current_draw_version FROM exchanges WHERE id = $1', [impossible.exchangeId])).rows[0].current_draw_version, 0);
  await executeAndCommitDraw(original.exchangeId, 'a', 1, 'Prueba de nueva versión');
  assert(!(await getAnonymousThreads(original.exchangeId, 'a')).some(t => t.id === giving.id));
  await assert.rejects(() => sendAnonymousMessage(original.exchangeId, giving.id, 'a', 'Mensaje viejo'), /disponible/);
  console.log('PASS tres ediciones sin repetir destinatarios, invitaciones nuevas, imposibilidad con rollback y conversaciones anteriores inaccesibles.');

  const keys = webpush.generateVAPIDKeys(); process.env.PUSH_VAPID_PUBLIC_KEY = keys.publicKey; process.env.PUSH_VAPID_PRIVATE_KEY = keys.privateKey;
  const service = createPushService(query);
  const sub = { endpoint: 'https://fcm.googleapis.com/fcm/send/fictional-test', keys: { p256dh: keys.publicKey, auth: randomBytes(16).toString('base64url') } };
  delete process.env.PUSH_VAPID_PUBLIC_KEY; delete process.env.PUSH_VAPID_PRIVATE_KEY;
  const derived = getPushKeys(); assert.deepEqual(derived, getPushKeys()); assert.notEqual(derived.privateKey, process.env.INVITATION_TOKEN_SECRET);
  const encrypted = webpush.generateRequestDetails(sub, 'Aviso genérico', { vapidDetails: { subject: 'mailto:example@example.com', ...derived } });
  assert(Buffer.isBuffer(encrypted.body)); assert(encrypted.headers.Authorization.startsWith('vapid '));
  for (const endpoint of ['http://127.0.0.1/', 'https://example.com/', 'https://fcm.googleapis.com.evil.example/', 'https://fcm.googleapis.com:8443/']) assert.throws(() => validatePushSubscription({ ...sub, endpoint }));
  await service.savePushSubscription('a', sub);
  await assert.rejects(() => service.savePushSubscription('b', sub), /No se pudo vincular/);
  let deliveries = 0;
  const mock = async (_sub, payload) => { deliveries++; assert(!payload.includes('Persona')); assert(!payload.includes('¿Qué color')); return {}; };
  await service.notifyUser('a', 'same-event', { body: 'Aviso general' }, mock);
  await service.notifyUser('a', 'same-event', { body: 'Aviso general' }, mock);
  assert.equal(deliveries, 1);
  await revokeConsent('a'); await service.notifyUser('a', 'after-revocation', { body: 'Aviso' }, mock); assert.equal(deliveries, 1);
  await recordConsent('a', LEGAL_CONSTANTS.VERSION, LEGAL_CONSTANTS.VERSION);
  await service.notifyUser('a', 'expired', { body: 'Aviso' }, async () => { throw { statusCode: 410 }; });
  assert.equal(await service.ownsPushSubscription('a', sub.endpoint), false);
  console.log('PASS push: destinos permitidos, dueño del dispositivo, deduplicación, consentimiento y eliminación de suscripciones vencidas; sin envíos reales.');
  await service.savePushSubscription('a', sub);
  const reminderDate = new Date('2099-12-09T15:00:00Z'); // 09:00 Costa Rica, one day before registration closes.
  const before = deliveries;
  await service.sendDueReminders(new Date('2099-12-09T14:00:00Z'), mock); assert.equal(deliveries, before);
  await service.sendDueReminders(reminderDate, mock); assert(deliveries > before);
  const after = deliveries; await service.sendDueReminders(reminderDate, mock); assert.equal(deliveries, after);
  await service.sendDueReminders(new Date('2099-12-21T15:00:00Z'), mock); assert(deliveries > after);
  const afterThreeDays = deliveries;
  await service.sendDueReminders(new Date('2099-12-23T15:00:00Z'), mock); assert(deliveries > afterThreeDays);
  console.log('PASS recordatorios: horario de Costa Rica, cierre de inscripción, entrega a tres/un día y ejecución repetida sin duplicados.');
} finally { setTestDbAdapter(null); await pg.close(); }
