'use client';
import { useEffect, useId, useState } from 'react';
import { useOptionalRealData } from '@/context/RealDataContext';
import { EMPTY_GIFT_PREFERENCES, GIFT_FIELDS, type GiftPreferences } from '@/lib/gift-preferences';
import { giftPreferencesAction } from '@/lib/data/social-actions';
import { callServerAction } from '@/lib/client-actions';

export function GiftPreferencesForm() {
  const fieldId = useId();
  const real = useOptionalRealData();
  const userId = real?.user?.id;
  const isReal = !!real;
  const [value, setValue] = useState<GiftPreferences>(EMPTY_GIFT_PREFERENCES);
  const [busy, setBusy] = useState(true);
  const [status, setStatus] = useState('');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    async function load() {
      if (isReal) {
        const result = await callServerAction(() => giftPreferencesAction());
        if (!active) return;
        if (result.success && result.data) setValue({ ...EMPTY_GIFT_PREFERENCES, ...result.data });
        else { setFailed(true); setStatus(result.error || 'No pudimos cargar tus gustos.'); }
      } else {
        try { const saved = localStorage.getItem('papelito-demo-gustos'); if (saved) setValue(JSON.parse(saved)); } catch { /* Optional demo data. */ }
      }
      if (active) setBusy(false);
    }
    queueMicrotask(() => { if (active) void load(); });
    return () => { active = false; };
  }, [userId, isReal]); // Only reload on account changes, preserving edited drafts.
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setStatus(''); setFailed(false);
    try {
      if (real) {
        const result = await callServerAction(() => giftPreferencesAction(value));
        if (!result.success) throw new Error(result.error);
      } else localStorage.setItem('papelito-demo-gustos', JSON.stringify(value));
      setStatus('Tus pistas quedaron guardadas.');
    } catch (error) { setFailed(true); setStatus(error instanceof Error ? error.message : 'No pudimos guardar. Conservamos lo que escribiste.'); }
    finally { setBusy(false); }
  }
  return <section className="workshop-sheet tastes-sheet">
    <h2>Unas pistas sobre vos.</h2>
    <p>Completá solo lo que querás compartir. Tus gustos los ve quien te regala en cada sorteo vigente.</p>
    <form onSubmit={save}>
      {GIFT_FIELDS.map(([key, label]) => <div className="workshop-field" key={key}><label htmlFor={`${fieldId}-${key}`}>{label}</label>
        <textarea id={`${fieldId}-${key}`} maxLength={280} rows={2} value={value[key]} disabled={busy} onChange={e => setValue({ ...value, [key]: e.target.value })} />
      </div>)}
      <p className="field-help">Podés dejar campos vacíos o borrarlos después. Evitá información sensible.</p>
      <button className="paper-button" disabled={busy}>{busy ? 'Un momento…' : 'Guardar mis gustos'}</button>
    </form>
    {status && <p role={failed ? 'alert' : 'status'}>{status}</p>}
  </section>;
}
