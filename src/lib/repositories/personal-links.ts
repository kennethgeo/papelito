import 'server-only';
import crypto from 'node:crypto';
import { dbQuery, dbTransaction, type DbClient } from '@/lib/db/client';
import { PublicError } from '@/lib/data/errors';
import { toIsoTimestamp } from '@/lib/date/timestamps';
import { EMPTY_GIFT_PREFERENCES, type GiftPreferences } from '@/lib/gift-preferences';
import { getMyAssignment } from './assignments';
import type { Currency } from '@/types';

/**
 * Who opens a represented person's papelito, chosen by their representative:
 * - 'managed': the representative manages it and sees the assignment (for
 *   example, a child).
 * - 'personal': the person opens it with a personal link, without an account
 *   (for example, an older adult). The assignment is never sent to the
 *   representative's account.
 * Rows created before this choice existed (NULL) behave as 'managed'.
 *
 * What 'personal' does NOT guarantee: the representative receives the link in
 * order to deliver it, so they could open it. Papelito cannot prevent that
 * without a channel of its own to the person; it makes it visible instead (the
 * papelito shows when it was first opened, also across replaced links). Texts
 * shown to people must not promise more than this.
 */
export type RepresentedAccess = 'managed' | 'personal';

export function parseRepresentedAccess(value: unknown): RepresentedAccess {
  if (value === 'managed' || value === 'personal') return value;
  throw new PublicError('Elegí si vos gestionás su papelito o si lo abre personalmente.');
}
export const accessOf = (value: string | null | undefined): RepresentedAccess => (value === 'personal' ? 'personal' : 'managed');

/**
 * The link's secret is 256 random bits in hexadecimal: only letters and
 * digits, so messaging apps never cut it. It travels in the URL fragment
 * (`/papelito#<secret>`), which browsers do not send to servers: it cannot
 * reach request logs, Referer headers or link previews. The page sends it in
 * the body of a POST.
 */
const TOKEN = /^[0-9a-f]{64}$/;
export const isPersonalLinkToken = (token: unknown): token is string => typeof token === 'string' && TOKEN.test(token);
const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');
const CLOSED = ['finalizado', 'cancelado'];

async function ownedRepresented(client: DbClient, exchangeId: string, guardianId: string, representedId: string) {
  const res = await client.query<{ access: string | null; exchange_status: string }>(
    `SELECT p.represented_access AS access, e.status AS exchange_status
     FROM profiles p
     JOIN exchanges e ON e.id = p.represented_exchange_id
     JOIN memberships g ON g.exchange_id = e.id AND g.user_id = $2 AND g.status = 'approved'
     WHERE p.user_id = $3 AND p.guardian_user_id = $2 AND p.represented_exchange_id = $1`,
    [exchangeId, guardianId, representedId],
  );
  if (!res.rows[0]) throw new PublicError('Esta persona no está a tu cargo en el intercambio.');
  return { access: accessOf(res.rows[0].access), exchangeStatus: res.rows[0].exchange_status };
}

/** Throws when this person's assignment must not be sent to the representative's account. */
export async function assertRepresentativeMaySeeAssignment(exchangeId: string, guardianId: string, representedId: string) {
  const current = await ownedRepresented({ query: dbQuery }, exchangeId, guardianId, representedId);
  if (current.access === 'personal') throw new PublicError('Su papelito se abre con su enlace personal.');
}

/**
 * Changes who opens the papelito. Becoming 'personal' is always allowed (it
 * only removes the assignment from the representative's account). Going back
 * to 'managed' is allowed only before the draw, so nobody can switch, look in
 * their account and switch back.
 */
export async function setRepresentedAccess(exchangeId: string, guardianId: string, representedId: string, value: unknown) {
  const access = parseRepresentedAccess(value);
  return dbTransaction(async (client) => {
    await client.query('SELECT id FROM exchanges WHERE id = $1 FOR UPDATE', [exchangeId]);
    const current = await ownedRepresented(client, exchangeId, guardianId, representedId);
    if (CLOSED.includes(current.exchangeStatus)) throw new PublicError('Este intercambio ya terminó.');
    if (current.access === access) return { access };
    if (access === 'managed' && current.exchangeStatus !== 'inscripcion_abierta') {
      throw new PublicError('Después del sorteo, quien abre su papelito personalmente lo sigue abriendo así.');
    }
    await client.query('UPDATE profiles SET represented_access = $2, updated_at = now() WHERE user_id = $1', [representedId, access]);
    if (access === 'managed') {
      await client.query('UPDATE represented_access_links SET revoked_at = now() WHERE represented_user_id = $1 AND revoked_at IS NULL', [representedId]);
    }
    return { access };
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
    if (current.access !== 'personal') throw new PublicError('El enlace personal es para quien abre su papelito personalmente.');
    if (CLOSED.includes(current.exchangeStatus)) throw new PublicError('Este intercambio ya terminó.');
    await client.query('UPDATE represented_access_links SET revoked_at = now() WHERE represented_user_id = $1 AND revoked_at IS NULL', [representedId]);
    const token = crypto.randomBytes(32).toString('hex');
    await client.query('INSERT INTO represented_access_links (represented_user_id, token_hash) VALUES ($1, $2)', [representedId, hashToken(token)]);
    return { path: `/papelito#${token}` };
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

/** Looks the link up by its hash. With `lock`, the link row stays locked until the transaction ends. */
async function findTarget(client: DbClient, tokenHash: string, lock = false): Promise<LinkTarget | null> {
  const res = await client.query<LinkTarget>(
    `SELECT l.id AS link_id, p.user_id AS represented_id, p.alias, e.id AS exchange_id, e.name AS exchange_name,
            e.status AS exchange_status, e.event_date::text, e.budget_amount::text, e.currency, e.current_draw_version,
            m.status AS membership_status,
            (SELECT dv.invalidation_reason FROM draw_versions dv
             WHERE dv.exchange_id = e.id AND dv.version_number = e.current_draw_version) AS draw_notice
     FROM represented_access_links l
     JOIN profiles p ON p.user_id = l.represented_user_id AND p.represented_access = 'personal'
     JOIN exchanges e ON e.id = p.represented_exchange_id
     LEFT JOIN memberships m ON m.exchange_id = e.id AND m.user_id = p.user_id
     WHERE l.token_hash = $1 AND l.revoked_at IS NULL${lock ? ' FOR UPDATE OF l' : ''}`,
    [tokenHash],
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
 * What the page shows before opening. It never reveals the assignment and
 * records nothing.
 */
export async function previewPersonalLink(token: unknown): Promise<PersonalLinkPreview> {
  if (!isPersonalLinkToken(token)) return { state: 'invalid' };
  return describe(await findTarget({ query: dbQuery }, hashToken(token)));
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
 * Opens the papelito (an explicit action, never a page load): records the
 * opening and returns who the person gives to and that person's wishes.
 *
 * Everything happens in one transaction. Replacing the link, drawing again,
 * changing a membership and closing the exchange all lock the exchange row, so
 * an opening sees each of them entirely before or entirely after: it never
 * returns an assignment through a link that was already replaced, and never
 * mixes two draws. Openings of the same link wait for each other on the link
 * row, so exactly one of them is the first.
 */
export async function openPersonalLink(token: unknown): Promise<{ preview: PersonalLinkPreview; papelito: PersonalPapelito | null }> {
  if (!isPersonalLinkToken(token)) return { preview: { state: 'invalid' }, papelito: null };
  const tokenHash = hashToken(token);
  // Found without locks first, so locks are always taken exchange first, then
  // link (the same order as replacing the link), which rules out deadlocks.
  const located = await findTarget({ query: dbQuery }, tokenHash);
  if (!located) return { preview: { state: 'invalid' }, papelito: null };
  return dbTransaction(async (client) => {
    await client.query('SELECT id FROM exchanges WHERE id = $1 FOR SHARE', [located.exchange_id]);
    // Read again under the locks: the link may have been replaced meanwhile.
    const target = await findTarget(client, tokenHash, true);
    const preview = describe(target);
    if (!target || preview.state !== 'ready') return { preview, papelito: null };
    const assignment = await getMyAssignment(target.exchange_id, target.represented_id, client);
    if (!assignment?.id) return { preview: { ...preview, state: 'waiting' as const, reason: 'draw' as const }, papelito: null };
    let firstOpenedAt = assignment.revealedAt ?? null;
    if (!assignment.revealed) {
      const marked = await client.query<{ revealed_at: string }>(
        'UPDATE assignments SET revealed_at = now() WHERE id = $1 AND revealed_at IS NULL RETURNING revealed_at::text',
        [assignment.id],
      );
      firstOpenedAt = toIsoTimestamp(marked.rows[0]?.revealed_at) ?? firstOpenedAt;
    }
    await client.query(
      `UPDATE represented_access_links
       SET first_opened_at = COALESCE(first_opened_at, now()), last_opened_at = now(), open_count = open_count + 1
       WHERE id = $1`,
      [target.link_id],
    );
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
        firstOpenedAt,
        firstTimeNow: !assignment.revealed,
        drawNotice: target.draw_notice,
      },
    };
  });
}

/**
 * Photo of a wish for the holder of a working link, or null. Its own rule (it
 * does not reuse the account rule, which also allows a person's own wishes):
 * the wish must be selected for this exchange by the person the link holder
 * gives to in the current draw, both memberships approved, the exchange drawn,
 * and the papelito already opened.
 */
export async function readPersonalLinkPhoto(token: unknown, wishId: unknown): Promise<Uint8Array | null> {
  if (!isPersonalLinkToken(token) || typeof wishId !== 'string' || !/^[0-9a-f-]{36}$/i.test(wishId)) return null;
  const res = await dbQuery<{ image: Uint8Array }>(
    `SELECT f.image
     FROM represented_access_links l
     JOIN profiles p ON p.user_id = l.represented_user_id AND p.represented_access = 'personal'
     JOIN exchanges e ON e.id = p.represented_exchange_id AND e.status = 'sorteado' AND e.current_draw_version > 0
     JOIN draw_versions dv ON dv.exchange_id = e.id AND dv.version_number = e.current_draw_version
     JOIN assignments a ON a.draw_version_id = dv.id AND a.giver_id = p.user_id AND a.revealed_at IS NOT NULL
     JOIN memberships mg ON mg.exchange_id = e.id AND mg.user_id = a.giver_id AND mg.status = 'approved'
     JOIN memberships mr ON mr.exchange_id = e.id AND mr.user_id = a.receiver_id AND mr.status = 'approved'
     JOIN wish_selections ws ON ws.exchange_id = e.id AND ws.user_id = a.receiver_id AND ws.wish_id = $2
     JOIN wishes w ON w.id = ws.wish_id AND w.user_id = a.receiver_id
     JOIN wish_photos f ON f.wish_id = w.id
     WHERE l.token_hash = $1 AND l.revoked_at IS NULL`,
    [hashToken(token), wishId],
  );
  return res.rows[0]?.image ?? null;
}

/** Representative's view: whether the current papelito was already opened. */
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
