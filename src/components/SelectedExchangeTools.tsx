'use client';
import { useEffect, useState } from 'react';
import { useOptionalRealData } from '@/context/RealDataContext';
import { budgetPollAction, changeBudgetPollAction, representedAction, addRepresentedAction, representedWishAction, removeRepresentedAction, deleteRepresentedWishAction, revealRepresentedAction } from '@/lib/data/selected-actions';
import { callServerAction } from '@/lib/client-actions';
import { formatMoney } from '@/lib/event-dates';
import type { Exchange } from '@/types';
import type { getBudgetPoll, getRepresented } from '@/lib/repositories/selected-features';

type Poll = Awaited<ReturnType<typeof getBudgetPoll>>;
export function BudgetPoll({ exchange }: { exchange: Exchange }) {
  const real = useOptionalRealData();
  const [poll, setPoll] = useState<Poll>(null), [amounts, setAmounts] = useState(['5000', '10000', '15000']);
  const [chosen, setChosen] = useState(''); const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [loaded, setLoaded] = useState(false);
  const isReal = !!real;
  useEffect(() => { let active = true; queueMicrotask(async () => {
    if (!active) return;
    if (isReal) { const r = await callServerAction(() => budgetPollAction(exchange.id)); if (!active) return; if (r.success) setPoll(r.data || null); else setError(r.error || 'No pudimos cargar la encuesta.'); }
    else { try { setPoll(JSON.parse(localStorage.getItem(`papelito-poll:${exchange.id}`) || 'null')); } catch {} }
    setLoaded(true);
  }); return () => { active = false; }; }, [exchange.id, isReal]);
  async function change(operation: 'create' | 'vote' | 'close', value: unknown) {
    if (busy) return; setBusy(true); setError('');
    try {
      if (real) {
        const r = await callServerAction(() => changeBudgetPollAction(exchange.id, operation, value));
        if (!r.success) { setError(r.error || 'No pudimos guardar.'); return; }
        const latest = await callServerAction(() => budgetPollAction(exchange.id)); if (latest.success) setPoll(latest.data || null);
        if (operation === 'close') await real.refreshNow();
      } else {
        const next: Poll = operation === 'create' ? { options: value as number[], closed: false, chosen: null, myVote: null, counts: [] } : operation === 'vote' ? { ...poll!, myVote: Number(value), counts: [{ amount: Number(value), count: 1 }] } : { ...poll!, closed: true, chosen: Number(value) };
        setPoll(next); localStorage.setItem(`papelito-poll:${exchange.id}`, JSON.stringify(next));
      }
      setConfirm(false);
    } finally { setBusy(false); }
  }
  if (!loaded || (!poll && (!exchange.isCurrentUserOrganizer || exchange.status !== 'inscripcion_abierta'))) return error ? <p role="alert">{error}</p> : null;
  return <section className="workshop-sheet budget-sheet"><details><summary>Acordar el presupuesto</summary>
    <h2>Un monto cómodo para todos.</h2><p>Un voto por persona aprobada. Podés cambiarlo mientras la encuesta esté abierta; los demás ven solo el total.</p>
    {!real && <p className="field-help">Encuesta de demostración, guardada en este navegador.</p>}
    {!poll ? <form onSubmit={e => { e.preventDefault(); const values = amounts.filter(Boolean).map(Number); if (values.length < 2 || values.some(v => !Number.isFinite(v) || v <= 0) || new Set(values).size !== values.length) { setError('Elegí de dos a cinco montos distintos y positivos.'); return; } void change('create', values); }}>
      {amounts.map((a, i) => <label className="workshop-field" key={i}>Opción {i + 1} ({exchange.currency})<input type="number" min="0.01" max="100000000" step="0.01" value={a} onChange={e => setAmounts(amounts.map((v, j) => i === j ? e.target.value : v))} /></label>)}
      {amounts.length < 5 && <button type="button" className="paper-text-button" onClick={() => setAmounts([...amounts, ''])}>Agregar opción</button>}
      <button className="paper-button" disabled={busy}>{busy ? 'Guardando…' : 'Abrir encuesta'}</button>
    </form> : <>
      <div className="poll-options">{poll.options.map(amount => <button key={amount} className="paper-outline-button" disabled={busy || poll.closed || exchange.status !== 'inscripcion_abierta'} aria-pressed={poll.myVote === amount} onClick={() => void change('vote', amount)}>{formatMoney(amount, exchange.currency)} · {poll.counts.find(c => c.amount === amount)?.count || 0} votos{poll.myVote === amount ? ' · Tu voto' : ''}</button>)}</div>
      {poll.closed ? <p role="status">Presupuesto acordado: {formatMoney(poll.chosen!, exchange.currency)}.</p> : exchange.isCurrentUserOrganizer && exchange.status === 'inscripcion_abierta' && <>
        <label className="workshop-field">Presupuesto que se aplicará<select value={chosen} onChange={e => { setChosen(e.target.value); setConfirm(false); }}><option value="">Elegí el monto</option>{poll.options.map(a => <option key={a} value={a}>{formatMoney(a, exchange.currency)}</option>)}</select></label>
        {!confirm ? <button className="paper-button" disabled={!chosen || busy} onClick={() => setConfirm(true)}>Cerrar encuesta</button> : <div className="confirmation-note"><p>Se cerrará la votación y este será el presupuesto del intercambio. Revisá los resultados; si hay empate, la decisión queda en tus manos.</p><button className="paper-button" disabled={busy} onClick={() => void change('close', Number(chosen))}>Confirmar presupuesto</button><button className="paper-text-button" onClick={() => setConfirm(false)}>Seguir votando</button></div>}
      </>}
    </>}{error && <p role="alert" className="workshop-error">{error}</p>}
  </details></section>;
}

export function RepresentedParticipants({ exchange }: { exchange: Exchange }) {
  const real = useOptionalRealData();
  const [people, setPeople] = useState<Awaited<ReturnType<typeof getRepresented>>>([]);
  const [alias, setAlias] = useState(''), [authorized, setAuthorized] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>({}), [opened, setOpened] = useState<string[]>([]), [removing, setRemoving] = useState('');
  const [deletingWish, setDeletingWish] = useState('');
  const isReal = !!real;
  useEffect(() => { let active = true; if (!isReal) return; queueMicrotask(async () => { const r = await callServerAction(() => representedAction(exchange.id)); if (active) { if (r.success && r.data) setPeople(r.data); else setError(r.error || 'No pudimos cargar las personas a tu cargo.'); } }); return () => { active = false; }; }, [exchange.id, isReal]);
  async function run(action: () => Promise<{ success: boolean; error?: string }>) {
    if (busy) return; setBusy(true); setError('');
    try { const r = await action(); if (!r.success) { setError(r.error || 'No se pudo guardar.'); return; } const next = await callServerAction(() => representedAction(exchange.id)); if (next.success && next.data) setPeople(next.data); await real?.refreshNow(); }
    finally { setBusy(false); }
  }
  return <section className="workshop-sheet"><details><summary>Personas a mi cargo</summary><h2>Una cuenta, un poquito de ayuda.</h2>
    <p>Podés representar hasta cinco familiares en este intercambio. Cada uno participa con su alias y sus propios deseos; vos podrás consultar sus asignaciones. Tu cuenta también participa.</p>
    {!real ? <p className="field-help">Esta función requiere una cuenta real para vincular la autorización del adulto y la aprobación del grupo.</p> : <>
      {exchange.status === 'inscripcion_abierta' && <form onSubmit={e => { e.preventDefault(); void run(async () => { const r = await callServerAction(() => addRepresentedAction(exchange.id, alias, authorized)); if (r.success) { setAlias(''); setAuthorized(false); } return r; }); }}>
        <label className="workshop-field">Alias de la persona<input minLength={2} maxLength={40} required value={alias} onChange={e => setAlias(e.target.value)} /></label>
        <label className="paper-wish-check"><input type="checkbox" checked={authorized} onChange={e => setAuthorized(e.target.checked)} required /><span>Soy adulto y tengo autorización para representar a esta persona y gestionar su participación.</span></label>
        <button className="paper-button" disabled={busy || !authorized}>Agregar persona</button>
      </form>}
      {people.map(p => <article className="represented-person" key={p.user_id}><h3>{p.alias}</h3><p>{p.status === 'approved' ? 'Participación aprobada' : p.status === 'pending' ? 'Pendiente de aprobación del organizador' : 'Participación rechazada'}</p>
        <ul>{p.wishes.map(w => <li key={w.id}>{w.title} {deletingWish===w.id?<><button className="paper-text-button" disabled={busy} onClick={()=>void run(()=>callServerAction(()=>deleteRepresentedWishAction(exchange.id,p.user_id,w.id)))}>Confirmar quitar idea</button><button className="paper-text-button" onClick={()=>setDeletingWish('')}>Conservar idea</button></>:<button className="paper-text-button" onClick={()=>setDeletingWish(w.id)}>Quitar idea de {p.alias}</button>}</li>)}</ul>
        {p.status === 'approved' && !['finalizado', 'cancelado'].includes(exchange.status) && <form onSubmit={e => { e.preventDefault(); void run(async () => { const r = await callServerAction(() => representedWishAction(exchange.id, p.user_id, drafts[p.user_id] || '')); if (r.success) setDrafts({ ...drafts, [p.user_id]: '' }); return r; }); }}><label className="workshop-field">Idea de regalo para {p.alias}<input maxLength={150} required value={drafts[p.user_id] || ''} onChange={e => setDrafts({ ...drafts, [p.user_id]: e.target.value })} /></label><button className="paper-outline-button" disabled={busy}>Guardar idea para {p.alias}</button></form>}
        {p.assignment && (!opened.includes(p.user_id) ? <button className="paper-button" disabled={busy} onClick={()=>void run(async()=>{const r=await callServerAction(()=>revealRepresentedAction(exchange.id,p.user_id));if(r.success)setOpened([...opened,p.user_id]);return r;})}>Ver asignación de {p.alias}</button> : <div className="confirmation-note"><p>{p.alias} le regala a <strong>{p.assignment.receiverAlias}</strong>.</p><ul>{p.assignment.wishes.map(w => <li key={w.id}>{w.title}{w.description ? ` — ${w.description}` : ''}</li>)}</ul><button className="paper-text-button" onClick={() => setOpened(opened.filter(id => id !== p.user_id))}>Ocultar asignación</button></div>)}
        {exchange.status === 'inscripcion_abierta' && (removing === p.user_id ? <div className="confirmation-note"><p>Se quitarán del intercambio esta participación y sus deseos.</p><button className="paper-outline-button danger-button" disabled={busy} onClick={() => void run(() => callServerAction(() => removeRepresentedAction(exchange.id, p.user_id)))}>Confirmar quitar a {p.alias}</button><button className="paper-text-button" onClick={() => setRemoving('')}>Conservar</button></div> : <button className="paper-text-button" onClick={() => setRemoving(p.user_id)}>Quitar a {p.alias}</button>)}
      </article>)}
    </>}{error && <p role="alert" className="workshop-error">{error}</p>}
  </details></section>;
}
