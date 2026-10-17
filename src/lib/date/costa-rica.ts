/**
 * Utilidades de fecha en zona horaria oficial de Costa Rica (America/Costa_Rica, UTC-6).
 * Evita cierres anticipados de 6 horas que ocurrirían al usar UTC (toISOString).
 */

export const COSTA_RICA_TIMEZONE = 'America/Costa_Rica';

export function getCostaRicaTodayDate(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: COSTA_RICA_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);

  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;

  if (!year || !month || !day) {
    // Fallback manual UTC-6 (Costa Rica no observa horario de verano)
    const crTime = new Date(now.getTime() - 6 * 60 * 60 * 1000);
    return crTime.toISOString().split('T')[0];
  }

  return `${year}-${month}-${day}`;
}
