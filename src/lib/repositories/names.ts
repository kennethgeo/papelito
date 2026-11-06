import 'server-only';
import { dbTransaction } from '@/lib/db/client';
import { PublicError } from '@/lib/data/errors';
import { approvedMember } from './selected-features';

function checkedName(value: unknown, max: number) {
  if (typeof value !== 'string' || value.trim().length < 2 || value.trim().length > max || /[\u0000-\u001f\u007f]/.test(value))
    throw new PublicError(`Escribí un nombre de 2 a ${max} caracteres, en una sola línea.`);
  return value.trim();
}
function checkPrevious(value: unknown) {
  if (typeof value !== 'string') throw new PublicError('Actualizá la página antes de editar el nombre.');
}
export async function renameExchange(exchangeId: string, actorId: string, value: unknown, previous: unknown) {
  const name = checkedName(value, 100); checkPrevious(previous);
  return dbTransaction(async client => {
    await client.query('SELECT id FROM exchanges WHERE id=$1 FOR UPDATE', [exchangeId]);
    const access = await approvedMember(exchangeId, actorId, client);
    if (access.organizer_id !== actorId) throw new PublicError('Solo quien organiza puede cambiar el nombre del intercambio.');
    if (['finalizado','cancelado'].includes(access.status)) throw new PublicError('Este intercambio ya cerró; su nombre se conserva en el historial.');
    const result = await client.query('UPDATE exchanges SET name=$3,updated_at=now() WHERE id=$1 AND organizer_id=$2 AND name=$4 RETURNING id', [exchangeId,actorId,name,previous]);
    if (!result.rowCount) throw new PublicError('El nombre cambió en otra pantalla. Actualizá la página antes de guardar otra vez.');
    return true;
  });
}
export async function renameRepresented(exchangeId: string, actorId: string, personId: string, value: unknown, previous: unknown) {
  const alias = checkedName(value, 40); checkPrevious(previous);
  return dbTransaction(async client => {
    await client.query('SELECT id FROM exchanges WHERE id=$1 FOR UPDATE', [exchangeId]);
    const access = await approvedMember(exchangeId, actorId, client);
    if (['finalizado','cancelado'].includes(access.status)) throw new PublicError('Este intercambio ya cerró; los alias se conservan en el historial.');
    const owned = await client.query<{alias:string}>('SELECT p.alias FROM profiles p JOIN memberships m ON m.user_id=p.user_id AND m.exchange_id=$1 WHERE p.user_id=$3 AND p.guardian_user_id=$2 AND p.represented_exchange_id=$1 AND m.status <> $4', [exchangeId,actorId,personId,'rejected']);
    if (!owned.rowCount) throw new PublicError('Solo podés cambiar el alias de una persona a tu cargo que participe en este intercambio.');
    if (owned.rows[0].alias !== previous) throw new PublicError('El alias cambió en otra pantalla. Actualizá la página antes de guardar otra vez.');
    await client.query('UPDATE profiles SET alias=$2,full_name=$2,updated_at=now() WHERE user_id=$1', [personId,alias]);
    return true;
  });
}
