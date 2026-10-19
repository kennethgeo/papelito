'use client';
import { useRef, useState } from 'react';
import { useOptionalRealData } from '@/context/RealDataContext';
import { useOptionalDemoData } from '@/context/DemoDataContext';
import { createExchangeAction } from '@/lib/data/server-actions';
import { callServerAction } from '@/lib/client-actions';
import { getCostaRicaTodayDate } from '@/lib/date/costa-rica';
import { suggestedEventDates, validateExchangeDraft } from '@/lib/event-dates';
import { inferThemeFromDate } from '@/lib/theme';
import type { Exchange } from '@/types';

export function RepeatExchange({ exchange }: { exchange: Exchange }) {
  const real = useOptionalRealData(); const demo = useOptionalDemoData();
  const [name, setName] = useState(`${exchange.name.slice(0, 82)} · nueva edición`);
  const defaults = suggestedEventDates(getCostaRicaTodayDate());
  const [date, setDate] = useState(defaults.eventDate);
  const [deadline, setDeadline] = useState(defaults.registrationDeadline);
  const [busy, setBusy] = useState(false); const lock = useRef(false);
  const [error, setError] = useState('');
  async function repeat(event: React.FormEvent) {
    event.preventDefault(); if (lock.current) return;
    const errors = validateExchangeDraft({ name, eventDate: date, registrationDeadline: deadline, budgetAmount: exchange.budgetAmount }, getCostaRicaTodayDate());
    if (Object.keys(errors).length) { setError(Object.values(errors).join(' ')); return; }
    lock.current = true; setBusy(true); setError('');
    try {
      const data = { name, description: exchange.description, eventDate: date, registrationDeadline: deadline, budgetAmount: exchange.budgetAmount,
        currency: exchange.currency, requiresApproval: exchange.requiresApproval };
      if (real) {
        const result = await callServerAction(() => createExchangeAction({ ...data, previousExchangeId: exchange.id, suggestedTheme: inferThemeFromDate(date).theme, selectedTheme: exchange.manualThemeOverride || inferThemeFromDate(date).theme }));
        if (!result.success || !result.data) { setError(result.error || 'No pudimos crear la nueva edición.'); return; }
        real.navigateTo('intercambio_detalle', result.data.exchangeId); await real.reloadExchanges();
      } else if (demo) { const id = demo.createExchange(data); demo.navigateTo('intercambio_detalle', id); }
    } catch { setError('No pudimos confirmar la nueva edición. Revisá tus intercambios antes de volver a crearla.'); }
    finally { lock.current = false; setBusy(false); }
  }
  return <section className="workshop-sheet repeat-sheet"><details><summary>Repetir este intercambio</summary>
    <h2>La misma gente, otra sorpresa.</h2>
    <p>Copiamos el presupuesto y las reglas de aprobación. Compartí la nueva invitación para que cada persona se inscriba.</p>
    <p className="field-help">El sorteo evitará destinatarios de las ediciones anteriores vinculadas mientras se conserve su historial. Si no hay combinación posible, te avisará. Las restricciones manuales y los deseos no se copian.</p>
    {!real && <p className="field-help">En demo solo se copia la configuración; el historial se aplica en intercambios reales.</p>}
    <form onSubmit={repeat}>
      <label className="workshop-field">Nombre de la nueva edición<input required minLength={2} maxLength={100} value={name} onChange={e => setName(e.target.value)} /></label>
      <label className="workshop-field">Nueva fecha de entrega<input type="date" required min={getCostaRicaTodayDate()} value={date} onChange={e => setDate(e.target.value)} /></label>
      <label className="workshop-field">Nuevo cierre de inscripción<input type="date" required min={getCostaRicaTodayDate()} max={date} value={deadline} onChange={e => setDeadline(e.target.value)} /></label>
      <button className="paper-button" disabled={busy}>{busy ? 'Creando edición…' : 'Crear nueva edición'}</button>
    </form>{error && <p role="alert" className="workshop-error">{error}</p>}
  </details></section>;
}
