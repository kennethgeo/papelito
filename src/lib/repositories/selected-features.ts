import 'server-only';
import crypto from 'node:crypto';
import { dbQuery, dbTransaction, type DbClient } from '@/lib/db/client';
import { PublicError } from '@/lib/data/errors';
import { getMyAssignment, revealAssignment } from './assignments';
import { saveWish, toggleWishInExchange, getMyWishes, deleteWish } from './wishes';
export async function approvedMember(exchangeId: string, userId: string, client: DbClient = { query: dbQuery }) {
  const result = await client.query<{ organizer_id: string; status: string; requires_approval: boolean }>(`SELECT e.organizer_id, e.status, e.requires_approval FROM exchanges e JOIN memberships m ON m.exchange_id = e.id WHERE e.id = $1 AND m.user_id = $2 AND m.status = 'approved'`, [exchangeId, userId]);
  if (!result.rows[0]) throw new PublicError('Este intercambio no está disponible para tu cuenta.');
  return result.rows[0];
}
export async function getBudgetPoll(exchangeId: string, userId: string) {
  await approvedMember(exchangeId, userId);
  const poll = await dbQuery<{ options: number[]; closed_at: string | null; chosen_amount: string | null }>('SELECT options, closed_at::text, chosen_amount::text FROM budget_polls WHERE exchange_id = $1', [exchangeId]);
  if (!poll.rows[0]) return null;
  const votes = await dbQuery<{ amount: string; count: string }>(`SELECT v.amount::text, count(*)::text FROM budget_votes v JOIN memberships m ON m.exchange_id = v.exchange_id AND m.user_id = v.user_id AND m.status = 'approved' WHERE v.exchange_id = $1 GROUP BY v.amount`, [exchangeId]);
  const mine = await dbQuery<{ amount: string }>('SELECT amount::text FROM budget_votes WHERE exchange_id = $1 AND user_id = $2', [exchangeId, userId]);
  return { options: poll.rows[0].options, closed: !!poll.rows[0].closed_at, chosen: poll.rows[0].chosen_amount ? Number(poll.rows[0].chosen_amount) : null,
    myVote: mine.rows[0] ? Number(mine.rows[0].amount) : null, counts: votes.rows.map(v => ({ amount: Number(v.amount), count: Number(v.count) })) };
}
export async function mutateBudgetPoll(exchangeId: string, userId: string, operation: 'create' | 'vote' | 'close', value: unknown) {
  if (!['create', 'vote', 'close'].includes(operation)) throw new PublicError('Operación de encuesta inválida.');
  return dbTransaction(async client => {
    await client.query('SELECT id FROM exchanges WHERE id = $1 FOR UPDATE', [exchangeId]);
    const ex = await approvedMember(exchangeId, userId, client);
    if (ex.status !== 'inscripcion_abierta') throw new PublicError('El presupuesto solo se acuerda antes del sorteo.');
    if (operation !== 'vote' && ex.organizer_id !== userId) throw new PublicError('Solo quien organiza puede configurar o cerrar la encuesta.');
    if (operation === 'create') {
      if (!Array.isArray(value) || value.length < 2 || value.length > 5 || value.some(n => typeof n !== 'number' || !Number.isFinite(n) || n <= 0 || n > 100_000_000 || Math.abs(Math.round(n * 100) - n * 100) > 0.000001) || new Set(value).size !== value.length) throw new PublicError('Elegí entre dos y cinco montos distintos, positivos y con hasta dos decimales.');
      const inserted = await client.query('INSERT INTO budget_polls (exchange_id, options) VALUES ($1, $2::jsonb) ON CONFLICT DO NOTHING RETURNING exchange_id', [exchangeId, JSON.stringify(value)]);
      if (!inserted.rowCount) throw new PublicError('Este intercambio ya tiene una encuesta de presupuesto.');
      return true;
    }
    const poll = await client.query<{ options: number[]; closed_at: string | null }>('SELECT options, closed_at FROM budget_polls WHERE exchange_id = $1 FOR UPDATE', [exchangeId]);
    if (!poll.rows[0] || poll.rows[0].closed_at) throw new PublicError('La encuesta no está abierta.');
    if (typeof value !== 'number' || !poll.rows[0].options.includes(value)) throw new PublicError('Elegí uno de los montos de la encuesta.');
    if (operation === 'vote') await client.query('INSERT INTO budget_votes (exchange_id, user_id, amount) VALUES ($1, $2, $3) ON CONFLICT (exchange_id, user_id) DO UPDATE SET amount = EXCLUDED.amount', [exchangeId, userId, value]);
    else {
      await client.query('UPDATE budget_polls SET closed_at = now(), chosen_amount = $2 WHERE exchange_id = $1', [exchangeId, value]);
      await client.query('UPDATE exchanges SET budget_amount = $2, updated_at = now() WHERE id = $1', [exchangeId, value]);
    }
    return true;
  });
}
export async function getPersonalHistory(userId: string) {
  const res = await dbQuery<{ id: string; name: string; date: string; status: string; previous: string | null; receiver_alias: string | null }>(`SELECT e.id, e.name, e.event_date::text AS date, e.status, e.previous_exchange_id::text AS previous,
    (SELECT p.alias FROM assignments a JOIN draw_versions dv ON dv.id = a.draw_version_id JOIN profiles p ON p.user_id = a.receiver_id
     WHERE a.exchange_id = e.id AND a.giver_id = $1 AND a.revealed_at IS NOT NULL AND dv.version_number = e.current_draw_version AND e.status IN ('sorteado', 'finalizado') LIMIT 1) AS receiver_alias
    FROM exchanges e JOIN memberships m ON m.exchange_id = e.id AND m.user_id = $1 AND m.status = 'approved'
    WHERE e.current_draw_version > 0 OR e.status IN ('finalizado', 'cancelado') ORDER BY e.event_date DESC LIMIT 100`, [userId]);
  return res.rows;
}
export async function getRepresented(exchangeId: string, userId: string) {
  await approvedMember(exchangeId, userId);
  const profiles = await dbQuery<{ user_id: string; alias: string; status: string }>(`SELECT p.user_id, p.alias, m.status FROM profiles p JOIN memberships m ON m.user_id = p.user_id AND m.exchange_id = $1 WHERE p.guardian_user_id = $2 AND p.represented_exchange_id = $1 ORDER BY p.created_at`, [exchangeId, userId]);
  return Promise.all(profiles.rows.map(async p => ({ ...p, assignment: p.status === 'approved' ? await getMyAssignment(exchangeId, p.user_id) : null, wishes: await getMyWishes(p.user_id) })));
}
export async function addRepresented(exchangeId: string, userId: string, alias: string, authorized: boolean) {
  if (!authorized || typeof alias !== 'string' || alias.trim().length < 2 || alias.trim().length > 40) throw new PublicError('Confirmá que tenés autorización y elegí un alias de 2 a 40 caracteres.');
  return dbTransaction(async client => {
    await client.query('SELECT id FROM exchanges WHERE id = $1 FOR UPDATE', [exchangeId]);
    const ex = await approvedMember(exchangeId, userId, client);
    if (ex.status !== 'inscripcion_abierta') throw new PublicError('Solo se pueden agregar personas antes del sorteo.');
    const count = await client.query<{ n: string }>('SELECT count(*)::text AS n FROM profiles WHERE guardian_user_id = $1 AND represented_exchange_id = $2', [userId, exchangeId]);
    if (Number(count.rows[0].n) >= 5) throw new PublicError('Podés representar hasta cinco personas por intercambio.');
    const id = `represented:${crypto.randomUUID()}`;
    const status = ex.organizer_id === userId || !ex.requires_approval ? 'approved' : 'pending';
    await client.query('INSERT INTO profiles (user_id, alias, full_name, guardian_user_id, represented_exchange_id, representation_authorized_at) VALUES ($1, $2, $2, $3, $4, now())', [id, alias.trim(), userId, exchangeId]);
    await client.query('INSERT INTO memberships (exchange_id, user_id, status) VALUES ($1, $2, $3)', [exchangeId, id, status]);
    return id;
  });
}
export async function representedWish(exchangeId: string, userId: string, representedId: string, title: string) {
  await approvedMember(exchangeId, userId);
  const owned = await dbQuery('SELECT user_id FROM profiles WHERE user_id = $1 AND guardian_user_id = $2 AND represented_exchange_id = $3', [representedId, userId, exchangeId]);
  if (!owned.rowCount) throw new PublicError('Esta persona no está a tu cargo en el intercambio.');
  if (typeof title !== 'string' || !title.trim() || title.length > 150) throw new PublicError('Escribí una idea de hasta 150 caracteres.');
  const wish = await saveWish(representedId, { title });
  try { await toggleWishInExchange(representedId, exchangeId, wish.wishId, true); }
  catch { throw new PublicError('Guardamos la idea. La aprobación de quien organiza es necesaria para compartirla.'); }
  return true;
}
export async function removeRepresented(exchangeId: string, userId: string, representedId: string) {
  return dbTransaction(async client => {
    await client.query('SELECT id FROM exchanges WHERE id = $1 FOR UPDATE', [exchangeId]);
    const ex = await approvedMember(exchangeId, userId, client);
    if (!['inscripcion_abierta', 'finalizado', 'cancelado'].includes(ex.status)) throw new PublicError('No se puede quitar una persona de un sorteo activo.');
    await client.query('DELETE FROM profiles WHERE user_id = $1 AND guardian_user_id = $2 AND represented_exchange_id = $3', [representedId, userId, exchangeId]);
    return true;
  });
}
export async function manageRepresentedWish(exchangeId: string, userId: string, representedId: string, wishId: string) {
  await approvedMember(exchangeId, userId);
  const owned = await dbQuery('SELECT user_id FROM profiles WHERE user_id = $1 AND guardian_user_id = $2 AND represented_exchange_id = $3', [representedId, userId, exchangeId]);
  if (!owned.rowCount) throw new PublicError('Esta persona no está a tu cargo en el intercambio.');
  return deleteWish(representedId, wishId);
}
export async function revealRepresented(exchangeId: string, userId: string, representedId: string) {
  await approvedMember(exchangeId, userId);
  const owned = await dbQuery('SELECT user_id FROM profiles WHERE user_id = $1 AND guardian_user_id = $2 AND represented_exchange_id = $3', [representedId, userId, exchangeId]);
  if (!owned.rowCount) throw new PublicError('Esta persona no está a tu cargo en el intercambio.');
  return revealAssignment(exchangeId, representedId);
}
export async function submitSupportReport(userId: string, description: string, area: string) {
  if (typeof description !== 'string' || description.trim().length < 10 || description.length > 2000) throw new PublicError('Describí el problema con entre 10 y 2000 caracteres.');
  const allowed = ['acceso', 'intercambios', 'deseos', 'mensajes', 'instalacion', 'otro'];
  if (!allowed.includes(area)) throw new PublicError('Elegí el área del problema.');
  return dbTransaction(async client => {
    await client.query('SELECT user_id FROM profiles WHERE user_id = $1 FOR UPDATE', [userId]);
    const count = await client.query<{ n: string }>("SELECT count(*)::text AS n FROM support_reports WHERE user_id = $1 AND created_at > now() - interval '1 day'", [userId]);
    if (Number(count.rows[0].n) >= 5) throw new PublicError('Ya recibimos cinco reportes tuyos hoy. Para seguimiento, usá el correo de soporte.');
    const res = await client.query<{ id: string }>('INSERT INTO support_reports (user_id, description, area) VALUES ($1, $2, $3) RETURNING id', [userId, description.trim(), area]);
    return res.rows[0].id;
  });
}
