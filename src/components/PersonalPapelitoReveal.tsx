"use client";
import { useRef, useState } from "react";
import { callServerAction } from "@/lib/client-actions";
import { openPersonalPapelitoAction } from "@/lib/data/personal-link-actions";
import { formatTimestamp } from "@/lib/date/timestamps";
import { formatMoney } from "@/lib/event-dates";
import type { PersonalPapelito } from "@/lib/repositories/personal-links";

const TASTES = [
  ["interests", "Gustos y pasatiempos"],
  ["colors", "Colores y estilos"],
  ["sizes", "Tallas"],
  ["avoid", "Prefiere no recibir"],
] as const;

/**
 * «Abrir mi papelito» for a person without an account (older adult). Opening
 * is an explicit tap: it records the time, and the page shows when the
 * papelito was first opened so an opening by someone else leaves a trace.
 */
export function PersonalPapelitoReveal({ token }: { token: string }) {
  const [papelito, setPapelito] = useState<PersonalPapelito | null>(null);
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);

  async function open() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await callServerAction(() => openPersonalPapelitoAction(token));
      if (!result.success) { setError(result.error || "No pudimos abrir tu papelito. Probá de nuevo."); return; }
      if (!result.data?.papelito) { setError("Tu papelito todavía no está listo. Volvé a abrir este enlace más tarde."); return; }
      setPapelito(result.data.papelito);
      setHidden(false);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  if (!papelito || hidden) {
    return (
      <div className="personal-open">
        <button className="paper-button" type="button" onClick={() => void open()} disabled={busy}>
          {busy ? "Abriendo…" : "Abrir mi papelito"}
        </button>
        <p className="field-help">Abrilo cuando nadie más esté mirando la pantalla.</p>
        {error && <p className="workshop-error" role="alert">{error}</p>}
      </div>
    );
  }

  const tastes = TASTES.filter(([key]) => papelito.preferences[key]);
  const firstOpened = formatTimestamp(papelito.firstOpenedAt, { dateStyle: "long", timeStyle: "short" });
  return (
    <section className="personal-result" aria-live="polite">
      <p className="personal-label">Le regalás a</p>
      <h2 className="personal-receiver">{papelito.receiverAlias}</h2>
      {papelito.receiverName && papelito.receiverName !== papelito.receiverAlias && <p className="personal-receiver-name">{papelito.receiverName}</p>}
      <p>Presupuesto acordado: <strong>{formatMoney(papelito.budgetAmount, papelito.currency)}</strong></p>
      {papelito.drawNotice && <p className="confirmation-note">Aviso del sorteo: {papelito.drawNotice}</p>}

      {tastes.length > 0 && (
        <section className="personal-section">
          <h3>Sus gustos</h3>
          <dl>{tastes.map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{papelito.preferences[key]}</dd></div>)}</dl>
        </section>
      )}

      <section className="personal-section">
        <h3>Sus ideas de regalo</h3>
        {papelito.wishes.length === 0 ? (
          <p>Todavía no compartió ideas. Podés guiarte por sus gustos o preguntarle a quien te inscribió.</p>
        ) : (
          <ul className="personal-wishes">
            {papelito.wishes.map((wish) => (
              <li key={wish.id}>
                <strong>{wish.title}</strong>
                {wish.description && <p>{wish.description}</p>}
                {wish.hasPhoto && (
                  // eslint-disable-next-line @next/next/no-img-element -- private, uncached photo served per link
                  <img src={`/api/papelito/${encodeURIComponent(token)}/fotos/${wish.id}`} alt={`Referencia de ${wish.title}`} loading="lazy" />
                )}
                {wish.url && <a href={wish.url} target="_blank" rel="noopener noreferrer">Ver referencia en la tienda</a>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="personal-trace" role="note">
        {papelito.firstTimeNow
          ? "Es la primera vez que se abre este papelito."
          : `Este papelito se abrió por primera vez el ${firstOpened || "un día anterior"}. Si no fuiste vos, alguien más lo vio antes: contale a quien te inscribió.`}
      </p>
      <div className="workshop-actions">
        <button className="paper-outline-button" type="button" onClick={() => setHidden(true)}>Ocultar mi papelito</button>
      </div>
      <p className="field-help">Guardá este enlace: podés volver a abrirlo cuando quieras, desde cualquier teléfono.</p>
    </section>
  );
}
