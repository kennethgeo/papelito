import 'server-only';
import crypto from 'node:crypto';
import { dbQuery, dbTransaction, type DbClient } from '@/lib/db/client';
import { PublicError } from '@/lib/data/errors';
import { toIsoTimestamp } from '@/lib/date/timestamps';
import { EMPTY_GIFT_PREFERENCES, type GiftPreferences } from '@/lib/gift-preferences';
import { getMyAssignment, revealAssignment } from './assignments';
import { readWishPhoto } from './photos';
import type { Currency } from '@/types';

/**
 * Who a represented person is, chosen by their representative:
 * - 'child': the representative manages everything and can see the assignment.
 * - 'senior': an older adult who opens their own papelito with a personal link,
 *   without an account; the representative cannot see the assignment.
 * Rows created before this choice existed (NULL) behave as 'child'.
 */
export type RepresentedKind = 'child' | 'senior';

export function parseRepresentedKind(value: unknown): RepresentedKind {
  if (value === 'child' || value === 'senior') return value;
  throw new PublicError('Elegí si es una niña o un niño, o una persona adulta mayor.');
}
export const kindOf = (value: string | null | undefined): RepresentedKind => (value === 'senior' ? 'senior' : 'child');

const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');
const CLOSED = ['finalizado', 'cancelado'];

async function ownedRepresented(client: DbClient, exchangeId: string, guardianId: string, representedId: string) {
  const res = await client.query<{ kind: string | null; exchange_status: string }>(
    `SELECT p.represented_kind AS kind, e.status AS exchange_status
     FROM profiles p
     JOIN exchanges e ON e.id = p.represented_exchange_id
     JOIN memberships g ON g.exchange_id = e.id AND g.user_id = $2 AND g.status = 'approved'
     WHERE p.user_id = $3 AND p.guardian_user_id = $2 AND p.represented_exchange_id = $1`,
    [exchangeId, guardianId, representedId],
  );
  if (!res.rows[0]) throw new PublicError('Esta persona no está a tu cargo en el intercambio.');
  return { kind: kindOf(res.rows[0].kind), exchangeStatus: res.rows[0].exchange_status };
}

/** Throws when the representative must not see this person's assignment. */
export async function assertRepresentativeMaySeeAssignment(exchangeId: string, guardianId: string, representedId: string) {
  const current = await ownedRepresented({ query: dbQuery }, exchangeId, guardianId, representedId);
  if (current.kind === 'senior') throw new PublicError('Su papelito solo se ve con su enlace personal.');
}

/**
 * Changes who the person is. Becoming 'senior' is always allowed (it only
 * hides the assignment from the representative). Going back to 'child' is
 * allowed only before the draw, so nobody can switch, look and switch back.
 */
export async function setRepresentedKind(exchangeId: string, guardianId: string, representedId: string, value: unknown) {
  const kind = parseRepresentedKind(value);
  return dbTransaction(async (client) => {
    await client.query('SELECT id FROM exchanges WHERE id = $1 FOR UPDATE', [exchangeId]);
    const current = await ownedRepresented(client, exchangeId, guardianId, representedId);
    if (CLOSED.includes(current.exchangeStatus)) throw new PublicError('Este intercambio ya terminó.');
    if (current.kind === kind) return { kind };
    if (kind === 'child' && current.exchangeStatus !== 'inscripcion_abierta') {
      throw new PublicError('Después del sorteo, el papelito de una persona adulta mayor sigue siendo solo suyo.');
    }
    await client.query('UPDATE profiles SET represented_kind = $2, updated_at = now() WHERE user_id = $1', [representedId, kind]);
    if (kind === 'child') {
      await client.query('UPDATE represented_access_links SET revoked_at = now() WHERE represented_user_id = $1 AND revoked_at IS NULL', [representedId]);
    }
    return { kind };
  });
}

/**
 * Creates the personal link and returns it once: only its hash is stored.
 * Any previous link stops working.
 */
export async function createPersonalLink(exchangeId: string, guardianId: string, representedId: string) {
  return dbTransaction(async (client) => {
    await client.query('SELECT id FROM exchanges WHERE id = $1 FOR UPDATE', [exchangeId]);
    const current = await ownedRepresented(client, exchangeId, guardianId, representedId);
    if (current.kind !== 'senior') throw new PublicError('El enlace personal es para personas adultas mayores.');
    if (CLOSED.includes(current.exchangeStatus)) throw new PublicError('Este intercambio ya terminó.');
    await client.query('UPDATE represented_access_links SET revoked_at = now() WHERE represented_user_id = $1 AND revoked_at IS NULL', [representedId]);
    const token = crypto.randomBytes(32).toString('base64url');
    await client.query('INSERT INTO represented_access_links (represented_user_id, token_hash) VALUES ($1, $2)', [representedId, hashToken(token)]);
    return { path: `/papelito/${token}` };
  });
}

/** What the representative may know about the link: never the assignment. */
export async function personalLinkStatus(representedIds: string[]) {
  if (!representedIds.length) return new Map<string, { createdAt: string | null; firstOpenedAt: string | null; openCount: number }>();
  const res = await dbQuery<{ represented_user_id: string; created_at: string; first_opened_at: string | null; open_count: number }>(
    `SELECT represented_user_id, created_at::text, first_opened_at::text, open_count
     FROM represented_access_links WHERE represented_user_id = ANY($1::text[]) AND revoked_at IS NULL`,
    [representedIds],
  );
  return new Map(res.rows.map((r) => [r.represented_user_id, {
    createdAt: toIsoTimestamp(r.created_at),
    firstOpenedAt: toIsoTimestamp(r.first_opened_at),
    openCount: Number(r.open_count),
  }]));
}

type LinkTarget = {
  link_id: string;
  represented_id: string;
  alias: string;
  exchange_id: string;
  exchange_name: string;
  exchange_status: string;
  event_date: string;
  budget_amount: string;
  currency: Currency;
  current_draw_version: number;
  membership_status: string | null;
  draw_notice: string | null;
};

async function findTarget(token: unknown): Promise<LinkTarget | null> {
  if (typeof token !== 'string' || !TOKEN.test(token)) return null;
  const res = await dbQuery<LinkTarget>(
    `SELECT l.id AS link_id, p.user_id AS represented_id, p.alias, e.id AS exchange_id, e.name AS exchange_name,
            e.status AS exchange_status, e.event_date::text, e.budget_amount::text, e.currency, e.current_draw_version,
            m.status AS membership_status,
            (SELECT dv.invalidation_reason FROM draw_versions dv
             WHERE dv.exchange_id = e.id AND dv.version_number = e.current_draw_version) AS draw_notice
     FROM represented_access_links l
     JOIN profiles p ON p.user_id = l.represented_user_id AND p.represented_kind = 'senior'
     JOIN exchanges e ON e.id = p.represented_exchange_id
     LEFT JOIN memberships m ON m.exchange_id = e.id AND m.user_id = p.user_id
     WHERE l.token_hash = $1 AND l.revoked_at IS NULL`,
    [hashToken(token)],
  );
  return res.rows[0] ?? null;
}

export type PersonalLinkPreview =
  | { state: 'invalid' }
  | { state: 'closed'; alias: string; exchangeName: string }
  | { state: 'waiting'; alias: string; exchangeName: string; reason: 'approval' | 'draw'; eventDate: string; budgetAmount: number; currency: Currency }
  | { state: 'ready'; alias: string; exchangeName: string; eventDate: string; budgetAmount: number; currency: Currency };

function describe(target: LinkTarget | null): PersonalLinkPreview {
  if (!target) return { state: 'invalid' };
  const facts = { alias: target.alias, exchangeName: target.exchange_name, eventDate: target.event_date, budgetAmount: Number(target.budget_amount), currency: target.currency };
  if (CLOSED.includes(target.exchange_status)) return { state: 'closed', alias: target.alias, exchangeName: target.exchange_name };
  if (target.membership_status !== 'approved') return { state: 'waiting', reason: 'approval', ...facts };
  if (target.exchange_status !== 'sorteado' || target.current_draw_version === 0) return { state: 'waiting', reason: 'draw', ...facts };
  return { state: 'ready', ...facts };
}

/**
 * Landing page data. It never reveals the assignment and records nothing, so
 * link previews (messaging apps fetch the URL) do not count as an opening.
 */
export async function previewPersonalLink(token: unknown) {
  return describe(await findTarget(token));
}

export type PersonalPapelito = {
  alias: string;
  exchangeName: string;
  eventDate: string;
  receiverAlias: string;
  receiverName: string;
  preferences: GiftPreferences;
  budgetAmount: number;
  currency: Currency;
  wishes: Array<{ id: string; title: string; description: string; url: string; hasPhoto: boolean }>;
  firstOpenedAt: string | null;
  firstTimeNow: boolean;
  drawNotice: string | null;
};

/**
 * Opens the papelito (an explicit action, never a page load). It records the
 * opening and returns who the person gives to and that person's wishes. The
 * first opening time is shown on the page, so an opening by someone else
 * leaves a trace the person can see.
 */
export async function openPersonalLink(token: unknown): Promise<{ preview: PersonalLinkPreview; papelito: PersonalPapelito | null }> {
  const target = await findTarget(token);
  const preview = describe(target);
  if (!target || preview.state !== 'ready') return { preview, papelito: null };
  const before = await getMyAssignment(target.exchange_id, target.represented_id);
  if (!before) return { preview: { ...preview, state: 'waiting', reason: 'draw' }, papelito: null };
  await revealAssignment(target.exchange_id, target.represented_id);
  await dbQuery(
    `UPDATE represented_access_links
     SET first_opened_at = COALESCE(first_opened_at, now()), last_opened_at = now(), open_count = open_count + 1
     WHERE id = $1`,
    [target.link_id],
  );
  const assignment = (await getMyAssignment(target.exchange_id, target.represented_id)) ?? before;
  return {
    preview,
    papelito: {
      alias: target.alias,
      exchangeName: target.exchange_name,
      eventDate: target.event_date,
      receiverAlias: assignment.receiverAlias,
      receiverName: assignment.receiverName,
      preferences: { ...EMPTY_GIFT_PREFERENCES, ...(assignment.receiverPreferences ?? {}) },
      budgetAmount: assignment.budgetAmount,
      currency: assignment.currency,
      wishes: assignment.wishes.map((w) => ({ id: w.id, title: w.title, description: w.description ?? '', url: w.url ?? '', hasPhoto: Boolean(w.hasPhoto) })),
      firstOpenedAt: assignment.revealedAt ?? null,
      firstTimeNow: !before.revealed,
      drawNotice: target.draw_notice,
    },
  };
}

/** Photo of a wish the link holder may see (their current receiver's), or null. */
export async function readPersonalLinkPhoto(token: unknown, wishId: unknown) {
  if (typeof wishId !== 'string' || !/^[0-9a-f-]{36}$/i.test(wishId)) return null;
  const target = await findTarget(token);
  if (!target || describe(target).state !== 'ready') return null;
  return readWishPhoto(target.represented_id, wishId);
}

/** Representative's view: whether the person already opened the current papelito. */
export async function hasOpenedCurrentPapelito(exchangeId: string, representedId: string) {
  const res = await dbQuery<{ opened: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM exchanges e
       JOIN draw_versions dv ON dv.exchange_id = e.id AND dv.version_number = e.current_draw_version
       JOIN assignments a ON a.draw_version_id = dv.id AND a.giver_id = $2
       WHERE e.id = $1 AND a.revealed_at IS NOT NULL) AS opened`,
    [exchangeId, representedId],
  );
  return Boolean(res.rows[0]?.opened);
}
