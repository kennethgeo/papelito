'use client';

import React, { useMemo, useState, useSyncExternalStore } from 'react';
import { useOptionalDemoData } from '@/context/DemoDataContext';
import { useOptionalRealData } from '@/context/RealDataContext';
import { buildDashboard, type DashboardItem } from '@/lib/dashboard/next-action';
import { getCostaRicaTodayDate } from '@/lib/date/costa-rica';
import { PaperIllustration } from '@/components/PaperIllustration';
import { InstallGuide } from '@/components/InstallGuide';

type RoleFilter = 'todos' | 'organizo' | 'invitaron';

const SHORT_SCREEN = '(max-height: 700px)';
function subscribeToShortScreen(onChange: () => void) {
  const query = window.matchMedia(SHORT_SCREEN);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

function dateParts(value: string) {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return { day: '—', month: '', full: value };
  return {
    day: date.getDate(),
    month: date.toLocaleDateString('es-CR', { month: 'short' }).replace('.', ''),
    full: date.toLocaleDateString('es-CR', { day: 'numeric', month: 'long', year: 'numeric' }),
  };
}

function ExchangeCard({ item, onOpen }: { item: DashboardItem; onOpen: () => void }) {
  const { exchange, action } = item;
  const date = dateParts(exchange.eventDate);
  const count = exchange.participantCount ?? exchange.participants.length;
  const people = `${count} ${count === 1 ? 'persona' : 'personas'}`;
  const role = exchange.isCurrentUserOrganizer ? 'Organizás' : `Te invitó ${exchange.organizerName}`;
  const unopened = action.kind === 'open_paper';
  return (
    <button
      className={`paper-invitation paper-invitation--${exchange.selectedTheme}${unopened ? ' paper-invitation--unopened' : ''}`}
      aria-label={`${exchange.name}. Entrega el ${date.full}. ${role}, ${people}. ${[action.text, action.due].filter(Boolean).join('. ')}.`}
      onClick={onOpen}
    >
      <span className="paper-date-stamp" aria-hidden="true"><strong>{date.day}</strong><span>{date.month}</span></span>
      <span className="paper-invitation-body">
        <strong>{exchange.name}</strong>
        <span className="paper-invitation-meta">{role} · {people}</span>
        <span className={`paper-invitation-action${action.isTask ? ' is-task' : ''}${action.urgent ? ' is-urgent' : ''}`}>
          {action.text}{action.due ? ` · ${action.due}` : ''}
        </span>
      </span>
      <svg className="paper-invitation-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg>
    </button>
  );
}

export function PaperDashboard() {
  const real = useOptionalRealData();
  const demo = useOptionalDemoData();
  const exchanges = useMemo(() => (real ? real.exchanges : demo?.exchanges) ?? [], [real, demo?.exchanges]);
  const navigate = real ? real.navigateTo : demo?.navigateTo;
  const alias = real ? real.user?.alias : demo?.userProfile.alias;
  const [role, setRole] = useState<RoleFilter>('todos');
  const [allTasks, setAllTasks] = useState(false);
  const shortScreen = useSyncExternalStore(subscribeToShortScreen, () => window.matchMedia(SHORT_SCREEN).matches, () => false);
  const today = getCostaRicaTodayDate();
  const board = useMemo(() => buildDashboard(exchanges, today), [exchanges, today]);

  const { envelope, tasks, active, archive, pendingCount, showRoleFilter } = board;
  // The envelope counts as the first pending item, so the first screen always holds the list too.
  const taskRoom = (shortScreen ? 1 : 3) - (envelope ? 1 : 0);
  const shownTasks = allTasks ? tasks : tasks.slice(0, taskRoom);
  const hiddenTasks = tasks.length - shownTasks.length;
  const filterRole = showRoleFilter ? role : 'todos';
  const listed = active.filter((item) =>
    filterRole === 'todos' || (filterRole === 'organizo') === item.exchange.isCurrentUserOrganizer);
  const greeting = alias?.split(' ')[0];
  const pendingWords = pendingCount === 0 ? 'Todo al día.' : pendingCount === 1 ? '1 pendiente.' : `${pendingCount} pendientes.`;

  function openTask(item: DashboardItem) {
    if (item.action.kind === 'open_paper') navigate?.('asignacion_revelar', item.exchange.id);
    else if (item.action.kind === 'add_wishes') navigate?.('deseos_lista');
    else navigate?.('intercambio_detalle', item.exchange.id);
  }

  return (
    <div className="paper-dashboard">
      <div className="paper-page-heading">
        <div>
          <p className="paper-greeting">{greeting ? `Hola, ${greeting}. ` : ''}{exchanges.length > 0 ? pendingWords : ''}</p>
          <h1>Mis intercambios</h1>
        </div>
        <button className="paper-button paper-button--create" onClick={() => navigate?.('intercambio_crear')}><span aria-hidden="true">+</span> Crear intercambio</button>
      </div>

      {exchanges.length === 0 ? (
        <div className="paper-empty">
          <h2>Aquí cabe una nueva celebración.</h2>
          <p>Reuní a tu gente y dejá que la sorpresa empiece.</p>
          <button className="paper-button" onClick={() => navigate?.('intercambio_crear')}>Crear mi primer intercambio</button>
        </div>
      ) : (
        <div className="paper-board">
          <div className="paper-board-now">
            {envelope && (
              <section className="paper-envelope" aria-label="Tu papelito sin abrir">
                <div className="paper-envelope-art"><PaperIllustration theme={envelope.selectedTheme} /></div>
                <div className="paper-envelope-body">
                  <div className="paper-envelope-text">
                    <p>Tu papelito sin abrir</p>
                    <h2>{envelope.name}</h2>
                  </div>
                  <div className="paper-envelope-actions">
                    <button className="paper-button" onClick={() => navigate?.('asignacion_revelar', envelope.id)}>Abrir mi papelito</button>
                    <button className="paper-text-button" onClick={() => navigate?.('intercambio_detalle', envelope.id)}>Ver intercambio</button>
                  </div>
                </div>
              </section>
            )}
            {tasks.length > 0 && (
              <section className="paper-tasks" aria-labelledby="board-tasks">
                <div className="paper-tasks-heading">
                  <h2 id="board-tasks">Por hacer</h2>
                  {(hiddenTasks > 0 || allTasks) && (
                    <button className="paper-text-button" aria-expanded={allTasks} onClick={() => setAllTasks(!allTasks)}>
                      {allTasks ? 'Ver menos' : `Ver ${hiddenTasks} más`}
                    </button>
                  )}
                </div>
                {shownTasks.length > 0 && <ul>
                  {shownTasks.map((item, index) => (
                    <li key={item.exchange.id}>
                      <button className={`paper-task${!envelope && index === 0 ? ' paper-task--first' : ''}`} onClick={() => openTask(item)}>
                        <span className="paper-task-body">
                          <strong>{item.action.text}</strong>
                          <span>
                            {item.exchange.name}
                            {item.action.due && <> · <span className={item.action.urgent ? 'is-urgent' : undefined}>{item.action.due}</span></>}
                          </span>
                        </span>
                        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg>
                      </button>
                    </li>
                  ))}
                </ul>}
              </section>
            )}
          </div>

          <section className="paper-exchanges" aria-labelledby="my-exchanges">
            <div className="paper-list-heading">
              <h2 id="my-exchanges">En marcha <span>{active.length}</span></h2>
              {showRoleFilter && (
                <div className="paper-filters" role="group" aria-label="Filtrar intercambios">
                  {([['todos', 'Todos'], ['organizo', 'Organizo'], ['invitaron', 'Me invitaron']] as const).map(([key, label]) => (
                    <button key={key} aria-pressed={filterRole === key} onClick={() => setRole(key)}>{label}</button>
                  ))}
                </div>
              )}
            </div>
            <div className="paper-invitation-list">
              {listed.map((item) => <ExchangeCard key={item.exchange.id} item={item} onOpen={() => navigate?.('intercambio_detalle', item.exchange.id)} />)}
              {active.length === 0 && <p className="paper-empty-note">No tenés grupos en marcha. Podés crear uno cuando quieras.</p>}
            </div>
            {archive.length > 0 && (
              <details className="paper-archive">
                <summary>Terminados ({archive.length})</summary>
                <div className="paper-invitation-list">
                  {archive.map((item) => <ExchangeCard key={item.exchange.id} item={item} onOpen={() => navigate?.('intercambio_detalle', item.exchange.id)} />)}
                </div>
              </details>
            )}
          </section>
        </div>
      )}
      {/* Secondary: installing helps, but never before the person's own groups. */}
      <div className="paper-dashboard-install"><InstallGuide compact /></div>
      <p className="paper-closing-note">Hecho para regalar con ganas.</p>
    </div>
  );
}
