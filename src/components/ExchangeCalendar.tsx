'use client';
import { useEffect, useState } from 'react';
import { calendarICS, countdownText, googleCalendarURL } from '@/lib/calendar';
import { getCostaRicaTodayDate } from '@/lib/date/costa-rica';
import type { Exchange } from '@/types';
export function ExchangeCalendar({ exchange }: { exchange: Exchange }) {
  const [today, setToday] = useState(() => getCostaRicaTodayDate());
  useEffect(() => { const update = () => setToday(getCostaRicaTodayDate()); window.addEventListener('focus', update); const timer = setInterval(update, 60_000); return () => { clearInterval(timer); window.removeEventListener('focus', update); }; }, []);
  function download() {
    const url = URL.createObjectURL(new Blob([calendarICS(exchange)], { type: 'text/calendar;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = 'papelito-evento.ics'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const closed = ['finalizado', 'cancelado'].includes(exchange.status);
  return <section className="workshop-sheet calendar-note">
    <h2>{closed ? exchange.status === 'finalizado' ? 'Un intercambio para recordar.' : 'Este intercambio fue cancelado.' : countdownText(exchange.eventDate, today, 'entrega')}</h2>
    {!closed && exchange.status === 'inscripcion_abierta' && <p>{countdownText(exchange.registrationDeadline, today, 'inscripción')}</p>}
    {!closed && <details><summary>Guardar la fecha en mi calendario</summary><p>Agregamos la entrega como evento de día completo. La asignación y tus deseos permanecen privados.</p><div className="workshop-actions"><button className="paper-outline-button" onClick={download}>Descargar para mi calendario</button><a className="paper-text-button" href={googleCalendarURL(exchange)} target="_blank" rel="noopener noreferrer">Preparar en Google Calendar ↗</a></div></details>}
  </section>;
}
