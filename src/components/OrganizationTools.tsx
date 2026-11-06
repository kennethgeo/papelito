'use client';

import { useEffect,useRef,useState,useTransition } from 'react';
import { useOptionalRealData } from '@/context/RealDataContext';
import { useOptionalDemoData } from '@/context/DemoDataContext';
import { callServerAction,callServerRead } from '@/lib/client-actions';
import { organizationAction,saveOrganizationAction,attendanceAction,rulesReadAction,promoteWaitlistAction,withdrawWaitlistAction } from '@/lib/data/organization-actions';
import type { getOrganization } from '@/lib/repositories/organization';
import type { Exchange } from '@/types';

type Organization = Awaited<ReturnType<typeof getOrganization>>;
const ANSWERS = [['yes','Voy'],['maybe','Tal vez'],['no','No voy']] as const;
export function OrganizationTools({exchange}:{exchange:Exchange}) {
  const real=useOptionalRealData(), demo=useOptionalDemoData(), isReal=!!real;
  const [data,setData]=useState<Organization>(),[capacity,setCapacity]=useState('100'),[rules,setRules]=useState('');
  const [error,setError]=useState(''),[message,setMessage]=useState(''),[confirm,setConfirm]=useState('');
  const [pending,startTransition]=useTransition();const lock=useRef(false);
  const dirty=useRef(false),editRevision=useRef(0);const [hasDraft,setHasDraft]=useState(false);
  const storageKey=`papelito-organization:${exchange.id}`;
  const closed=['finalizado','cancelado'].includes(exchange.status);
  const editable=exchange.status==='inscripcion_abierta';
  const demoUserId=demo?.userProfile.id;
  useEffect(()=>{
    let active=true;
    queueMicrotask(()=>startTransition(async()=>{
      if(isReal) {
        const r=await callServerRead(()=>organizationAction(exchange.id),'la organización del grupo');
        if(active){if(r.success&&r.data){setData(r.data);if(!dirty.current){setCapacity(String(r.data.capacity));setRules(r.data.rules);editRevision.current=r.data.revision;}}else setError(r.error||'No pudimos cargar la organización.');}
      } else {
        const approved=exchange.participants.filter(p=>(p.status||'approved')==='approved');
        const mine=approved.find(p=>p.id===demoUserId);
        let saved:Partial<Organization>={};try{saved=JSON.parse(localStorage.getItem(storageKey)||'{}');}catch{}
        const initial:Organization={capacity:100,rules:'',rules_version:1,revision:0,approved:true,owner:exchange.isCurrentUserOrganizer,myPosition:null,waiting:[],waitingCount:0,
          approvedCount:approved.length,readCount:0,people:mine?[{user_id:mine.id,alias:mine.alias,guardian:null,read_version:0,response:null}]:[],attendance:[],totals:{yes:0,maybe:0,no:0,unanswered:approved.length},...saved};
        if(active){setData(initial);setCapacity(String(initial.capacity));setRules(initial.rules);}
      }
    }));
    return()=>{active=false;};
  },[exchange.id,isReal,exchange.currentUserMemberStatus,exchange.isCurrentUserOrganizer,exchange.participants,demoUserId,storageKey]);
  function demoSave(next:Organization) {setData(next);localStorage.setItem(storageKey,JSON.stringify(next));}
  async function reload(discardDraft=false) {
    const r=await callServerRead(()=>organizationAction(exchange.id),'la organización del grupo');
    if(r.success&&r.data){setData(r.data);if(discardDraft){dirty.current=false;setHasDraft(false);}if(!dirty.current){setCapacity(String(r.data.capacity));setRules(r.data.rules);editRevision.current=r.data.revision;}}else throw new Error(r.error||'No pudimos actualizar el grupo.');
  }
  function run(action:()=>Promise<void>,success:string) {
    if(lock.current)return;lock.current=true;setError('');setMessage('');
    startTransition(async()=>{try{await action();setConfirm('');setMessage(success);}catch(e){setError(e instanceof Error?e.message:'No pudimos guardar el cambio.');}finally{lock.current=false;}});
  }
  async function mutate(action:()=>Promise<{success:boolean;error?:string}>,resetEditor=false) {
    const r=await callServerAction(action);if(!r.success)throw new Error(r.error||'No pudimos guardar el cambio.');await reload(resetEditor);
  }
  if(!data)return <section className="workshop-sheet"><p role={error?'alert':'status'}>{error||'Preparando los detalles del encuentro…'}</p>{error&&<button className="paper-outline-button" onClick={()=>run(()=>reload(true),'Información actualizada.')}>Volver a intentar</button>}</section>;
  return <div className="organization-tools">
    <section className="workshop-sheet organization-rules"><details><summary>Reglas y cupos del intercambio</summary>
      <h2>Para que todos juguemos igual.</h2>
      {!real&&<p className="field-help">En demo, los cambios quedan en este navegador. Las inscripciones y la cola real requieren una cuenta.</p>}
      <p>{data.approved?`${data.approvedCount} de ${data.capacity} lugares ocupados.`:`Este intercambio tiene hasta ${data.capacity} lugares.`} Cada persona representada ocupa su propio lugar.</p>
      {data.rules?<div className="group-rules-paper"><p className="preserve-lines">{data.rules}</p><small>Reglas del grupo · versión {data.rules_version}</small></div>:<p>Quien organiza todavía no añadió reglas. El presupuesto y la fecha siguen visibles arriba.</p>}
      {data.rules&&data.approved&&data.people.map(p=><div className="rules-reading" key={p.user_id}><span>{p.alias}: {p.read_version===data.rules_version?'reglas leídas':'sin marcar como leídas'}</span>{p.read_version!==data.rules_version&&!closed&&<button className="paper-text-button" disabled={pending} onClick={()=>run(async()=>{if(real)await mutate(()=>rulesReadAction(exchange.id,p.user_id,data.rules_version));else demoSave({...data,readCount:data.readCount+1,people:data.people.map(x=>x.user_id===p.user_id?{...x,read_version:data.rules_version}:x)});},'Lectura de reglas registrada.')}>Marcar reglas leídas para {p.alias}</button>}</div>)}
      {data.approved&&data.rules&&<p className="field-help">{data.readCount} de {data.approvedCount} personas marcaron esta versión como leída. Es una referencia para organizarse; no bloquea el sorteo ni reemplaza los términos de la app.</p>}
      {data.owner&&editable&&<details className="organization-editor"><summary>Editar reglas y capacidad</summary><form onSubmit={e=>{e.preventDefault();run(async()=>{if(real)await mutate(()=>saveOrganizationAction(exchange.id,{capacity:Number(capacity),rules,revision:editRevision.current}),true);else{if(Number(capacity)<data.approvedCount)throw new Error('No podés dejar menos cupos que personas aprobadas.');dirty.current=false;setHasDraft(false);editRevision.current=data.revision+1;demoSave({...data,capacity:Number(capacity),rules:rules.trim(),rules_version:data.rules_version+(rules.trim()!==data.rules?1:0),revision:data.revision+1});}},'Reglas y capacidad guardadas.');}}>
        <label className="workshop-field">Cantidad máxima de participantes<input type="number" min={Math.max(3,data.approvedCount)} max={100} step={1} required value={capacity} onChange={e=>{dirty.current=true;setHasDraft(true);setCapacity(e.target.value);}} disabled={pending}/></label>
        <label className="workshop-field">Reglas para este grupo<textarea rows={5} maxLength={1500} value={rules} onChange={e=>{dirty.current=true;setHasDraft(true);setRules(e.target.value);}} disabled={pending} placeholder="Por ejemplo: regalo envuelto, sin nombre visible y dentro del presupuesto."/></label>
        <p className="field-help">Evitá datos sensibles y direcciones particulares. Las reglas las ve quien ya solicitó ingresar. Después del sorteo, reglas y cupos quedan cerrados.</p>
        <button className="paper-button" disabled={pending}>Guardar reglas y cupos</button>
      </form></details>}
    </details></section>
    {!data.approved&&data.myPosition!==null&&<section className="workshop-sheet waitlist-sheet"><h2>Tu lugar en la fila: {data.myPosition}.</h2><p>La persona que organiza confirmará tu ingreso cuando haya espacio. Estar en espera no te incluye en el sorteo.</p>{editable&&(confirm==='withdraw'?<div className="confirmation-note"><p>Se retirará tu solicitud. Si cambiás de idea, quien organiza deberá habilitar tu participación.</p><button className="paper-outline-button" disabled={pending} onClick={()=>run(async()=>{await mutate(()=>withdrawWaitlistAction(exchange.id));await real?.refreshNow();},'Solicitud retirada.')}>Confirmar retiro de mi solicitud</button><button className="paper-text-button" onClick={()=>setConfirm('')}>Conservar mi lugar</button></div>:<button className="paper-text-button" onClick={()=>setConfirm('withdraw')}>Retirar mi solicitud de espera</button>)}</section>}
    {data.approved&&<section className="workshop-sheet attendance-sheet"><details><summary>¿Nos vemos en la entrega?</summary><h2>Contá conmigo.</h2><p>Confirmá si vas a la reunión. Tu respuesta no te quita del sorteo ni cambia a quién le regalás. Solo quien organiza ve las respuestas individuales; los demás ven los totales.</p>
      <dl className="attendance-totals">{[['yes','Van'],['maybe','Tal vez'],['no','No van'],['unanswered','Sin responder']].map(([key,label])=><div key={key}><dt>{label}</dt><dd>{data.totals[key as keyof typeof data.totals]}</dd></div>)}</dl>
      {data.people.map(p=><div className="attendance-person" key={p.user_id}><h3>{p.alias}</h3><div className="attendance-answers" role="group" aria-label={`Asistencia de ${p.alias}`}>{ANSWERS.map(([value,label])=><button className="paper-outline-button" key={value} aria-pressed={p.response===value} disabled={pending||closed} onClick={()=>run(async()=>{if(real)await mutate(()=>attendanceAction(exchange.id,p.user_id,value));else{const totals={...data.totals};totals[p.response||'unanswered']--;totals[value]++;demoSave({...data,totals,people:data.people.map(x=>x.user_id===p.user_id?{...x,response:value}:x)});}},'Asistencia guardada. Tu participación en el sorteo se conserva.')}>{label}</button>)}</div></div>)}
      {data.owner&&data.attendance.length>0&&<details><summary>Respuestas para organizar la reunión</summary><ul>{data.attendance.map(p=><li key={p.user_id}>{p.alias}: {ANSWERS.find(a=>a[0]===p.response)?.[1]||'Sin responder'}</li>)}</ul></details>}
      {closed&&<p>Este intercambio ya cerró; las respuestas se conservan como referencia.</p>}
    </details></section>}
    {data.owner&&<section className="workshop-sheet waitlist-sheet"><details><summary>Lista de espera · {data.waitingCount}</summary><h2>Un lugar para el siguiente papelito.</h2><p>Los lugares se asignan por orden de llegada. Aprobar a alguien ocupa un cupo y lo incluye en el próximo sorteo; no hay ingresos automáticos.</p>
      {!data.waiting.length&&<p>No hay personas en la lista de espera.</p>}
      <ol>{data.waiting.map((p,i)=><li key={p.user_id}><strong>{p.alias}</strong>{i===0&&editable&&(confirm===p.user_id?<div className="confirmation-note"><p>¿Confirmás aprobar a {p.alias} para participar?</p><button className="paper-button" disabled={pending||data.approvedCount>=data.capacity} onClick={()=>run(async()=>{await mutate(()=>promoteWaitlistAction(exchange.id,p.user_id));await real?.refreshNow();},'Participación aprobada desde la lista de espera.')}>Confirmar aprobación de {p.alias}</button><button className="paper-text-button" onClick={()=>setConfirm('')}>Volver</button></div>:<button className="paper-text-button" disabled={pending||data.approvedCount>=data.capacity} onClick={()=>setConfirm(p.user_id)}>Aprobar siguiente: {p.alias}</button>)}</li>)}</ol>
      {data.waitingCount>0&&<p className="field-help">Quienes siguen en espera no entrarán al sorteo. Podés ampliar la capacidad antes de sortear; no eliminamos personas aprobadas al cambiar los cupos.</p>}
    </details></section>}
    {real&&<button className="paper-text-button" disabled={pending} onClick={()=>run(()=>reload(true),'Organización actualizada.')}>{hasDraft?'Descartar edición y actualizar organización':'Actualizar organización'}</button>}
    {message&&<p className="workshop-success" role="status">{message}</p>}{error&&<p className="workshop-error" role="alert">{error}</p>}
  </div>;
}
