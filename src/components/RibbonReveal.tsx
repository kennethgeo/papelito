"use client";
import React, { useRef, useState } from "react";
import type { Assignment } from "@/types";
import { PaperIllustration } from "./PaperIllustration";
import { formatMoney as money } from "@/lib/event-dates";

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
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  async function openPaper() {
    if (inFlight.current) return;
    inFlight.current = true;
    setOpening(true);
    setError("");
    try {
      if ((await onReveal()) === false)
        setError(
          "No se pudo abrir el papelito. Revisá tu conexión e intentá de nuevo.",
        );
    } catch {
      setError(
        "No pudimos confirmar la apertura. Intentá actualizar el intercambio.",
      );
    } finally {
      inFlight.current = false;
      setOpening(false);
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
      {!assignment.revealed ? (
        <section
          className={`paper-reveal-closed ${opening ? "is-opening" : ""}`}
        >
          <p>{exchangeName}</p>
          <h1>
            Hay un nombre
            <br />
            en tu papelito.
          </h1>
          <PaperIllustration />
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
          <section className="paper-name-note">
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
