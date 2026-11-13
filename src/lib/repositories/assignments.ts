import 'server-only';
import { PublicError } from '@/lib/data/errors';
import { EMPTY_GIFT_PREFERENCES } from '@/lib/gift-preferences';
import { dbQuery, dbTransaction, type DbClient } from '@/lib/db/client';
import { toIsoTimestamp } from '@/lib/date/timestamps';
import type { Assignment, Wish, Currency } from '@/types';

export async function getMyAssignment(
  exchangeId: string,
  userId: string,
  // Pass a transaction client to read inside that transaction.
  client: DbClient = { query: dbQuery }
): Promise<Assignment | null> {
  // One round trip resolves the same conditions as before: drawn exchange,
  // current draw version, the caller as giver and an approved membership.
  const assignRes = await client.query<{
    id: string;
    receiver_id: string;
    revealed_at: string | null;
    budget_amount: string;
    currency: Currency;
    alias: string | null;
    full_name: string | null;
    avatar_color: string | null;
    gift_preferences: Record<string, string> | null;
  }>(
    `SELECT a.id, a.receiver_id, a.revealed_at::text, e.budget_amount::text, e.currency,
            p.alias, p.full_name, p.avatar_color, p.gift_preferences
     FROM exchanges e
     JOIN draw_versions dv ON dv.exchange_id = e.id AND dv.version_number = e.current_draw_version
     JOIN assignments a ON a.draw_version_id = dv.id AND a.giver_id = $2
     JOIN memberships m ON m.exchange_id = a.exchange_id AND m.user_id = a.giver_id AND m.status = 'approved'
     LEFT JOIN profiles p ON p.user_id = a.receiver_id
     WHERE e.id = $1 AND e.status = 'sorteado' AND e.current_draw_version > 0`,
    [exchangeId, userId]
  );

  if (assignRes.rowCount === 0) {
    return null;
  }

  const assignment = assignRes.rows[0];
  const ex = { budget_amount: assignment.budget_amount, currency: assignment.currency };
  const receiver = {
    alias: assignment.alias ?? 'Amigo secreto',
    full_name: assignment.full_name ?? 'Amigo secreto',
    avatar_color: assignment.avatar_color ?? '#46245D',
  };

  // 5. Fetch receiver's selected wishes for this exchange with buyer purchase marks
  const wishesRes = await client.query<{
    id: string;
    title: string;
    description: string;
    url: string | null;
    approximate_price: string | null;
    currency: Currency;
    priority: 'alta' | 'media' | 'baja';
    created_at: string;
    is_purchased_by_giver: boolean;
    has_photo: boolean;
  }>(
    `SELECT
       w.id,
       w.title,
       w.description,
       w.url,
       w.approximate_price::text,
       w.currency,
       w.priority,
       w.created_at::text,
       EXISTS(SELECT 1 FROM wish_photos f WHERE f.wish_id = w.id) AS has_photo,
       EXISTS(
         SELECT 1 FROM gift_purchases gp
         WHERE gp.exchange_id = $1 AND gp.wish_id = w.id AND gp.buyer_id = $2
       ) as is_purchased_by_giver
     FROM wish_selections ws
     JOIN wishes w ON w.id = ws.wish_id
     WHERE ws.exchange_id = $1 AND ws.user_id = $3
     ORDER BY w.created_at DESC`,
    [exchangeId, userId, assignment.receiver_id]
  );

  const wishes: Wish[] = wishesRes.rows.map((w) => ({
    id: w.id,
    hasPhoto: w.has_photo,
    exchangeId,
    title: w.title,
    description: w.description || '',
    url: w.url || '',
    approximatePrice: w.approximate_price ? Number(w.approximate_price) : undefined,
    currency: w.currency,
    priority: w.priority,
    isPurchasedByGiver: w.is_purchased_by_giver,
    isPurchased: w.is_purchased_by_giver,
    createdAt: toIsoTimestamp(w.created_at) ?? '',
  }));

  return {
    id: assignment.id,
    exchangeId,
    giverId: userId,
    receiverId: assignment.receiver_id,
    receiverName: receiver.full_name,
    receiverAlias: receiver.alias,
    receiverPreferences: { ...EMPTY_GIFT_PREFERENCES, ...(assignment.gift_preferences ?? {}) },
    receiverAvatarColor: receiver.avatar_color,
    budgetAmount: Number(ex.budget_amount),
    currency: ex.currency,
    revealed: Boolean(assignment.revealed_at),
    revealedAt: toIsoTimestamp(assignment.revealed_at) ?? undefined,
    wishes,
  };
}

export async function revealAssignment(exchangeId: string, userId: string): Promise<boolean> {
  // 1. Verify exchange has an active draw
  const exRes = await dbQuery<{ status: string; current_draw_version: number }>(
    `SELECT status, current_draw_version FROM exchanges WHERE id = $1`,
    [exchangeId]
  );
  if (exRes.rowCount === 0 || exRes.rows[0].status !== 'sorteado' || exRes.rows[0].current_draw_version === 0) {
    throw new PublicError('No hay un sorteo activo en este intercambio.');
  }

  const verRes = await dbQuery<{ id: string }>(
    `SELECT id FROM draw_versions WHERE exchange_id = $1 AND version_number = $2`,
    [exchangeId, exRes.rows[0].current_draw_version]
  );
  if (verRes.rowCount === 0) {
    throw new PublicError('Versión de sorteo no encontrada.');
  }

  // 2. Verify caller is an approved member and has an assignment in this draw version
  const existing = await dbQuery<{ id: string; revealed_at: string | null }>(
    `SELECT a.id, a.revealed_at::text
     FROM assignments a
     JOIN memberships m ON m.exchange_id = a.exchange_id AND m.user_id = a.giver_id
     WHERE a.draw_version_id = $1
       AND a.giver_id = $2
       AND m.status = 'approved'`,
    [verRes.rows[0].id, userId]
  );

  if (existing.rowCount === 0) {
    throw new PublicError('No tenés una asignación activa en este intercambio.');
  }

  const row = existing.rows[0];
  if (!row.revealed_at) {
    await dbQuery(
      `UPDATE assignments SET revealed_at = now() WHERE id = $1`,
      [row.id]
    );
  }

  return true;
}

export async function toggleWishPurchase(
  exchangeId: string,
  buyerId: string,
  wishId: string,
  purchased: boolean
): Promise<boolean> {
  return await dbTransaction(async (client) => {
    // 1. Lock exchange row to prevent race condition with redraw
    const exRes = await client.query<{ status: string; current_draw_version: number }>(
      `SELECT status, current_draw_version FROM exchanges WHERE id = $1 FOR UPDATE`,
      [exchangeId]
    );
    if (exRes.rowCount === 0) {
      throw new PublicError('Intercambio no encontrado.');
    }
    if (exRes.rows[0].status !== 'sorteado' || exRes.rows[0].current_draw_version === 0) {
      throw new PublicError('No hay un sorteo activo para este intercambio.');
    }

    const verRes = await client.query<{ id: string }>(
      `SELECT id FROM draw_versions WHERE exchange_id = $1 AND version_number = $2`,
      [exchangeId, exRes.rows[0].current_draw_version]
    );
    if (verRes.rowCount === 0) {
      throw new PublicError('No hay un sorteo activo para este intercambio.');
    }

    // 2. Verify buyer is an approved member and has assignment as giver
    const assignRes = await client.query<{ receiver_id: string }>(
      `SELECT a.receiver_id
       FROM assignments a
       JOIN memberships m ON m.exchange_id = a.exchange_id AND m.user_id = a.giver_id
       WHERE a.draw_version_id = $1 AND a.giver_id = $2 AND m.status = 'approved'`,
      [verRes.rows[0].id, buyerId]
    );
    if (assignRes.rowCount === 0) {
      throw new PublicError('No tenés una asignación vigente para regalar en este intercambio.');
    }

    const receiverId = assignRes.rows[0].receiver_id;

    // 3. Verify wish belongs to the receiver AND is currently selected in this exchange
    const selRes = await client.query(
      `SELECT ws.id
       FROM wish_selections ws
       JOIN wishes w ON w.id = ws.wish_id
       WHERE ws.exchange_id = $1 AND ws.wish_id = $2 AND ws.user_id = $3 AND w.user_id = $3`,
      [exchangeId, wishId, receiverId]
    );
    if (selRes.rowCount === 0) {
      throw new PublicError('El deseo no pertenece a la persona asignada o no fue seleccionado en este intercambio.');
    }

    // 4. Insert or remove purchase mark atomically
    if (purchased) {
      await client.query(
        `INSERT INTO gift_purchases (exchange_id, wish_id, buyer_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (exchange_id, wish_id, buyer_id) DO NOTHING`,
        [exchangeId, wishId, buyerId]
      );
    } else {
      await client.query(
        `DELETE FROM gift_purchases
         WHERE exchange_id = $1 AND wish_id = $2 AND buyer_id = $3`,
        [exchangeId, wishId, buyerId]
      );
    }

    return true;
  });
}
