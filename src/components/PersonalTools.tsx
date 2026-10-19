'use client';
import { useEffect, useState } from 'react';
import { useOptionalRealData } from '@/context/RealDataContext';
import { serviceStatusAction } from '@/lib/data/selected-actions';
import { callServerAction } from '@/lib/client-actions';
import { HelpCenter } from './HelpCenter';
export function PersonalTools() {
  const real = useOptionalRealData();
  const [prefs, setPrefs] = useState({ large: false, contrast: false, motion: false });
  const [status, setStatus] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => { queueMicrotask(() => { try { const p = JSON.parse(localStorage.getItem('papelito-accessibility') || '{}'); setPrefs({ large: p.large === true, contrast: p.contrast === true, motion: p.motion === true }); } catch {} }); }, []);
  function update(next: typeof prefs) {
    setPrefs(next); const root = document.documentElement;
    root.setAttribute('data-large-text', String(next.large)); root.setAttribute('data-high-contrast', String(next.contrast)); root.setAttribute('data-reduced-motion', String(next.motion));
    try { localStorage.setItem('papelito-accessibility', JSON.stringify(next)); } catch { setError('El navegador no pudo conservar estas preferencias. Se aplican mientras esta página esté abierta.'); }
  }
  async function check() {
    setBusy(true); setStatus(''); setError('');
    if (!navigator.onLine) { setError('Este dispositivo está sin conexión. Reconectá para comprobar tu cuenta.'); setBusy(false); return; }
    if (!real) { setStatus('La demo está cargada; no consulta la cuenta ni los servicios reales.'); setBusy(false); return; }
    const r = await callServerAction(() => serviceStatusAction());
    if (r.success && r.data) setStatus(`Pudimos consultar tu cuenta y sus datos a las ${new Intl.DateTimeFormat('es-CR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Costa_Rica' }).format(new Date(r.data.checkedAt))}.`);
    else setError(r.error || 'No pudimos confirmar el acceso a tus datos. Intentá actualizar o volver a entrar.');
    setBusy(false);
  }
  return <>
    <section className="workshop-sheet"><details><summary>Verlo a tu manera</summary><h2>Más cómodo para vos.</h2>
      {([['large', 'Texto más grande'], ['contrast', 'Mayor contraste'], ['motion', 'Reducir animaciones']] as const).map(([key, label]) => <label className="paper-wish-check" key={key}><input type="checkbox" checked={prefs[key]} onChange={e => update({ ...prefs, [key]: e.target.checked })} /><span>{label}</span></label>)}
      <p className="field-help">Guardamos estas preferencias solo en este navegador. También respetamos los ajustes de movimiento del dispositivo.</p>
    </details></section>
    <section className="workshop-sheet"><details><summary>Estado de mi conexión y cuenta</summary><h2>¿Todo al día?</h2><p>Comprobamos este dispositivo y el acceso a tu cuenta en este momento. No es una medición global de todos los servicios.</p>
      {real?.lastSyncedAt && <p>Última sincronización: {new Intl.DateTimeFormat('es-CR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Costa_Rica' }).format(new Date(real.lastSyncedAt))}.</p>}
      <button className="paper-outline-button" disabled={busy} onClick={() => void check()}>{busy ? 'Comprobando…' : 'Comprobar conexión y cuenta'}</button>
    </details>{status && <p role="status">{status}</p>}{error && <p role="alert" className="workshop-error">{error}</p>}</section>
    <section className="workshop-sheet"><details><summary>Guía y ayuda</summary><p>Podés volver a ver la guía cuando lo necesités.</p><button className="paper-outline-button" onClick={() => window.dispatchEvent(new Event('papelito-show-guide'))}>Ver guía inicial</button><HelpCenter demo={!real} /></details></section>
  </>;
}
