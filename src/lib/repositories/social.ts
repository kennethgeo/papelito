import 'server-only';
import { dbQuery, dbTransaction } from '@/lib/db/client';
import { parseGiftPreferences } from '@/lib/gift-preferences';

export async function getGiftPreferences(userId: string) {
  const res = await dbQuery<{ gift_preferences: Record<string, string> }>('SELECT gift_preferences FROM profiles WHERE user_id = $1', [userId]);
  return res.rows[0]?.gift_preferences ?? {};
}
export async function saveGiftPreferences(userId: string, value: unknown) {
  const preferences = parseGiftPreferences(value);
  await dbQuery('UPDATE profiles SET gift_preferences = $2::jsonb, updated_at = now() WHERE user_id = $1', [userId, JSON.stringify(preferences)]);
  return preferences;
}

// This query deliberately never returns the giver identity in the receiver's inbox.
const THREADS_SQL = `SELECT a.id, (a.giver_id = $2) AS am_giver
  FROM assignments a JOIN exchanges e ON e.id = a.exchange_id
  JOIN draw_versions dv ON dv.id = a.draw_version_id
  JOIN memberships me ON me.exchange_id = e.id AND me.user_id = $2 AND me.status = 'approved'
  JOIN memberships mg ON mg.exchange_id = e.id AND mg.user_id = a.giver_id AND mg.status = 'approved'
  JOIN memberships mr ON mr.exchange_id = e.id AND mr.user_id = a.receiver_id AND mr.status = 'approved'
  WHERE e.id = $1 AND e.status = 'sorteado' AND dv.version_number = e.current_draw_version
    AND (a.giver_id = $2 OR a.receiver_id = $2)`;

export interface AnonymousThread {
  id: string;
  direction: 'giving' | 'receiving';
  messages: Array<{ id: string; body: string; mine: boolean; createdAt: string }>;
}
export async function getAnonymousThreads(exchangeId: string, userId: string): Promise<AnonymousThread[]> {
  const threads = await dbQuery<{ id: string; am_giver: boolean }>(THREADS_SQL, [exchangeId, userId]);
  const result: AnonymousThread[] = [];
  for (const thread of threads.rows) {
    const messages = await dbQuery<{ id: string; body: string; from_giver: boolean; created_at: string }>(
      'SELECT id, body, from_giver, created_at::text FROM anonymous_messages WHERE assignment_id = $1 ORDER BY created_at, id LIMIT 200', [thread.id]);
    result.push({ id: thread.id, direction: thread.am_giver ? 'giving' : 'receiving', messages: messages.rows.map(m => ({
      id: m.id, body: m.body, mine: m.from_giver === thread.am_giver, createdAt: m.created_at,
    })) });
  }
  return result;
}
export async function sendAnonymousMessage(exchangeId: string, threadId: string, userId: string, raw: unknown) {
  if (typeof raw !== 'string' || !raw.trim() || raw.trim().length > 1000) throw new Error('Escribí un mensaje de 1 a 1000 caracteres.');
  return dbTransaction(async client => {
    // Serialize with draw/close operations so an old thread cannot receive a late message.
    await client.query('SELECT id FROM exchanges WHERE id = $1 FOR UPDATE', [exchangeId]);
    const threads = await client.query<{ id: string; am_giver: boolean }>(THREADS_SQL, [exchangeId, userId]);
    const thread = threads.rows.find(t => t.id === threadId);
    if (!thread) throw new Error('Esta conversación no está disponible. Actualizá el intercambio.');
    const limits = await client.query<{ total: string; recent: string }>(`SELECT count(*)::text AS total,
      count(*) FILTER (WHERE from_giver = $2 AND created_at > now() - interval '10 seconds')::text AS recent
      FROM anonymous_messages WHERE assignment_id = $1`, [thread.id, thread.am_giver]);
    if (Number(limits.rows[0].total) >= 200) throw new Error('Esta conversación alcanzó su límite de 200 mensajes.');
    if (Number(limits.rows[0].recent) > 0) throw new Error('Esperá unos segundos antes de enviar otro mensaje.');
    const inserted = await client.query<{ id: string }>('INSERT INTO anonymous_messages (assignment_id, from_giver, body) VALUES ($1, $2, $3) RETURNING id', [thread.id, thread.am_giver, raw.trim()]);
    const recipient = await client.query<{ user_id: string }>(`SELECT CASE WHEN $2 THEN receiver_id ELSE giver_id END AS user_id FROM assignments WHERE id = $1`, [thread.id, thread.am_giver]);
    // Recipient is server-only; the action only returns a success flag.
    return { messageId: inserted.rows[0].id, recipientId: recipient.rows[0].user_id };
  });
}
