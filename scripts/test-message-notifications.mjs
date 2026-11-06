import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomBytes } from 'node:crypto';
import { register } from 'node:module';
import { mock } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import webpush from 'web-push';

register('./ts-loader.mjs', import.meta.url);
process.env.NODE_ENV = 'test';
process.env.INVITATION_TOKEN_SECRET = randomBytes(32).toString('hex');
const keys = webpush.generateVAPIDKeys();
process.env.PUSH_VAPID_PUBLIC_KEY = keys.publicKey;
process.env.PUSH_VAPID_PRIVATE_KEY = keys.privateKey;
const pg = new PGlite();
for (const file of fs.readdirSync('neon/migrations').sort()) await pg.exec(fs.readFileSync(`neon/migrations/${file}`, 'utf8'));
const query = async (sql, params = []) => { const r = await pg.query(sql, params); return { rows: r.rows, rowCount: r.rows.length || r.affectedRows || 0 }; };
const { setTestDbAdapter } = await import('../src/lib/db/client.ts');
setTestDbAdapter({ query });
const { createPushService, getPushPublicKey, isPushConfigured } = await import('../src/lib/notifications/delivery.ts');
const push = createPushService(query);
let account = 'giver', failDelivery = false;
const deliveries = [];
const transport = async (sub, payload) => {
  deliveries.push({ endpoint: sub.endpoint, payload: JSON.parse(payload) });
  if (failDelivery) throw new Error('Fictional provider outage');
  return {};
};
mock.module('../src/lib/auth/server.ts', { namedExports: { getServerSession: async () => account ? { user: { id: account } } : null } });
mock.module('../src/lib/notifications/push.ts', { namedExports: {
  getPushPublicKey, isPushConfigured,
  savePushSubscription: push.savePushSubscription, removePushSubscription: push.removePushSubscription, ownsPushSubscription: push.ownsPushSubscription,
  notifyUser: (userId, eventKey, message) => push.notifyUser(userId, eventKey, message, transport),
} });
try {
  const { getOrCreateProfile, recordConsent } = await import('../src/lib/repositories/profiles.ts');
  const { LEGAL_CONSTANTS } = await import('../src/lib/legal/constants.ts');
  const ex = await import('../src/lib/repositories/exchanges.ts');
  const { executeAndCommitDraw } = await import('../src/lib/repositories/draw.ts');
  const { getMyAssignment } = await import('../src/lib/repositories/assignments.ts');
  const { getAnonymousThreads } = await import('../src/lib/repositories/social.ts');
  const { sendAnonymousMessageAction } = await import('../src/lib/data/social-actions.ts');
  for (const id of ['giver', 'other', 'third', 'outsider']) {
    await getOrCreateProfile(id, `${id}@example.com`, `Nombre privado ${id}`);
    await recordConsent(id, LEGAL_CONSTANTS.VERSION, LEGAL_CONSTANTS.VERSION);
    await push.savePushSubscription(id, { endpoint: `https://fcm.googleapis.com/fcm/send/ficticio-${id}`, keys: { p256dh: keys.publicKey, auth: randomBytes(16).toString('base64url') } });
  }
  const group = await ex.createExchangeWithInvitation('giver', { name: 'Grupo ficticio', eventDate: '2099-12-24', registrationDeadline: '2099-12-10', budgetAmount: 5000, currency: 'CRC', suggestedTheme: 'navidad', selectedTheme: 'navidad', requiresApproval: false });
  for (const id of ['other', 'third']) await ex.acceptInvitationAtomic(group.inviteToken, id);
  await executeAndCommitDraw(group.exchangeId, 'giver', 0);
  const receiver = (await getMyAssignment(group.exchangeId, 'giver')).receiverId;
  const thread = (await getAnonymousThreads(group.exchangeId, 'giver')).find(t => t.direction === 'giving');
  assert.equal((await sendAnonymousMessageAction(group.exchangeId, thread.id, '¿Te gustaría un libro de cocina?')).success, true);
  assert.equal(deliveries.length, 1);
  assert.equal(deliveries[0].endpoint, `https://fcm.googleapis.com/fcm/send/ficticio-${receiver}`);
  assert.deepEqual(Object.keys(deliveries[0].payload).sort(), ['body', 'tag', 'title', 'url']);
  assert.equal(deliveries[0].payload.body, 'Tenés un mensaje nuevo en tu intercambio. Abrí Papelito para leerlo.');
  assert.equal(deliveries[0].payload.url, `/?intercambio=${group.exchangeId}`);
  assert.match(deliveries[0].payload.tag, /^message:[0-9a-f-]{36}$/i);
  assert(!JSON.stringify(deliveries[0].payload).includes('libro de cocina'));
  assert(!JSON.stringify(deliveries[0].payload).includes('Nombre privado'));
  account = 'outsider';
  assert.equal((await sendAnonymousMessageAction(group.exchangeId, thread.id, 'Intrusión')).success, false);
  account = null;
  assert.equal((await sendAnonymousMessageAction(group.exchangeId, thread.id, 'Sin sesión')).success, false);
  assert.equal(deliveries.length, 1);
  account = receiver; failDelivery = true;
  assert.equal((await sendAnonymousMessageAction(group.exchangeId, thread.id, 'Sí, me encantaría.')).success, true);
  assert.equal(deliveries[1].endpoint, 'https://fcm.googleapis.com/fcm/send/ficticio-giver');
  assert.equal((await getAnonymousThreads(group.exchangeId, 'giver')).find(t => t.id === thread.id).messages.length, 2);
  console.log('PASS mensajes → notificaciones: destinatario correcto en pregunta y respuesta, aviso sin identidad ni contenido privado, terceros bloqueados y mensaje conservado si falla el proveedor. Transporte simulado; sin envíos reales.');
} finally {
  mock.restoreAll();
  await pg.close();
}
