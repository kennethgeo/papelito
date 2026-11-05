import type { ExchangeStatus } from '@/types';

/** Mirrors manageMemberStatus, which has the final word; test-dashboard keeps them in step. */
const REQUESTS_LOCKED: ExchangeStatus[] = ['sorteado', 'finalizado', 'cancelado'];

export function canManageRequests(status: ExchangeStatus) {
  return !REQUESTS_LOCKED.includes(status);
}

/**
 * A group keeps the «inscripción abierta» status after its deadline passes, but
 * invitations stop working the day after. `today` is a Costa Rica calendar date.
 */
export function registrationExpired(status: ExchangeStatus, deadline: string, today: string) {
  return status === 'inscripcion_abierta' && today > deadline;
}
