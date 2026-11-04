import webpush from 'web-push';
import { createECDH, hkdfSync } from 'node:crypto';
import type { DbClient } from '@/lib/db/client';
import { LEGAL_CONSTANTS } from '../legal/constants';
import { PublicError } from '../data/errors';

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
const VAPID_SUBJECT = 'mailto:kennethgeo97@gmail.com';

/**
 * Reminder runs happen hourly from 09:00 to 17:59 in Costa Rica. Outside that
 * window the scheduler does not even open a database connection.
 */
export const REMINDER_FIRST_HOUR = 9;
export const REMINDER_LAST_HOUR = 17;
export function isReminderHour(date: Date) {
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Costa_Rica', hour: '2-digit', hourCycle: 'h23' }).format(date));
  return hour >= REMINDER_FIRST_HOUR && hour <= REMINDER_LAST_HOUR;
}

/**
 * Sends per scheduled run. Cloudflare Workers Free allows 50 external
 * subrequests and 10 ms of CPU per invocation (developers.cloudflare.com/
 * workers/platform/limits, checked 2026-11-02). Each push is one subrequest and
 * the database uses one WebSocket; encrypting one message costs about 0.35 ms
 * of CPU (measured in Node), plus the driver's work. The default keeps a wide
 * margin; PUSH_MAX_SENDS_PER_RUN can lower it, or raise it up to the ceiling
 * once Workers metrics show the CPU actually used.
 */
export const DEFAULT_MAX_SENDS_PER_RUN = 15;
export const MAX_SENDS_PER_RUN_CEILING = 45;
export function parseMaxSendsPerRun(value: string | undefined) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 ? Math.min(parsed, MAX_SENDS_PER_RUN_CEILING) : DEFAULT_MAX_SENDS_PER_RUN;
}

export function getPushPublicKey() { return getPushKeys()?.publicKey || ''; }
export function isPushConfigured() { return !!getPushKeys(); }
export function validatePushSubscription(value: unknown) {
  const input = value as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | null;
  if (!input || typeof input.endpoint !== 'string' || input.endpoint.length > 2048) throw new PublicError('Suscripción inválida.');
  const url = new URL(input.endpoint);
  const host = url.hostname;
  const allowed = host === 'fcm.googleapis.com' || host === 'updates.push.services.mozilla.com' ||
    host.endsWith('.push.services.mozilla.com') || host === 'web.push.apple.com' ||
    host.endsWith('.push.apple.com') || host.endsWith('.notify.windows.com');
  if (url.protocol !== 'https:' || url.port || url.username || url.password || !allowed) throw new PublicError('Proveedor de notificaciones no admitido.');
  const { p256dh, auth } = input.keys || {};
  if (typeof p256dh !== 'string' || !/^[A-Za-z0-9_-]{87}=?$/.test(p256dh) ||
      typeof auth !== 'string' || !/^[A-Za-z0-9_-]{22}={0,2}$/.test(auth)) throw new PublicError('Claves de suscripción inválidas.');
  return { endpoint: input.endpoint, keys: { p256dh, auth } };
}

export function createPushService(dbQuery: DbClient['query']) {
async function savePushSubscription(userId: string, raw: unknown) {
  if (!isPushConfigured()) throw new PublicError('Los recordatorios todavía no están disponibles.');
  const sub = validatePushSubscription(raw);
  const count = await dbQuery<{ count: string }>('SELECT count(*)::text AS count FROM push_subscriptions WHERE user_id = $1', [userId]);
  const result = await dbQuery(`INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
    SELECT $1, $2, $3, $4 WHERE $5::integer < 10
    ON CONFLICT (endpoint) DO UPDATE SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth
      WHERE push_subscriptions.user_id = EXCLUDED.user_id RETURNING id`,
    [userId, sub.endpoint, sub.keys.p256dh, sub.keys.auth, Number(count.rows[0].count)]);
  if (!result.rowCount) throw new PublicError('No se pudo vincular este dispositivo. Desactivá los avisos de la cuenta anterior o eliminá un dispositivo.');
}
async function removePushSubscription(userId: string, endpoint: string) {
  await dbQuery('DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2', [userId, endpoint]);
}
async function ownsPushSubscription(userId: string, endpoint: string) {
  const res = await dbQuery('SELECT id FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2', [userId, endpoint]);
  return res.rowCount > 0;
}

type Sender = typeof webpush.sendNotification;
type DeliveryOptions = {
  send?: Sender;
  onlyEndpoint?: string;
  /** Shared across one run: sends left before stopping (each send is one subrequest). */
  budget?: { remaining: number };
  /** VAPID Authorization per push service origin, signed once per run. */
  vapidCache?: Map<string, string>;
};

function vapidAuthorization(endpoint: string, cache: Map<string, string>) {
  const audience = new URL(endpoint).origin;
  let value = cache.get(audience);
  if (!value) {
    const keys = getPushKeys()!;
    value = webpush.getVapidHeaders(audience, VAPID_SUBJECT, keys.publicKey, keys.privateKey, 'aes128gcm').Authorization;
    cache.set(audience, value);
  }
  return value;
}

async function deliver(userId: string, eventKey: string, message: { body: string; exchangeId?: string }, options: DeliveryOptions = {}) {
  const { send = webpush.sendNotification, onlyEndpoint, budget, vapidCache = new Map<string, string>() } = options;
  if (!isPushConfigured()) return { delivered: 0, failed: 0, deferred: 0 };
  const subscriptions = await dbQuery<{ id: string; endpoint: string; p256dh: string; auth: string }>(`SELECT s.id, s.endpoint, s.p256dh, s.auth
    FROM push_subscriptions s WHERE s.user_id = $1 AND ($3::text IS NULL OR s.endpoint = $3) AND EXISTS (
      SELECT 1 FROM consent_records c WHERE c.id = (SELECT id FROM consent_records WHERE user_id = $1 ORDER BY accepted_at DESC LIMIT 1)
      AND c.revoked_at IS NULL AND c.terms_version = $2 AND c.privacy_version = $2)`, [userId, LEGAL_CONSTANTS.VERSION, onlyEndpoint || null]);
  let delivered = 0, failed = 0, deferred = 0;
  for (const sub of subscriptions.rows) {
    // Out of budget: leave it unclaimed so the next run picks it up.
    if (budget && budget.remaining <= 0) { deferred++; continue; }
    const claim = await dbQuery(`INSERT INTO notification_deliveries (subscription_id, event_key) VALUES ($1, $2)
      ON CONFLICT (subscription_id, event_key) DO UPDATE SET claimed_at = now()
        WHERE notification_deliveries.delivered_at IS NULL AND notification_deliveries.claimed_at < now() - interval '10 minutes'
      RETURNING subscription_id`, [sub.id, eventKey]);
    if (!claim.rowCount) continue;
    if (budget) budget.remaining--;
    try {
      await send({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify({
        title: 'Papelito', body: message.body, tag: eventKey,
        url: message.exchangeId ? `/?intercambio=${encodeURIComponent(message.exchangeId)}` : '/',
      }), {
        TTL: 3600, timeout: 5000,
        // Signed once per push service instead of once per message (CPU on Workers Free).
        // setVapidDetails() is never called, so web-push keeps this header.
        headers: { Authorization: vapidAuthorization(sub.endpoint, vapidCache) },
      });
      await dbQuery('UPDATE notification_deliveries SET delivered_at = now() WHERE subscription_id = $1 AND event_key = $2', [sub.id, eventKey]);
      delivered++;
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) await dbQuery('DELETE FROM push_subscriptions WHERE id = $1', [sub.id]);
      failed++;
    }
  }
  return { delivered, failed, deferred };
}

async function notifyUser(userId: string, eventKey: string, message: { body: string; exchangeId?: string },
  send: Sender = webpush.sendNotification, onlyEndpoint?: string) {
  const { delivered, failed } = await deliver(userId, eventKey, message, { send, onlyEndpoint });
  return { delivered, failed };
}

/**
 * Sends the reminders due now, bounded per run. Whatever does not fit (send
 * budget or time) stays unclaimed and goes out on the next hourly run of the
 * same Costa Rica day; `notification_deliveries` keeps each reminder to one
 * delivery per device. People never attempted for an event go first, so a
 * device that keeps failing cannot hold back the rest.
 */
async function sendDueReminders(referenceNow = new Date(), send: Sender = webpush.sendNotification,
  { maxSends = DEFAULT_MAX_SENDS_PER_RUN, deadlineMs = 20_000 }: { maxSends?: number; deadlineMs?: number } = {}) {
  if (!isReminderHour(referenceNow)) return { delivered: 0, failed: 0, pending: false, skipped: true };
  // SQL uses Costa Rica's calendar, not server time; consent is checked here
  // too so people who cannot receive reminders do not fill the batch.
  const due = await dbQuery<{ user_id: string; exchange_id: string; kind: string; local_date: string }>(`WITH due AS (SELECT m.user_id, e.id AS exchange_id,
    CASE WHEN e.status = 'inscripcion_abierta' AND e.registration_deadline = ($1::timestamptz AT TIME ZONE 'America/Costa_Rica')::date + 1
      THEN 'registration' ELSE 'gift' END AS kind,
    ($1::timestamptz AT TIME ZONE 'America/Costa_Rica')::date::text AS local_date
    FROM exchanges e JOIN memberships m ON m.exchange_id = e.id AND m.status = 'approved'
    WHERE extract(hour FROM $1::timestamptz AT TIME ZONE 'America/Costa_Rica') BETWEEN ${REMINDER_FIRST_HOUR} AND ${REMINDER_LAST_HOUR}
      AND ((e.status = 'inscripcion_abierta' AND e.registration_deadline = ($1::timestamptz AT TIME ZONE 'America/Costa_Rica')::date + 1)
        OR (e.status = 'sorteado' AND e.event_date IN (($1::timestamptz AT TIME ZONE 'America/Costa_Rica')::date + 3, ($1::timestamptz AT TIME ZONE 'America/Costa_Rica')::date + 1)))),
    keyed AS (SELECT d.*, 'reminder:' || d.exchange_id::text || ':' || d.kind || ':' || d.local_date AS event_key FROM due d
      WHERE EXISTS (SELECT 1 FROM consent_records c WHERE c.id = (SELECT id FROM consent_records WHERE user_id = d.user_id ORDER BY accepted_at DESC LIMIT 1)
        AND c.revoked_at IS NULL AND c.terms_version = $2 AND c.privacy_version = $2))
    SELECT k.user_id, k.exchange_id, k.kind, k.local_date FROM keyed k
    WHERE EXISTS (SELECT 1 FROM push_subscriptions s WHERE s.user_id = k.user_id
      AND NOT EXISTS (SELECT 1 FROM notification_deliveries n WHERE n.subscription_id = s.id AND n.event_key = k.event_key
        AND (n.delivered_at IS NOT NULL OR n.claimed_at >= now() - interval '10 minutes')))
    ORDER BY EXISTS (SELECT 1 FROM push_subscriptions s JOIN notification_deliveries n ON n.subscription_id = s.id
        WHERE s.user_id = k.user_id AND n.event_key = k.event_key), k.exchange_id, k.user_id
    LIMIT $3`, [referenceNow.toISOString(), LEGAL_CONSTANTS.VERSION, maxSends]);
  let delivered = 0, failed = 0, pending = due.rowCount >= maxSends;
  const budget = { remaining: maxSends };
  const vapidCache = new Map<string, string>();
  const startedAt = Date.now();
  for (const row of due.rows) {
    if (budget.remaining <= 0 || Date.now() - startedAt > deadlineMs) { pending = true; break; }
    const result = await deliver(row.user_id, `reminder:${row.exchange_id}:${row.kind}:${row.local_date}`, {
      exchangeId: row.exchange_id,
      body: row.kind === 'registration' ? 'Mañana cierra la inscripción de uno de tus intercambios. Revisá los detalles en Papelito.' : 'Se acerca la entrega de regalos. Revisá la fecha y tus pendientes en Papelito.',
    }, { send, budget, vapidCache });
    delivered += result.delivered; failed += result.failed;
    if (result.deferred) pending = true;
  }
  await dbQuery("DELETE FROM notification_deliveries WHERE claimed_at < now() - interval '30 days'");
  return { delivered, failed, pending, skipped: false };
}

return { savePushSubscription, removePushSubscription, ownsPushSubscription, notifyUser, sendDueReminders };
}
