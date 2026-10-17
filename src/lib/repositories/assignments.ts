import 'server-only';
import { dbQuery, dbTransaction } from '@/lib/db/client';
import type { Assignment, Wish, Currency } from '@/types';

export async function getMyAssignment(
  exchangeId: string,
  userId: string
): Promise<Assignment | null> {
  // 1. Fetch current exchange status and draw version
  const exRes = await dbQuery<{
    status: string;
    current_draw_version: number;
    budget_amount: string;
    currency: Currency;
  }>(
    `SELECT status, current_draw_version, budget_amount::text, currency
     FROM exchanges
     WHERE id = $1`,
    [exchangeId]
  );

  if (exRes.rowCount === 0) {
    return null;
  }

  const ex = exRes.rows[0];
  if (ex.status !== 'sorteado' || ex.current_draw_version === 0) {
    return null;
  }

  // 2. Fetch current draw version ID
  const verRes = await dbQuery<{ id: string }>(
    `SELECT id FROM draw_versions
     WHERE exchange_id = $1 AND version_number = $2`,
    [exchangeId, ex.current_draw_version]
  );

  if (verRes.rowCount === 0) {
    return null;
  }

  const versionId = verRes.rows[0].id;

  // 3. Find user's assignment as giver (must be an approved member in the exchange)
  const assignRes = await dbQuery<{
    id: string;
    receiver_id: string;
    revealed_at: string | null;
  }>(
    `SELECT a.id, a.receiver_id, a.revealed_at::text
     FROM assignments a
     JOIN memberships m ON m.exchange_id = a.exchange_id AND m.user_id = a.giver_id
     WHERE a.draw_version_id = $1
       AND a.giver_id = $2
       AND m.status = 'approved'`,
    [versionId, userId]
  );

  if (assignRes.rowCount === 0) {
    return null;
  }

  const assignment = assignRes.rows[0];

  // 4. Fetch receiver profile
  const recRes = await dbQuery<{
    alias: string;
    full_name: string;
    avatar_color: string;
  }>(
    `SELECT alias, full_name, avatar_color
     FROM profiles
     WHERE user_id = $1`,
    [assignment.receiver_id]
  );

  const receiver = recRes.rows[0] || {
    alias: 'Amigo secreto',
    full_name: 'Amigo secreto',
    avatar_color: '#46245D',
  };

  // 5. Fetch receiver's selected wishes for this exchange with buyer purchase marks
  const wishesRes = await dbQuery<{
    id: string;
    title: string;
    description: string;
    url: string | null;
    approximate_price: string | null;
    currency: Currency;
    priority: 'alta' | 'media' | 'baja';
    created_at: string;
    is_purchased_by_giver: boolean;
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
    exchangeId,
    title: w.title,
    description: w.description || '',
    url: w.url || '',
    approximatePrice: w.approximate_price ? Number(w.approximate_price) : undefined,
    currency: w.currency,
    priority: w.priority,
    isPurchasedByGiver: w.is_purchased_by_giver,
    isPurchased: w.is_purchased_by_giver,
    createdAt: w.created_at,
  }));

  return {
    id: assignment.id,
    exchangeId,
    giverId: userId,
    receiverId: assignment.receiver_id,
    receiverName: receiver.full_name,
    receiverAlias: receiver.alias,
    receiverAvatarColor: receiver.avatar_color,
    budgetAmount: Number(ex.budget_amount),
    currency: ex.currency,
    revealed: Boolean(assignment.revealed_at),
    revealedAt: assignment.revealed_at || undefined,
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
    throw new Error('No hay un sorteo activo en este intercambio.');
  }

  const verRes = await dbQuery<{ id: string }>(
    `SELECT id FROM draw_versions WHERE exchange_id = $1 AND version_number = $2`,
    [exchangeId, exRes.rows[0].current_draw_version]
  );
  if (verRes.rowCount === 0) {
    throw new Error('Versión de sorteo no encontrada.');
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
    throw new Error('No tienes una asignación activa en este intercambio.');
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
      throw new Error('Intercambio no encontrado.');
    }
    if (exRes.rows[0].status !== 'sorteado' || exRes.rows[0].current_draw_version === 0) {
      throw new Error('No hay un sorteo activo para este intercambio.');
    }

    const verRes = await client.query<{ id: string }>(
      `SELECT id FROM draw_versions WHERE exchange_id = $1 AND version_number = $2`,
      [exchangeId, exRes.rows[0].current_draw_version]
    );
    if (verRes.rowCount === 0) {
      throw new Error('No hay un sorteo activo para este intercambio.');
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
      throw new Error('No tienes asignación autorizada como regalador en este intercambio.');
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
      throw new Error('El deseo no pertenece a la persona asignada o no fue seleccionado en este intercambio.');
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
