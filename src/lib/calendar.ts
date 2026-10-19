import { addCalendarDays, isCalendarDate } from './event-dates';
export function daysUntil(date: string, today: string) {
  if (!isCalendarDate(date) || !isCalendarDate(today)) return null;
  return Math.round((Date.parse(date + 'T12:00:00Z') - Date.parse(today + 'T12:00:00Z')) / 86400000);
}
export function countdownText(date: string, today: string, label: 'entrega' | 'inscripción') {
  const days = daysUntil(date, today);
  if (days === null) return 'Fecha por confirmar';
  if (days < 0) return label === 'entrega' ? 'La fecha de entrega ya pasó' : 'La inscripción ya cerró';
  if (days === 0) return label === 'entrega' ? '¡La entrega es hoy!' : 'La inscripción cierra hoy';
  if (days === 1) return label === 'entrega' ? '¡La entrega es mañana!' : 'La inscripción cierra mañana';
  return label === 'entrega' ? `Faltan ${days} días para regalar` : `Inscripción: quedan ${days} días`;
}
function escapeICS(value: string) { return value.replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,'); }
export function calendarICS(event: { id: string; name: string; eventDate: string }, now = new Date()) {
  if (!isCalendarDate(event.eventDate)) throw new Error('Fecha inválida');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Papelito Costa Rica//ES', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
    `UID:${event.id.replace(/[^a-zA-Z0-9-]/g, '')}@papelito`, `DTSTAMP:${now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`,
    `DTSTART;VALUE=DATE:${event.eventDate.replaceAll('-', '')}`, `DTEND;VALUE=DATE:${addCalendarDays(event.eventDate, 1).replaceAll('-', '')}`,
    `SUMMARY:${escapeICS(event.name)}`, 'DESCRIPTION:Entrega de regalos. Consultá los detalles en Papelito.', 'END:VEVENT', 'END:VCALENDAR'];
  // Fold by UTF-8 bytes; an accented name must remain valid in calendar clients.
  return lines.map(line => { let out = '', count = 0; for (const c of line) { const size = new TextEncoder().encode(c).length; if (count + size > 73) { out += '\r\n '; count = 1; } out += c; count += size; } return out; }).join('\r\n') + '\r\n';
}
export function googleCalendarURL(event: { name: string; eventDate: string }) {
  const q = new URLSearchParams({ action: 'TEMPLATE', text: event.name, dates: `${event.eventDate.replaceAll('-', '')}/${addCalendarDays(event.eventDate, 1).replaceAll('-', '')}`, ctz: 'America/Costa_Rica', details: 'Entrega de regalos. Consultá los detalles en Papelito.' });
  return `https://calendar.google.com/calendar/render?${q}`;
}
