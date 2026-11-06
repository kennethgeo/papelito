import 'server-only';
import { dbQuery, dbTransaction, type DbClient } from '@/lib/db/client';
import { PublicError } from '@/lib/data/errors';

type Config = { capacity: number; rules: string; rules_version: number; revision: number };
export type Organization = Config & {
  approved:boolean; owner:boolean; myPosition:number|null; waitingCount:number; approvedCount:number; readCount:number;
  waiting:Array<{user_id:string;alias:string;queued_at:string}>;
  people:Array<{user_id:string;alias:string;guardian:string|null;read_version:number;response:'yes'|'maybe'|'no'|null}>;
  attendance:Array<{user_id:string;alias:string;response:'yes'|'maybe'|'no'|null}>;
  totals:{yes:number;maybe:number;no:number;unanswered:number};
};
const defaults: Config = { capacity: 100, rules: '', rules_version: 1, revision: 0 };
async function config(exchangeId: string, client: DbClient = { query: dbQuery }) {
  return (await client.query<Config>('SELECT capacity, rules, rules_version, revision FROM exchange_organization WHERE exchange_id=$1', [exchangeId])).rows[0] || defaults;
}
async function actor(exchangeId: string, userId: string, client: DbClient, approved = true) {
  const r = await client.query<{ organizer_id: string; status: string; member_status: string }>(`SELECT e.organizer_id,e.status,m.status AS member_status FROM exchanges e JOIN memberships m ON m.exchange_id=e.id WHERE e.id=$1 AND m.user_id=$2`, [exchangeId,userId]);
  if (!r.rows[0] || r.rows[0].member_status === 'rejected' || (approved && r.rows[0].member_status !== 'approved')) throw new PublicError('Este intercambio no está disponible para tu cuenta.');
  return r.rows[0];
}
async function managedPerson(exchangeId: string, userId: string, target: string, client: DbClient) {
  const owned = await client.query(`SELECT m.user_id FROM memberships m JOIN profiles p ON p.user_id=m.user_id WHERE m.exchange_id=$1 AND m.user_id=$3 AND (m.user_id=$2 OR (p.guardian_user_id=$2 AND p.represented_exchange_id=$1))`, [exchangeId,userId,target]);
  if (!owned.rowCount) throw new PublicError('Solo podés responder por vos o por una persona a tu cargo.');
}

// Every caller holds the exchange row lock, shared with invitation, approval and draw mutations.
export async function needsWaitingSlot(client: DbClient, exchangeId: string, target?: string) {
  const settings = await config(exchangeId,client);
  const count = await client.query<{ n: number }>("SELECT count(*)::int AS n FROM memberships WHERE exchange_id=$1 AND status='approved'", [exchangeId]);
  const first = await client.query<{ user_id: string }>(`SELECT q.user_id FROM exchange_waitlist q JOIN memberships m ON m.exchange_id=q.exchange_id AND m.user_id=q.user_id WHERE q.exchange_id=$1 AND m.status='pending' ORDER BY q.queued_at,q.user_id LIMIT 1`,[exchangeId]);
  return count.rows[0].n >= settings.capacity || (!!first.rows[0] && first.rows[0].user_id !== target);
}
export async function assertApprovalSlot(client: DbClient, exchangeId: string, target: string) {
  const guardian = await client.query(`SELECT p.user_id FROM profiles p WHERE p.user_id=$2 AND p.guardian_user_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM memberships m WHERE m.exchange_id=$1 AND m.user_id=p.guardian_user_id AND m.status='approved')`,[exchangeId,target]);
  if(guardian.rowCount) throw new PublicError('Primero aprobá a la persona adulta que representa a este familiar.');
  if (await needsWaitingSlot(client,exchangeId,target)) throw new PublicError('No hay un cupo disponible para esta persona. Revisá la capacidad y atendé primero la lista de espera.');
}
export async function queueMember(client: DbClient, exchangeId: string, target: string) {
  await client.query('INSERT INTO exchange_waitlist(exchange_id,user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',[exchangeId,target]);
}
export async function syncFullWaitlist(client:DbClient,exchangeId:string) {
  const settings=await config(exchangeId,client);
  await client.query(`INSERT INTO exchange_waitlist(exchange_id,user_id,queued_at)
    SELECT m.exchange_id,m.user_id,m.joined_at FROM memberships m WHERE m.exchange_id=$1 AND m.status='pending'
    AND (SELECT count(*) FROM memberships WHERE exchange_id=$1 AND status='approved') >= $2 ON CONFLICT DO NOTHING`,[exchangeId,settings.capacity]);
}
export async function getOrganization(exchangeId: string, userId: string):Promise<Organization> {
  const access = await actor(exchangeId,userId,{query:dbQuery},false);
  const settings = await config(exchangeId);
  const waiting = await dbQuery<{ user_id: string; alias: string; queued_at: string }>(`SELECT q.user_id,p.alias,q.queued_at::text FROM exchange_waitlist q JOIN memberships m ON m.exchange_id=q.exchange_id AND m.user_id=q.user_id JOIN profiles p ON p.user_id=q.user_id WHERE q.exchange_id=$1 AND m.status='pending' ORDER BY q.queued_at,q.user_id`,[exchangeId]);
  const position = waiting.rows.findIndex(p=>p.user_id===userId);
  if (access.member_status !== 'approved') return { ...settings, approved: false, owner: false, myPosition: position<0?null:position+1, waiting: [], people: [], attendance: [], totals: {yes:0,maybe:0,no:0,unanswered:0}, approvedCount: 0, readCount: 0, waitingCount: 0 };
  const people = await dbQuery<{ user_id: string; alias: string; guardian: string | null; read_version: number; response: 'yes'|'maybe'|'no'|null }>(`SELECT m.user_id,p.alias,p.guardian_user_id AS guardian,m.rules_read_version AS read_version,a.response FROM memberships m JOIN profiles p ON p.user_id=m.user_id LEFT JOIN exchange_attendance a ON a.exchange_id=m.exchange_id AND a.user_id=m.user_id WHERE m.exchange_id=$1 AND m.status='approved' ORDER BY p.alias,m.user_id`,[exchangeId]);
  const owner = access.organizer_id === userId;
  const totals = {yes:0,maybe:0,no:0,unanswered:0};
  for (const p of people.rows) totals[p.response || 'unanswered']++;
  return { ...settings, approved:true, owner, myPosition:null, waiting:owner?waiting.rows:[], waitingCount:waiting.rowCount,
    people: people.rows.filter(p=>p.user_id===userId || p.guardian===userId),
    attendance:owner?people.rows.map(p=>({user_id:p.user_id,alias:p.alias,response:p.response})):[],
    totals, approvedCount:people.rowCount, readCount:people.rows.filter(p=>p.read_version===settings.rules_version).length };
}
export async function saveOrganization(exchangeId: string,userId: string,input: {capacity:number;rules:string;revision:number}) {
  if (!input || !Number.isInteger(input.capacity) || input.capacity<3 || input.capacity>100 || typeof input.rules!=='string' || input.rules.length>1500 || !Number.isInteger(input.revision)) throw new PublicError('Elegí entre 3 y 100 cupos y reglas de hasta 1500 caracteres.');
  return dbTransaction(async c=>{
    await c.query('SELECT id FROM exchanges WHERE id=$1 FOR UPDATE',[exchangeId]);
    const a=await actor(exchangeId,userId,c);
    if (a.organizer_id!==userId) throw new PublicError('Solo quien organiza puede editar cupos y reglas.');
    if (a.status!=='inscripcion_abierta') throw new PublicError('Los cupos y reglas se editan con la inscripción abierta, antes del sorteo.');
    const old=await config(exchangeId,c);
    if(old.revision!==input.revision) throw new PublicError('La configuración cambió. Actualizá el grupo antes de guardar otra vez.');
    const n=await c.query<{n:number}>("SELECT count(*)::int AS n FROM memberships WHERE exchange_id=$1 AND status='approved'",[exchangeId]);
    if(input.capacity<n.rows[0].n) throw new PublicError('La capacidad no puede ser menor que la cantidad de personas ya aprobadas.');
    const rules=input.rules.trim(), version=old.rules_version+(rules!==old.rules?1:0);
    await c.query(`INSERT INTO exchange_organization(exchange_id,capacity,rules,rules_version,revision) VALUES($1,$2,$3,$4,$5) ON CONFLICT(exchange_id) DO UPDATE SET capacity=EXCLUDED.capacity,rules=EXCLUDED.rules,rules_version=EXCLUDED.rules_version,revision=EXCLUDED.revision,updated_at=now()`,[exchangeId,input.capacity,rules,version,old.revision+1]);
    if(n.rows[0].n>=input.capacity) await c.query(`INSERT INTO exchange_waitlist(exchange_id,user_id,queued_at) SELECT exchange_id,user_id,joined_at FROM memberships WHERE exchange_id=$1 AND status='pending' ON CONFLICT DO NOTHING`,[exchangeId]);
    return true;
  });
}
export async function respondAttendance(exchangeId:string,userId:string,target:string,response:unknown) {
  if(typeof response!=='string'||!['yes','maybe','no'].includes(response)) throw new PublicError('Elegí si vas, tal vez o no vas a la reunión.');
  return dbTransaction(async c=>{
    await c.query('SELECT id FROM exchanges WHERE id=$1 FOR UPDATE',[exchangeId]);
    const a=await actor(exchangeId,userId,c);
    if(['finalizado','cancelado'].includes(a.status)) throw new PublicError('La asistencia de este intercambio ya está cerrada.');
    await managedPerson(exchangeId,userId,target,c);
    const m=await c.query("SELECT user_id FROM memberships WHERE exchange_id=$1 AND user_id=$2 AND status='approved'",[exchangeId,target]);
    if(!m.rowCount) throw new PublicError('La persona debe estar aprobada antes de responder.');
    await c.query('INSERT INTO exchange_attendance(exchange_id,user_id,response) VALUES($1,$2,$3) ON CONFLICT(exchange_id,user_id) DO UPDATE SET response=EXCLUDED.response,updated_at=now()',[exchangeId,target,response]);
    return true;
  });
}
export async function markRulesRead(exchangeId:string,userId:string,target:string,version:number) {
  return dbTransaction(async c=>{
    await c.query('SELECT id FROM exchanges WHERE id=$1 FOR UPDATE',[exchangeId]);
    await actor(exchangeId,userId,c);await managedPerson(exchangeId,userId,target,c);
    const settings=await config(exchangeId,c);
    if(!settings.rules || version!==settings.rules_version) throw new PublicError('Las reglas cambiaron. Actualizá y leé la versión actual.');
    const r=await c.query("UPDATE memberships SET rules_read_version=$3,rules_read_at=now() WHERE exchange_id=$1 AND user_id=$2 AND status='approved' RETURNING user_id",[exchangeId,target,version]);
    if(!r.rowCount) throw new PublicError('La persona debe estar aprobada para marcar las reglas.');
    return true;
  });
}
export async function withdrawWaitlist(exchangeId:string,userId:string) {
  return dbTransaction(async c=>{
    await c.query('SELECT id FROM exchanges WHERE id=$1 FOR UPDATE',[exchangeId]);
    const a=await actor(exchangeId,userId,c,false);
    if(a.status!=='inscripcion_abierta' || a.member_status!=='pending') throw new PublicError('Solo podés retirar una solicitud pendiente con inscripción abierta.');
    const q=await c.query('DELETE FROM exchange_waitlist WHERE exchange_id=$1 AND user_id=$2 RETURNING user_id',[exchangeId,userId]);
    if(!q.rowCount) throw new PublicError('Tu solicitud no está en la lista de espera.');
    await c.query("UPDATE memberships SET status='rejected' WHERE exchange_id=$1 AND user_id=$2",[exchangeId,userId]);
    return true;
  });
}
