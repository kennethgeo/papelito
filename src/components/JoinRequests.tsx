'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';

export interface JoinRequest {
  id: string;
  alias: string;
}
export type RequestDecision = 'approved' | 'rejected';
export type DecisionResult = { ok: boolean; text: string };

interface JoinRequestsProps {
  requests: JoinRequest[];
  /** The organizer can no longer decide here: only a note from a failed attempt may remain. */
  locked: boolean;
  drawn: boolean;
  busy: boolean;
  serverError?: string | null;
  headingRef: RefObject<HTMLHeadingElement | null>;
  /** Resolves to null when another change is still being saved. */
  decide: (person: JoinRequest, status: RequestDecision) => Promise<DecisionResult | null>;
}

const SAVE_FAILED = 'No se pudo guardar la decisión. Revisá el grupo y volvé a intentar.';

/** Requests waiting on the organizer: each decision is confirmed where it was taken. */
export function JoinRequests({ requests, locked, drawn, busy, serverError, headingRef, decide }: JoinRequestsProps) {
  const [asking, setAsking] = useState<string | null>(null);
  const [note, setNote] = useState<(DecisionResult & { alias: string }) | null>(null);
  const root = useRef<HTMLElement>(null);
  const noteRef = useRef<HTMLParagraphElement>(null);
  const askTitle = useRef<HTMLHeadingElement>(null);
  const decidedOn = useRef<string | null>(null);
  const cancelledOn = useRef<string | null>(null);

  const row = (id: string) => root.current?.querySelector(`[data-request="${CSS.escape(id)}"]`);

  useEffect(() => {
    if (asking) {
      askTitle.current?.focus();
    } else if (cancelledOn.current) {
      row(cancelledOn.current)?.querySelector<HTMLButtonElement>('[data-reject]')?.focus();
      cancelledOn.current = null;
    }
  }, [asking]);

  // The row may be gone after a decision: keep focus on the list, or on the note once it empties.
  useEffect(() => {
    const id = decidedOn.current;
    if (!id || !note) return;
    decidedOn.current = null;
    const next = row(id)?.querySelector('button') ?? root.current?.querySelector('.join-request-actions button');
    (next as HTMLElement | null | undefined ?? noteRef.current)?.focus();
  }, [note]);

  async function settle(person: JoinRequest, status: RequestDecision) {
    setNote(null);
    const result = await decide(person, status);
    if (!result) return;
    setAsking(null);
    decidedOn.current = person.id;
    setNote({ ...result, alias: person.alias });
  }

  const visible = locked ? [] : requests;
  if (visible.length === 0 && !note) return null;

  const noteElement = note && (
    <p
      ref={noteRef}
      tabIndex={-1}
      className={note.ok ? 'workshop-success' : 'workshop-error'}
      role={note.ok ? 'status' : 'alert'}
    >
      {note.ok || note.text
        ? note.text
        : locked && drawn
          ? `El sorteo ya se hizo y tu decisión no se guardó: la solicitud de ${note.alias} quedó fuera del sorteo.`
          : locked
            ? `Este grupo cambió y ya no podés decidir sobre la solicitud de ${note.alias}.`
            : serverError || SAVE_FAILED}
    </p>
  );
  // The list went away while deciding: what happened stays where the person was looking.
  if (locked) return <section className="workshop-sheet join-requests" aria-label="Solicitudes" ref={root}>{noteElement}</section>;

  return (
    <section className="workshop-sheet join-requests" aria-labelledby="join-requests-title" ref={root}>
      <p className="workshop-step">Están tocando la puerta</p>
      <div className="section-heading">
        <h2 id="join-requests-title" tabIndex={-1} ref={headingRef} data-view-focus>Solicitudes por revisar</h2>
        <span className="count-stamp">{visible.length}</span>
      </div>
      {noteElement}
      {visible.length === 0 && <p className="field-help">No quedan solicitudes por revisar.</p>}
      {visible.map((person) => (
        <div key={person.id} className="join-request" data-request={person.id}>
          <strong>{person.alias}</strong>
          {asking === person.id ? (
            <div className="confirmation-note" role="group" aria-labelledby={`reject-title-${person.id}`}>
              <h3 id={`reject-title-${person.id}`} tabIndex={-1} ref={askTitle}>¿Rechazar a {person.alias}?</h3>
              <p>
                No va a poder entrar con este enlace. Si tiene personas a cargo en este intercambio, también salen.
                Podés volver a aprobar a {person.alias} desde «Solicitudes rechazadas» antes del sorteo.
              </p>
              <div className="workshop-actions">
                <button
                  className="paper-button"
                  disabled={busy}
                  aria-busy={busy}
                  onClick={() => void settle(person, 'rejected')}
                >
                  Sí, rechazar
                </button>
                <button
                  className="paper-text-button"
                  disabled={busy}
                  onClick={() => {
                    cancelledOn.current = person.id;
                    setAsking(null);
                  }}
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className="join-request-actions">
              <button
                className="paper-button"
                disabled={busy}
                aria-label={`Aprobar a ${person.alias}`}
                onClick={() => void settle(person, 'approved')}
              >
                Aprobar
              </button>
              <button
                className="paper-outline-button"
                data-reject
                disabled={busy}
                aria-label={`Rechazar a ${person.alias}`}
                onClick={() => {
                  setNote(null);
                  setAsking(person.id);
                }}
              >
                Rechazar
              </button>
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
