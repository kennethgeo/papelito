'use client';

import React, { useState } from 'react';
import { useOptionalDemoData } from '@/context/DemoDataContext';
import { useOptionalRealData } from '@/context/RealDataContext';
import type { ExchangeStatus } from '@/types';
import { PaperIllustration } from '@/components/PaperIllustration';
import { InstallGuide } from '@/components/InstallGuide';

const statusNames: Record<ExchangeStatus, string> = {
  sorteado: 'Sorteo listo', inscripcion_abierta: 'Sumando personas', inscripcion_cerrada: 'Inscripción cerrada',
  borrador: 'En preparación', finalizado: 'Celebrado', cancelado: 'Cancelado',
};
const occasionNames = { navidad: 'Navidad', amistad: 'Entre amigos', cumpleanos: 'Cumpleaños', general: 'Para celebrar' };
const money = (amount: number, currency: string) => new Intl.NumberFormat('es-CR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
function dateParts(value: string) {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return { day: '—', month: '', full: value };
  return { day: date.getDate(), month: date.toLocaleDateString('es-CR', { month: 'short' }).replace('.', ''), full: date.toLocaleDateString('es-CR', { day: 'numeric', month: 'long' }) };
}

export function PaperDashboard() {
  const real = useOptionalRealData();
  const demo = useOptionalDemoData();
  const exchanges = real ? real.exchanges : (demo?.exchanges || []);
  const navigate = real ? real.navigateTo : demo?.navigateTo;
  const alias = real ? real.user?.alias : demo?.userProfile.alias;
  const [filter, setFilter] = useState<'todos' | 'activos' | 'borradores'>('todos');
  const featured = exchanges.find(e => e.status === 'sorteado') || exchanges.find(e => e.status === 'inscripcion_abierta') || exchanges[0];
  const filtered = exchanges.filter(e => filter === 'todos' || (filter === 'activos' ? ['sorteado', 'inscripcion_abierta', 'inscripcion_cerrada'].includes(e.status) : ['borrador', 'finalizado', 'cancelado'].includes(e.status)));
  const featuredDate = featured ? dateParts(featured.eventDate) : null;

  return (
    <div className="paper-dashboard">
      <InstallGuide compact />
      <div className="paper-page-heading">
        <div><p className="paper-greeting">Hola, {alias?.split(' ')[0] || 'qué gusto verte'}.</p><h1>Qué lindo tener<br />a quién sorprender.</h1></div>
        <button className="paper-button paper-button--create" onClick={() => navigate?.('intercambio_crear')}><span aria-hidden="true">+</span> Crear intercambio</button>
      </div>

      {featured && filter !== 'borradores' && <section className={`paper-feature paper-feature--${featured.selectedTheme}`} aria-label={`Intercambio destacado: ${featured.name}`}>
        <div className="paper-feature-content">
          <div className="paper-feature-top"><span className="paper-status"><span />{statusNames[featured.status]}</span><span className="paper-occasion">{occasionNames[featured.selectedTheme]}</span></div>
          <h2>{featured.name}</h2>
          <p className="paper-feature-copy">{featured.status === 'sorteado' ? 'Un nombre, unas pistas y una buena sorpresa por preparar.' : 'La sorpresa empieza por reunir a tu gente.'}</p>
          <dl className="paper-event-facts"><div><dt>Nos vemos el</dt><dd>{featuredDate?.full}</dd></div><div><dt>Regalo de</dt><dd>{money(featured.budgetAmount, featured.currency)}</dd></div></dl>
          <div className="paper-feature-actions">
            {featured.status === 'sorteado' && <button className="paper-button" onClick={() => navigate?.('asignacion_revelar', featured.id)}>Ver a quién regalo <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16v12H4zM4 7l8 6 8-6" /></svg></button>}
            <button className="paper-text-button" onClick={() => navigate?.('intercambio_detalle', featured.id)}>Ver intercambio</button>
          </div>
          <div className="paper-party"><span className="paper-people-mark" aria-hidden="true"><i /><i /><i /></span><span>{featured.participantCount ?? featured.participants.length} personas compartiendo la ilusión</span></div>
        </div>
        <div className="paper-feature-art"><PaperIllustration theme={featured.selectedTheme} /><span className="paper-art-note">Se vale dar pistas.<br />¡El nombre es secreto!</span></div>
      </section>}

      <section className="paper-exchanges" aria-labelledby="my-exchanges">
        <div className="paper-list-heading"><h2 id="my-exchanges">Tus intercambios <span>{exchanges.length}</span></h2><p>Cada grupo, una historia.</p></div>
        <div className="paper-filters" role="group" aria-label="Filtrar intercambios">
          {([['todos', 'Todos'], ['activos', 'En marcha'], ['borradores', 'Otros']] as const).map(([key, label]) => <button key={key} aria-pressed={filter === key} onClick={() => setFilter(key)}>{label}</button>)}
        </div>
        <div className="paper-invitation-list">
          {filtered.map(e => { const date = dateParts(e.eventDate); return <button key={e.id} className={`paper-invitation paper-invitation--${e.selectedTheme}`} onClick={() => navigate?.('intercambio_detalle', e.id)}>
            <span className="paper-date-stamp"><strong>{date.day}</strong><span>{date.month}</span></span>
            <span className="paper-invitation-body"><span className="paper-invitation-occasion">{occasionNames[e.selectedTheme]}<span className="paper-status-inline">{statusNames[e.status]}</span></span><strong>{e.name}</strong><span>{money(e.budgetAmount, e.currency)}<span className="paper-dot-separator" />{e.participantCount ?? e.participants.length} personas{e.isCurrentUserOrganizer && <span className="paper-organizer">Organizás vos</span>}</span></span>
            <svg className="paper-invitation-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg>
          </button>; })}
          {filtered.length === 0 && <div className="paper-empty"><h3>Aquí cabe una nueva celebración.</h3><p>Reuní a tu gente y dejá que la sorpresa empiece.</p><button className="paper-button" onClick={() => navigate?.('intercambio_crear')}>{exchanges.length === 0 ? 'Crear mi primer intercambio' : 'Crear otro intercambio'}</button></div>}
        </div>
      </section>
      <p className="paper-closing-note">Hecho para regalar con ganas.</p>
    </div>
  );
}
