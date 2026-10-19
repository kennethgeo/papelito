import webpush from 'web-push';
import { createECDH, hkdfSync } from 'node:crypto';
import type { DbClient } from '@/lib/db/client';
import { LEGAL_CONSTANTS } from '../legal/constants';

export function getPushKeys() {
  const publicKey = process.env.PUSH_VAPID_PUBLIC_KEY;
  const privateKey = process.env.PUSH_VAPID_PRIVATE_KEY;
  if (publicKey && privateKey) return { publicKey, privateKey };
  if (publicKey || privateKey) return null; // Never mix a configured key with a derived one.
  const secret = process.env.INVITATION_TOKEN_SECRET;
  if (!secret || secret.length < 32) return null;
  // Separate cryptographic purpose from invitation encryption; no extra production secret is required.
  const scalar = Buffer.from(hkdfSync('sha256', Buffer.from(secret), Buffer.from('papelito-web-push-v1'), Buffer.from('vapid-p256-signing-key'), 32));
  const ec = createECDH('prime256v1'); ec.setPrivateKey(scalar);
  return { publicKey: ec.getPublicKey().toString('base64url'), privateKey: ec.getPrivateKey().toString('base64url') };
}
export function getPushPublicKey() { return getPushKeys()?.publicKey || ''; }
export function isPushConfigured() { return !!getPushKeys(); }
export function validatePushSubscription(value: unknown) {
  const input = value as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | null;
  if (!input || typeof input.endpoint !== 'string' || input.endpoint.length > 2048) throw new Error('Suscripción inválida.');
  const url = new URL(input.endpoint);
  const host = url.hostname;
  const allowed = host === 'fcm.googleapis.com' || host === 'updates.push.services.mozilla.com' ||
    host.endsWith('.push.services.mozilla.com') || host === 'web.push.apple.com' ||
    host.endsWith('.push.apple.com') || host.endsWith('.notify.windows.com');
  if (url.protocol !== 'https:' || url.port || url.username || url.password || !allowed) throw new Error('Proveedor de notificaciones no admitido.');
  const { p256dh, auth } = input.keys || {};
  if (typeof p256dh !== 'string' || !/^[A-Za-z0-9_-]{87}=?$/.test(p256dh) ||
      typeof auth !== 'string' || !/^[A-Za-z0-9_-]{22}={0,2}$/.test(auth)) throw new Error('Claves de suscripción inválidas.');
  return { endpoint: input.endpoint, keys: { p256dh, auth } };
}

export function createPushService(dbQuery: DbClient['query']) {
async function savePushSubscription(userId: string, raw: unknown) {
  if (!isPushConfigured()) throw new Error('Los recordatorios todavía no están disponibles.');
  const sub = validatePushSubscription(raw);
  const count = await dbQuery<{ count: string }>('SELECT count(*)::text AS count FROM push_subscriptions WHERE user_id = $1', [userId]);
  const result = await dbQuery(`INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
    SELECT $1, $2, $3, $4 WHERE $5::integer < 10
    ON CONFLICT (endpoint) DO UPDATE SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth
      WHERE push_subscriptions.user_id = EXCLUDED.user_id RETURNING id`,
    [userId, sub.endpoint, sub.keys.p256dh, sub.keys.auth, Number(count.rows[0].count)]);
  if (!result.rowCount) throw new Error('No se pudo vincular este dispositivo. Desactivá los avisos de la cuenta anterior o eliminá un dispositivo.');
}
async function removePushSubscription(userId: string, endpoint: string) {
  await dbQuery('DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2', [userId, endpoint]);
}
async function ownsPushSubscription(userId: string, endpoint: string) {
  const res = await dbQuery('SELECT id FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2', [userId, endpoint]);
  return res.rowCount > 0;
}

async function notifyUser(userId: string, eventKey: string, message: { body: string; exchangeId?: string },
  send: typeof webpush.sendNotification = webpush.sendNotification, onlyEndpoint?: string) {
  if (!isPushConfigured()) return { delivered: 0, failed: 0 };
  const subscriptions = await dbQuery<{ id: string; endpoint: string; p256dh: string; auth: string }>(`SELECT s.id, s.endpoint, s.p256dh, s.auth
    FROM push_subscriptions s WHERE s.user_id = $1 AND ($3::text IS NULL OR s.endpoint = $3) AND EXISTS (
      SELECT 1 FROM consent_records c WHERE c.id = (SELECT id FROM consent_records WHERE user_id = $1 ORDER BY accepted_at DESC LIMIT 1)
      AND c.revoked_at IS NULL AND c.terms_version = $2 AND c.privacy_version = $2)`, [userId, LEGAL_CONSTANTS.VERSION, onlyEndpoint || null]);
  let delivered = 0, failed = 0;
  for (const sub of subscriptions.rows) {
    const claim = await dbQuery(`INSERT INTO notification_deliveries (subscription_id, event_key) VALUES ($1, $2)
      ON CONFLICT (subscription_id, event_key) DO UPDATE SET claimed_at = now()
        WHERE notification_deliveries.delivered_at IS NULL AND notification_deliveries.claimed_at < now() - interval '10 minutes'
      RETURNING subscription_id`, [sub.id, eventKey]);
    if (!claim.rowCount) continue;
    try {
      await send({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify({
        title: 'Papelito', body: message.body, tag: eventKey,
        url: message.exchangeId ? `/?intercambio=${encodeURIComponent(message.exchangeId)}` : '/',
      }), {
        TTL: 3600, timeout: 5000,
        vapidDetails: { subject: 'mailto:kennethgeo97@gmail.com', ...getPushKeys()! },
      });
      await dbQuery('UPDATE notification_deliveries SET delivered_at = now() WHERE subscription_id = $1 AND event_key = $2', [sub.id, eventKey]);
      delivered++;
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) await dbQuery('DELETE FROM push_subscriptions WHERE id = $1', [sub.id]);
      failed++;
    }
  }
  return { delivered, failed };
}

async function sendDueReminders(referenceNow = new Date(), send: typeof webpush.sendNotification = webpush.sendNotification) {
  // One local morning batch, with hourly retries; SQL uses Costa Rica's calendar, not server time.
  const due = await dbQuery<{ user_id: string; exchange_id: string; kind: string; local_date: string }>(`WITH due AS (SELECT m.user_id, e.id AS exchange_id,
    CASE WHEN e.status = 'inscripcion_abierta' AND e.registration_deadline = ($1::timestamptz AT TIME ZONE 'America/Costa_Rica')::date + 1
      THEN 'registration' ELSE 'gift' END AS kind,
    ($1::timestamptz AT TIME ZONE 'America/Costa_Rica')::date::text AS local_date
    FROM exchanges e JOIN memberships m ON m.exchange_id = e.id AND m.status = 'approved'
    WHERE extract(hour FROM $1::timestamptz AT TIME ZONE 'America/Costa_Rica') BETWEEN 9 AND 17
      AND ((e.status = 'inscripcion_abierta' AND e.registration_deadline = ($1::timestamptz AT TIME ZONE 'America/Costa_Rica')::date + 1)
        OR (e.status = 'sorteado' AND e.event_date IN (($1::timestamptz AT TIME ZONE 'America/Costa_Rica')::date + 3, ($1::timestamptz AT TIME ZONE 'America/Costa_Rica')::date + 1))))
    SELECT d.* FROM due d WHERE EXISTS (SELECT 1 FROM push_subscriptions s WHERE s.user_id = d.user_id
      AND NOT EXISTS (SELECT 1 FROM notification_deliveries n WHERE n.subscription_id = s.id
        AND n.event_key = 'reminder:' || d.exchange_id::text || ':' || d.kind || ':' || d.local_date
        AND (n.delivered_at IS NOT NULL OR n.claimed_at >= now() - interval '10 minutes')))
    ORDER BY d.exchange_id, d.user_id LIMIT 100`, [referenceNow.toISOString()]);
  let delivered = 0, failed = 0;
  const startedAt = Date.now();
  for (const row of due.rows) {
    if (Date.now() - startedAt > 20_000) break;
    const result = await notifyUser(row.user_id, `reminder:${row.exchange_id}:${row.kind}:${row.local_date}`, {
      exchangeId: row.exchange_id,
      body: row.kind === 'registration' ? 'Mañana cierra la inscripción de uno de tus intercambios. Revisá los detalles en Papelito.' : 'Se acerca la entrega de regalos. Revisá la fecha y tus pendientes en Papelito.',
    }, send);
    delivered += result.delivered; failed += result.failed;
  }
  await dbQuery("DELETE FROM notification_deliveries WHERE claimed_at < now() - interval '30 days'");
  return { delivered, failed };
}

return { savePushSubscription, removePushSubscription, ownsPushSubscription, notifyUser, sendDueReminders };
}
