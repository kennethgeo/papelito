'use client';
import { useEffect, useId, useRef, useState } from 'react';

export function NameEditor({ name, label, buttonLabel, maxLength, onSave }: {
  name: string; label: string; buttonLabel: string; maxLength: number;
  onSave: (value: string, previous: string) => Promise<void>;
}) {
  const id = useId(), input = useRef<HTMLInputElement>(null), previous = useRef(name), lock = useRef(false);
  const toggle = useRef<HTMLButtonElement>(null), restoreFocus = useRef(false);
  const [editing,setEditing] = useState(false), [draft,setDraft] = useState(name), [busy,setBusy] = useState(false), [error,setError] = useState(''), [message,setMessage] = useState('');
  useEffect(() => {
    if (editing) { restoreFocus.current=true; input.current?.focus(); }
    else if (restoreFocus.current) { toggle.current?.focus(); restoreFocus.current=false; }
  }, [editing]);
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (lock.current) return;
    if (draft.trim().length < 2) { setError('Escribí un nombre de al menos dos caracteres.'); return; }
    lock.current = true; setBusy(true); setError(''); setMessage('');
    try { await onSave(draft.trim(), previous.current); setEditing(false); setMessage('Nombre guardado.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'No pudimos confirmar el cambio. Conservamos lo que escribiste.'); }
    finally { lock.current = false; setBusy(false); }
  }
  return <div className="name-editor">
    {!editing ? <button ref={toggle} className="paper-text-button" onClick={() => { previous.current=name; setDraft(name); setError(''); setMessage(''); setEditing(true); }}>{buttonLabel}</button>
      : <form onSubmit={save}><div className="workshop-field"><label htmlFor={id}>{label}</label><input ref={input} id={id} required minLength={2} maxLength={maxLength} value={draft} onChange={event => setDraft(event.target.value)} disabled={busy} /></div>
        <p className="field-help">Cambia el nombre visible y conserva la participación, los regalos y las asignaciones.</p>
        <div className="workshop-actions"><button className="paper-button" disabled={busy}>{busy?'Guardando…':'Guardar nombre'}</button><button className="paper-text-button" type="button" disabled={busy} onClick={() => { setEditing(false); setError(''); }}>{'Cancelar edición'}</button></div>
      </form>}
    {error && <p className="workshop-error" role="alert">{error}</p>}{message && <p className="workshop-success" role="status">{message}</p>}
  </div>;
}
