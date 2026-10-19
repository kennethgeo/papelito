'use client';
import { useEffect, useState } from 'react';
import { useOptionalRealData } from '@/context/RealDataContext';
import { useOptionalDemoData } from '@/context/DemoDataContext';
import { sealCopy, writeOfflineCopy, readOfflineCopy, clearOfflineCopy } from '../../public/offline-vault.js';
import { getAppSnapshotAction } from '@/lib/data/server-actions';
import { callServerAction } from '@/lib/client-actions';
export function OfflineCopy() {
  const real = useOptionalRealData(), demo = useOptionalDemoData();
  const [password,setPassword] = useState(''), [repeat,setRepeat] = useState(''), [consent,setConsent] = useState(false);
  const [busy,setBusy] = useState(false), [saved,setSaved] = useState(''), [error,setError] = useState(''), [removing,setRemoving] = useState(false);
  useEffect(() => { let active = true; void readOfflineCopy().then(copy => { if (active && copy) setSaved(new Date(copy.createdAt).toISOString()); }).catch(() => undefined); return () => { active = false; }; }, []);
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (busy) return; setError('');
    if (!navigator.onLine) { setError('Conectate para guardar una copia actualizada.'); return; }
    if (password.length < 8 || password !== repeat || !consent) { setError('Confirmá la clave local y el guardado de la copia.'); return; }
    setBusy(true);
    try {
      const fields = (w: { title: string; description?: string; url?: string }) => ({ title:w.title, description:w.description || '', url:w.url || '' });
      const snapshot = real ? await callServerAction(() => getAppSnapshotAction(real.currentExchange?.id)) : null;
      if (real && (!snapshot?.success || !snapshot.data?.consent.hasCurrentConsent)) throw new Error('No pudimos actualizar los datos para la copia. Volvé a intentar con conexión.');
      const a = real ? snapshot?.data?.selected?.assignment : demo?.currentExchange?.assignment;
      const name = real ? snapshot?.data?.selected?.details.exchange.name : demo?.currentExchange?.name;
      const data = { wishes:(snapshot?.data?.wishes || demo?.userWishes || []).slice(0,50).map(fields), assignment:a?.revealed ? { exchangeName:name, receiverAlias:a.receiverAlias, wishes:a.wishes.slice(0,50).map(fields) } : null };
      await writeOfflineCopy(await sealCopy(data,password)); setPassword(''); setRepeat(''); setConsent(false); setSaved(new Date().toISOString());
    } catch(e) { setError(e instanceof Error ? e.message : 'No pudimos guardar la copia.'); } finally { setBusy(false); }
  }
  return <section className="workshop-sheet"><details><summary>Mi copia privada sin conexión</summary><h2>Una copia, solo en este dispositivo.</h2><p>Guardá hasta 50 deseos y la asignación del último intercambio que abriste. Dura 24 horas, es de solo lectura y se cifra con una clave local que no enviamos al servidor.</p><p>Puede estar desactualizada. Una revocación remota no puede borrar un dispositivo desconectado. Usá esta opción solo en un dispositivo propio.</p>
    <form onSubmit={save}><label className="workshop-field">Elegí una clave local<input type="password" autoComplete="off" minLength={8} maxLength={128} required value={password} onChange={e=>setPassword(e.target.value)}/></label><label className="workshop-field">Repetí la clave local<input type="password" autoComplete="off" minLength={8} maxLength={128} required value={repeat} onChange={e=>setRepeat(e.target.value)}/></label><p className="field-help">Elegí una clave exclusiva para esta copia, diferente de tu contraseña de acceso. Si la olvidás, podés borrar la copia y guardar otra con conexión. Última sincronización: {real?.lastSyncedAt ? new Date(real.lastSyncedAt).toLocaleString('es-CR') : 'demostración'}.</p><label className="paper-wish-check"><input type="checkbox" required checked={consent} onChange={e=>setConsent(e.target.checked)}/><span>Quiero guardar esta copia cifrada y entiendo que puede haber cambios posteriores.</span></label><button className="paper-button" disabled={busy}>{busy?'Cifrando copia…':'Guardar copia privada'}</button></form>
    {saved&&<p role="status">Hay una copia guardada desde {new Date(saved).toLocaleString('es-CR')}. <a href="/offline.html">Abrir copia de lectura</a>.</p>}
    {!removing?<button className="paper-text-button" onClick={()=>setRemoving(true)}>Borrar copia de este navegador</button>:<div className="confirmation-note"><p>La información de tu cuenta seguirá guardada en Papelito.</p><button className="paper-outline-button" onClick={async()=>{await clearOfflineCopy();setSaved('');setRemoving(false);}}>Confirmar borrado local</button><button className="paper-text-button" onClick={()=>setRemoving(false)}>Conservar copia</button></div>}
    {error&&<p role="alert" className="workshop-error">{error}</p>}
  </details></section>;
}
