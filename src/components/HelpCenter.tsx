'use client';
import { useId, useState } from 'react';
import { HELP_ITEMS } from '@/lib/help';
import { supportReportAction } from '@/lib/data/selected-actions';
import { callServerAction } from '@/lib/client-actions';
export function HelpCenter({ demo = false }: { demo?: boolean }) {
  const [search, setSearch] = useState(''), [area, setArea] = useState('otro'), [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [receipt, setReceipt] = useState(''), [review, setReview] = useState(false);
  const id = useId();
  const normalized = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const items = HELP_ITEMS.filter(item => normalized(item.join(' ')).includes(normalized(search)));
  async function send() {
    setBusy(true); setError('');
    const r = await callServerAction(() => supportReportAction(description, area));
    if (r.success && r.data) { setReceipt(r.data); setReview(false); setDescription(''); }
    else setError(r.error || 'No pudimos recibir tu reporte. Podés escribir al correo de soporte.');
    setBusy(false);
  }
  return <div className="help-center"><section className="workshop-sheet"><h2>Una mano con tu papelito.</h2>
    <label className="workshop-field" htmlFor={`${id}-search`}>Buscar ayuda</label><input id={`${id}-search`} className="help-search" type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Invitación, contraseña, sorteo…" />
    {items.map(([title, text]) => <details className="help-question" key={title}><summary>{title}</summary><p>{text}</p></details>)}
    {!items.length && <p>No encontramos una respuesta con esas palabras. Probá otra búsqueda o contanos el problema.</p>}
  </section><section className="workshop-sheet"><details><summary>Reportar un problema</summary><h2>Contanos qué pasó.</h2><p>El reporte incluye únicamente el área y lo que escribás. No adjuntamos tu asignación, mensajes, deseos ni diagnósticos ocultos.</p>
    {receipt && <p role="status" className="confirmation-note">Recibimos tu reporte. Folio: {receipt}. Para seguimiento, escribí a kennethgeo97@gmail.com con ese folio.</p>}
    <form onSubmit={e => { e.preventDefault(); setError(''); setReview(true); }}>
      <label className="workshop-field">Área del problema<select value={area} onChange={e => { setArea(e.target.value); setReview(false); }}><option value="acceso">Acceso a la cuenta</option><option value="intercambios">Intercambios</option><option value="deseos">Deseos</option><option value="mensajes">Mensajes</option><option value="instalacion">Instalación o notificaciones</option><option value="otro">Otro</option></select></label>
      <label className="workshop-field" htmlFor={`${id}-report`}>¿Qué estabas intentando hacer y qué ocurrió?</label><textarea id={`${id}-report`} minLength={10} maxLength={2000} rows={4} required value={description} onChange={e => { setDescription(e.target.value); setReview(false); }} />
      <p className="field-help">Evitá incluir contraseñas, códigos de acceso o datos privados de otras personas. Para enviarlo necesitás iniciar sesión.</p>
      {!review && <button className="paper-outline-button" disabled={busy}>Revisar reporte</button>}
    </form>
    {review && <div className="confirmation-note"><h3>Esto es lo que se enviará.</h3><p>Área: {area}</p><p className="preserve-lines">{description}</p>{demo ? <p>Estás en la demo. No se envía este reporte.</p> : <button className="paper-button" disabled={busy} onClick={() => void send()}>{busy ? 'Enviando…' : 'Confirmar y enviar reporte'}</button>}<button className="paper-text-button" onClick={() => setReview(false)}>Seguir editando</button></div>}
    {error && <p role="alert" className="workshop-error">{error}</p>}<p>También podés escribir a <a href="mailto:kennethgeo97@gmail.com">kennethgeo97@gmail.com</a>.</p>
  </details></section></div>;
}
