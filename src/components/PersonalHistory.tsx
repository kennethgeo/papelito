'use client';
import { useEffect, useState } from 'react';
import { historyAction } from '@/lib/data/selected-actions';
import { callServerAction } from '@/lib/client-actions';
import { useOptionalRealData } from '@/context/RealDataContext';
import { useOptionalDemoData } from '@/context/DemoDataContext';
import { formatEventDate } from '@/lib/event-dates';
import type { getPersonalHistory } from '@/lib/repositories/selected-features';
export function PersonalHistory() {
  const real = useOptionalRealData(), demo = useOptionalDemoData();
  const [rows, setRows] = useState<Awaited<ReturnType<typeof getPersonalHistory>>>([]), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const isReal = !!real;
  useEffect(() => { let active = true; if (isReal) queueMicrotask(async () => { const r = await callServerAction(() => historyAction()); if (active) { if (r.success && r.data) setRows(r.data); else setError(r.error || 'No pudimos cargar el historial.'); } }); return () => { active = false; }; }, [isReal]);
  const data = isReal ? rows : (demo?.exchanges || []).filter(e => ['sorteado', 'finalizado', 'cancelado'].includes(e.status)).map(e => ({ id: e.id, name: e.name, date: e.eventDate, status: e.status, previous: null, receiver_alias: e.assignment?.revealed ? e.assignment.receiverAlias : null }));
  return <section className="workshop-sheet"><details><summary>Mis intercambios anteriores</summary><h2>Pequeños detalles que quedan.</h2><p>Solo mostramos tus participaciones y las asignaciones que ya abriste. El historial disponible está sujeto a la conservación de cada intercambio.</p>
    {data.map(e => <article className="history-edition" key={e.id}><h3>{e.name}</h3><p>{formatEventDate(e.date)} · {e.status === 'finalizado' ? 'Celebrado' : e.status === 'cancelado' ? 'Cancelado' : 'Sorteado'}</p>{e.previous && <p className="field-help">Nueva edición de {data.find(p => p.id === e.previous)?.name || 'un intercambio anterior'}.</p>}{e.receiver_alias && <p>Tu regalo fue para <strong>{e.receiver_alias}</strong>.</p>}<button className="paper-text-button" onClick={() => (real?.navigateTo || demo?.navigateTo)?.('intercambio_detalle', e.id)}>Abrir {e.name}</button></article>)}
    {!data.length && <p>Tus intercambios sorteados o cerrados aparecerán aquí.</p>}{error && <p role="alert">{error}</p>}
    {isReal && <button className="paper-text-button" disabled={busy} onClick={async () => { setBusy(true); const r = await callServerAction(() => historyAction()); if (r.success && r.data) { setRows(r.data); setError(''); } else setError(r.error || 'No se pudo actualizar.'); setBusy(false); }}>Actualizar historial</button>}
  </details></section>;
}
