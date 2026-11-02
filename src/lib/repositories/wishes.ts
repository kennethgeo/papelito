import 'server-only';
import { PublicError } from '@/lib/data/errors';
import { dbQuery, dbTransaction } from '@/lib/db/client';
import { toIsoTimestamp } from '@/lib/date/timestamps';

export interface WishRow {
  has_photo: boolean;
  id: string;
  user_id: string;
  title: string;
  description: string;
  url: string | null;
  approximate_price: string | null;
  currency: 'CRC' | 'USD';
  priority: 'alta' | 'media' | 'baja';
  created_at: string;
  updated_at: string;
}

export interface SaveWishInput {
  id?: string;
  title: string;
  description?: string;
  url?: string;
  approximatePrice?: number;
  currency?: 'CRC' | 'USD';
  priority?: 'alta' | 'media' | 'baja';
  /** Client-generated id of this creation attempt; retries return the same wish. */
  clientRequestId?: string;
}

/**
 * Wishes per person (each represented person counts separately). Far above
 * normal use; it bounds storage on the free plan. Existing lists above the
 * limit stay intact; only new wishes are refused.
 */
export const MAX_WISHES_PER_PERSON = 100;

export async function getMyWishes(userId: string) {
  // 1. Fetch all user wishes
  const wishesRes = await dbQuery<WishRow>(
    `SELECT id, user_id, title, description, url, approximate_price::text, currency, priority, created_at::text, updated_at::text, EXISTS(SELECT 1 FROM wish_photos f WHERE f.wish_id = wishes.id) AS has_photo
     FROM wishes
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [userId]
  );

  // 2. Fetch all selections for these wishes
  const selectionsRes = await dbQuery<{ wish_id: string; exchange_id: string }>(
    `SELECT wish_id, exchange_id
     FROM wish_selections
     WHERE user_id = $1`,
    [userId]
  );

  const selectionsMap = new Map<string, string[]>();
  for (const s of selectionsRes.rows) {
    const list = selectionsMap.get(s.wish_id) || [];
    list.push(s.exchange_id);
    selectionsMap.set(s.wish_id, list);
  }

  return wishesRes.rows.map((w) => ({
    id: w.id,
    hasPhoto: w.has_photo,
    title: w.title,
    description: w.description || '',
    url: w.url || '',
    approximatePrice: w.approximate_price ? Number(w.approximate_price) : undefined,
    currency: w.currency,
    priority: w.priority,
    selectedInExchanges: selectionsMap.get(w.id) || [],
    createdAt: toIsoTimestamp(w.created_at) ?? '',
  }));
}

export async function saveWish(userId: string, input: SaveWishInput): Promise<{ wishId: string }> {
  if (!input.title || input.title.trim().length === 0) {
    throw new PublicError('El título del deseo es obligatorio.');
  }

  const currency = input.currency || 'CRC';
  const priority = input.priority || 'media';
  const price = input.approximatePrice !== undefined && input.approximatePrice !== null ? input.approximatePrice : null;

  if (input.id) {
    // Update existing wish with ownership check
    const res = await dbQuery<{ id: string }>(
      `UPDATE wishes
       SET title = $1, description = $2, url = $3, approximate_price = $4, currency = $5, priority = $6, updated_at = now()
       WHERE id = $7 AND user_id = $8
       RETURNING id`,
      [
        input.title.trim(),
        input.description?.trim() || '',
        input.url?.trim() || null,
        price,
        currency,
        priority,
        input.id,
        userId,
      ]
    );

    if (res.rowCount === 0) {
      throw new PublicError('Deseo no encontrado o sin autorización para editarlo.');
    }
    return { wishId: res.rows[0].id };
  }
  return await dbTransaction(async (client) => {
    await client.query('SELECT user_id FROM profiles WHERE user_id = $1 FOR UPDATE', [userId]);
    if (input.clientRequestId) {
      const existing = await client.query<{ id: string }>('SELECT id FROM wishes WHERE user_id = $1 AND client_request_id = $2', [userId, input.clientRequestId]);
      if (existing.rows[0]) return { wishId: existing.rows[0].id };
    }
    const count = await client.query<{ n: number }>('SELECT count(*)::int AS n FROM wishes WHERE user_id = $1', [userId]);
    if (count.rows[0].n >= MAX_WISHES_PER_PERSON) {
      throw new PublicError(`Ya tenés ${MAX_WISHES_PER_PERSON} ideas guardadas. Borrá alguna antes de agregar otra.`);
    }
    const res = await client.query<{ id: string }>(
      `INSERT INTO wishes (user_id, title, description, url, approximate_price, currency, priority, client_request_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        userId,
        input.title.trim(),
        input.description?.trim() || '',
        input.url?.trim() || null,
        price,
        currency,
        priority,
        input.clientRequestId ?? null,
      ]
    );
    return { wishId: res.rows[0].id };
  });
}

export async function deleteWish(userId: string, wishId: string): Promise<boolean> {
  const res = await dbQuery(
    `DELETE FROM wishes WHERE id = $1 AND user_id = $2`,
    [wishId, userId]
  );
  if (res.rowCount === 0) {
    throw new PublicError('Deseo no encontrado o no tienes permiso para eliminarlo.');
  }
  return true;
}

export async function toggleWishInExchange(
  userId: string,
  exchangeId: string,
  wishId: string,
  selected: boolean
): Promise<boolean> {
  // 1. Verify wish belongs to user
  const wishRes = await dbQuery(
    `SELECT id FROM wishes WHERE id = $1 AND user_id = $2`,
    [wishId, userId]
  );
  if (wishRes.rowCount === 0) {
    throw new PublicError('Deseo no encontrado o no pertenece a tu cuenta.');
  }

  // 2. Verify user is approved member of exchange
  const memRes = await dbQuery(
    `SELECT id FROM memberships WHERE exchange_id = $1 AND user_id = $2 AND status = 'approved'`,
    [exchangeId, userId]
  );
  if (memRes.rowCount === 0) {
    throw new PublicError('Debes ser participante aprobado del evento para compartir deseos.');
  }

  if (selected) {
    await dbQuery(
      `INSERT INTO wish_selections (exchange_id, wish_id, user_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (exchange_id, wish_id) DO NOTHING`,
      [exchangeId, wishId, userId]
    );
  } else {
    await dbQuery(
      `DELETE FROM wish_selections
       WHERE exchange_id = $1 AND wish_id = $2 AND user_id = $3`,
      [exchangeId, wishId, userId]
    );
  }

  return true;
}
