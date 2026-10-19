"use client";
import React, { useEffect, useRef, useState } from "react";
import type { Assignment } from "@/types";
import { formatMoney as money } from "@/lib/event-dates";
import { GIFT_FIELDS } from '@/lib/gift-preferences';
import { WishPhoto } from './WishPhoto';

interface RibbonRevealProps {
  assignment: Assignment;
  exchangeName: string;
  onReveal: () => void | Promise<boolean>;
  onTogglePurchased: (wishId: string) => void | Promise<boolean>;
  onBack: () => void;
}

export function RibbonReveal({
  assignment,
  exchangeName,
  onReveal,
  onTogglePurchased,
  onBack,
}: RibbonRevealProps) {
  const [opening, setOpening] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [showReveal, setShowReveal] = useState(assignment.revealed);
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const [style, setStyle] = useState<'envelope' | 'fold'>('envelope');
  useEffect(() => { if (assignment.revealed && !opening) queueMicrotask(() => setShowReveal(true)); }, [assignment.revealed, opening]);
  useEffect(() => { queueMicrotask(() => { try { if (localStorage.getItem('papelito-reveal-style') === 'fold') setStyle('fold'); } catch {} }); }, []);
  function chooseStyle(value: 'envelope' | 'fold') { setStyle(value); try { localStorage.setItem('papelito-reveal-style', value); } catch {} }
  async function openPaper() {
    if (inFlight.current) return;
    inFlight.current = true;
    setOpening(true);
    setError("");
    try {
      if ((await onReveal()) === false) {
        setError(
          "No se pudo abrir el papelito. Revisá tu conexión e intentá de nuevo.",
        );
      } else {
        setAnimating(true);
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.reducedMotion === 'true';
        if (!reduce) await new Promise(resolve => setTimeout(resolve, 320));
        setShowReveal(true);
      }
    } catch {
      setError(
        "No pudimos confirmar la apertura. Intentá actualizar el intercambio.",
      );
    } finally {
      inFlight.current = false;
      setOpening(false);
      setAnimating(false);
    }
  }
  async function purchase(id: string, selected: boolean) {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending({ [id]: selected });
    setError("");
    try {
      if ((await onTogglePurchased(id)) === false)
        setError(
          "No se pudo guardar la marca. Conservamos su estado anterior.",
        );
    } catch {
      setError(
        "No pudimos confirmar la marca. Revisá el estado antes de repetir el cambio.",
      );
    } finally {
      inFlight.current = false;
      setPending({});
    }
  }
  return (
    <div className="paper-reveal">
      <button className="paper-back" onClick={onBack}>
        Volver al intercambio
      </button>
      {error && (
        <p className="workshop-error" role="alert">
          {error}
        </p>
      )}
      {!showReveal ? (
        <section
          className={`paper-reveal-closed reveal-${style} ${animating ? "is-opening" : ""}`}
        >
          <p>{exchangeName}</p>
          <h1>
            Hay un nombre
            <br />
            en tu papelito.
          </h1>
          <div className="reveal-choices" role="group" aria-label="Cómo abrir mi papelito"><button className="paper-text-button" disabled={opening} aria-pressed={style === 'envelope'} onClick={() => chooseStyle('envelope')}>Sobre</button><button className="paper-text-button" disabled={opening} aria-pressed={style === 'fold'} onClick={() => chooseStyle('fold')}>Papel doblado</button></div>
          <div className={`reveal-letter letter-${style}`} aria-hidden="true"><span>Un pequeño<br />gran secreto.</span><i /></div>
          <p className="paper-reveal-hint">
            Guardá el secreto.
            <br />
            Lo que viene después es sorprender.
          </p>
          <button
            className="paper-button"
            onClick={openPaper}
            disabled={opening}
          >
            {opening ? "Abriendo tu papelito…" : "Abrir mi papelito"}
          </button>
        </section>
      ) : (
        <>
          <section className="paper-name-note paper-secret-card">
            <span className="paper-name-tab">Este nombre es solo para vos</span>
            <p>Te toca sorprender a</p>
            <h1>{assignment.receiverAlias || assignment.receiverName}</h1>
            {assignment.receiverAlias !== assignment.receiverName && (
              <span className="paper-person-name">
                {assignment.receiverName}
              </span>
            )}
            <div className="paper-name-footer">
              <span>{exchangeName}</span>
              <span>
                Regalo de{" "}
                <strong>
                  {money(assignment.budgetAmount, assignment.currency)}
                </strong>
              </span>
            </div>
            <svg
              className="paper-secret-face"
              viewBox="0 0 80 70"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M12 28c8-10 16-10 24 0m8 0c8-10 16-10 24 0M34 47h12"
                stroke="currentColor"
                strokeWidth="4"
                strokeLinecap="round"
              />
            </svg>
          </section>
          <div className="paper-wish-heading">
            {assignment.receiverPreferences && GIFT_FIELDS.some(([key]) => assignment.receiverPreferences?.[key]) && <section className="receiver-tastes">
              <h2>Pistas sobre sus gustos.</h2>
              <dl>{GIFT_FIELDS.map(([key, label]) => assignment.receiverPreferences?.[key] ? <div key={key}><dt>{label}</dt><dd>{assignment.receiverPreferences[key]}</dd></div> : null)}</dl>
            </section>}
            <h2>Unas pistas para acertar.</h2>
            <p>
              Las ideas que{" "}
              {assignment.receiverAlias || assignment.receiverName} compartió
              para este intercambio.
            </p>
          </div>
          <div className="paper-wish-notes">
            {assignment.wishes.map((wish) => (
              <article
                className={`paper-wish-note ${wish.isPurchasedByGiver ? "is-chosen" : ""}`}
                key={wish.id}
              >
                <span className="paper-wish-priority">
                  {wish.priority === "alta"
                    ? "Le hace mucha ilusión"
                    : wish.priority === "media"
                      ? "Una buena idea"
                      : "Otra pista"}
                </span>
                <h3>{wish.title}</h3>
                <WishPhoto wishId={wish.id} hasPhoto={wish.hasPhoto} />
                {wish.description && <p>{wish.description}</p>}
                {typeof wish.approximatePrice === "number" && (
                  <span className="paper-wish-price">
                    Precio orientativo:{" "}
                    {money(wish.approximatePrice, wish.currency)}
                  </span>
                )}
                {wish.url && /^https?:\/\//i.test(wish.url) && (
                  <a href={wish.url} target="_blank" rel="noopener noreferrer">
                    Ver referencia
                  </a>
                )}
                <label className="paper-wish-check">
                  <input
                    type="checkbox"
                    checked={pending[wish.id] ?? !!wish.isPurchasedByGiver}
                    disabled={Object.keys(pending).length > 0}
                    onChange={(e) => void purchase(wish.id, e.target.checked)}
                  />
                  <span>
                    {wish.id in pending
                      ? "Guardando marca…"
                      : wish.isPurchasedByGiver
                        ? "Ya elegí este regalo"
                        : "Marcar como elegido"}
                  </span>
                </label>
              </article>
            ))}
            {assignment.wishes.length === 0 && (
              <p className="paper-empty">
                Todavía no hay pistas. Podés volver a revisar más adelante.
              </p>
            )}
          </div>
          <p className="paper-private-note">
            Tus marcas de regalo son privadas. La otra persona no las ve.
          </p>
        </>
      )}
    </div>
  );
}
