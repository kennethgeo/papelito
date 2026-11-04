import { daysUntil } from '@/lib/calendar';
import type { Exchange } from '@/types';

export type NextActionKind =
  | 'open_paper'
  | 'review_requests'
  | 'invite'
  | 'review_draw'
  | 'review_expired'
  | 'add_wishes'
  | 'close_group'
  | 'none';

export interface NextAction {
  kind: NextActionKind;
  /** The task, or the group's state in words when there is nothing to do. */
  text: string;
  /** When it is due, in words. Empty when no date adds anything. */
  due: string;
  isTask: boolean;
  urgent: boolean;
}

export interface DashboardItem {
  exchange: Exchange;
  action: NextAction;
  /** Next date that matters to this person; drives the order of the board. */
  dueDate: string;
}

export interface Dashboard {
  /** Soonest own, current and unopened paper. */
  envelope: Exchange | null;
  tasks: DashboardItem[];
  active: DashboardItem[];
  archive: DashboardItem[];
  /** Envelope included: opening a paper is pending work too. */
  pendingCount: number;
  showRoleFilter: boolean;
}

/** Days ahead of the deadline at which a group with enough people is worth reviewing. */
const REVIEW_DRAW_WINDOW_DAYS = 7;
/** The draw itself never runs with fewer than three people. */
const DRAW_MINIMUM = 3;

const CLOSED = ['finalizado', 'cancelado'];

function shortDate(value: string) {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('es-CR', { day: 'numeric', month: 'short' }).replace('.', '');
}

function people(count: number) {
  return count === 1 ? 'falta 1 persona' : `faltan ${count} personas`;
}

function deadlineWords(deadline: string, today: string) {
  const days = daysUntil(deadline, today);
  if (days === null) return '';
  if (days < 0) return `Venció el ${shortDate(deadline)}`;
  if (days === 0) return 'Cierra hoy';
  if (days === 1) return 'Cierra mañana';
  return `Cierra el ${shortDate(deadline)}`;
}

function task(kind: NextActionKind, text: string, due: string, urgent: boolean): NextAction {
  return { kind, text, due, urgent, isTask: true };
}

function state(text: string, due = ''): NextAction {
  return { kind: 'none', text, due, urgent: false, isTask: false };
}

/**
 * The one thing this person should do next in this group, from its current state
 * and their role. An organizer also takes part, so both jobs share one order.
 * `today` is a Costa Rica calendar date.
 */
export function nextAction(exchange: Exchange, today: string): NextAction {
  const member = exchange.currentUserMemberStatus ?? 'approved';
  if (exchange.status === 'cancelado') return state('Cancelado');
  if (exchange.status === 'finalizado') return state('Celebrado');
  if (member === 'pending') return state('Esperando aprobación');
  if (member === 'rejected') return state('Solicitud no aprobada');

  const owner = exchange.isCurrentUserOrganizer;
  const pending = owner ? (exchange.pendingRequestCount ?? 0) : 0;
  const hasWishes = (exchange.myWishCount ?? 0) > 0;
  const eventDays = daysUntil(exchange.eventDate, today);
  const addWishes = task('add_wishes', 'Agregar mis deseos', `Entrega el ${shortDate(exchange.eventDate)}`, false);

  if (exchange.status === 'sorteado') {
    const paper = exchange.ownPaperState ?? 'sin_asignacion';
    if (paper === 'sin_abrir') return task('open_paper', 'Abrir mi papelito', `Entrega el ${shortDate(exchange.eventDate)}`, false);
    if (eventDays !== null && eventDays < 0) {
      return owner
        ? task('close_group', 'Finalizar intercambio', `La entrega fue el ${shortDate(exchange.eventDate)}`, false)
        : state('Entrega realizada');
    }
    if (pending > 0) return task('review_requests', requestsText(pending), '', false);
    if (paper === 'abierto' && !hasWishes) return addWishes;
    return state(paper === 'abierto' ? 'Papelito abierto' : 'Sin papelito en este sorteo');
  }

  if (exchange.status === 'inscripcion_abierta') {
    const deadlineDays = daysUntil(exchange.registrationDeadline, today);
    const expired = deadlineDays !== null && deadlineDays < 0;
    const closes = deadlineWords(exchange.registrationDeadline, today);
    const soon = deadlineDays !== null && deadlineDays <= 1;
    if (owner) {
      const required = Math.max(DRAW_MINIMUM, exchange.minParticipants);
      const missing = required - (exchange.participantCount ?? exchange.participants.length);
      if (pending > 0) return task('review_requests', requestsText(pending), closes, soon);
      if (missing > 0) {
        return expired
          ? task('review_expired', 'Revisar inscripción vencida', closes, true)
          : task('invite', `Invitar: ${people(missing)}`, closes, soon);
      }
      if (deadlineDays !== null && deadlineDays <= REVIEW_DRAW_WINDOW_DAYS) {
        return task('review_draw', 'Revisar sorteo', closes, soon);
      }
    }
    if (!hasWishes) return addWishes;
    if (owner) return state('Inscripción abierta', closes);
    return state(expired ? 'Inscripción vencida' : 'Esperando el sorteo', expired ? '' : closes);
  }

  if (exchange.status === 'inscripcion_cerrada') return state('Inscripción cerrada');
  return state('En preparación');
}

function requestsText(count: number) {
  return count === 1 ? 'Revisar 1 solicitud' : `Revisar ${count} solicitudes`;
}

function dueDateFor(exchange: Exchange, today: string) {
  if (exchange.status === 'inscripcion_abierta') {
    const stillOpen = (daysUntil(exchange.registrationDeadline, today) ?? 0) >= 0;
    if (stillOpen || exchange.isCurrentUserOrganizer) return exchange.registrationDeadline;
  }
  return exchange.eventDate;
}

function byDue(today: string) {
  // Past dates nobody has to act on go last; overdue tasks come first.
  const stale = (item: DashboardItem) => !item.action.isTask && item.dueDate < today;
  return (a: DashboardItem, b: DashboardItem) =>
    Number(stale(a)) - Number(stale(b)) ||
    a.dueDate.localeCompare(b.dueDate) ||
    a.exchange.name.localeCompare(b.exchange.name, 'es');
}

export function buildDashboard(exchanges: Exchange[], today: string): Dashboard {
  const items = exchanges.map((exchange): DashboardItem => {
    return { exchange, action: nextAction(exchange, today), dueDate: dueDateFor(exchange, today) };
  });
  const archived = (item: DashboardItem) =>
    CLOSED.includes(item.exchange.status) || item.exchange.currentUserMemberStatus === 'rejected';
  const active = items.filter((item) => !archived(item)).sort(byDue(today));
  const envelope = active
    .filter((item) => item.action.kind === 'open_paper')
    .sort((a, b) => a.exchange.eventDate.localeCompare(b.exchange.eventDate))[0]?.exchange ?? null;
  const tasks = active.filter((item) => item.action.isTask && item.exchange.id !== envelope?.id);
  const organized = active.filter((item) => item.exchange.isCurrentUserOrganizer).length;
  return {
    envelope,
    tasks,
    active,
    archive: items.filter(archived),
    pendingCount: tasks.length + (envelope ? 1 : 0),
    showRoleFilter: organized > 0 && organized < active.length,
  };
}
