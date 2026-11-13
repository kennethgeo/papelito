"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { callServerAction, callServerRead } from "@/lib/client-actions";
import { openPersonalPapelitoAction, previewPersonalPapelitoAction } from "@/lib/data/personal-link-actions";
import { formatTimestamp } from "@/lib/date/timestamps";
import { formatEventDate, formatMoney } from "@/lib/event-dates";
import type { PersonalLinkPreview, PersonalPapelito as Papelito } from "@/lib/repositories/personal-links";

const TOKEN = /^[0-9a-f]{64}$/;
const TASTES = [
  ["interests", "Gustos y pasatiempos"],
  ["colors", "Colores y estilos"],
  ["sizes", "Tallas"],
  ["avoid", "Prefiere no recibir"],
] as const;

type View =
  | { phase: "loading" }
  | { phase: "missing" }
  | { phase: "error" }
  | { phase: "ready"; token: string; preview: PersonalLinkPreview };

/** The link's secret lives in the URL fragment: the browser never sends it in a URL. */
function readToken() {
  const raw = window.location.hash.replace(/^#/, "");
  return TOKEN.test(raw) ? raw : null;
}

/** Photo of a wish, requested with the secret in the POST body and shown from memory. */
function WishPhotoByLink({ token, wishId, title }: { token: string; wishId: string; title: string }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let active = true;
    let url = "";
    void fetch("/api/papelito/fotos", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, wishId }),
      cache: "no-store",
      referrerPolicy: "no-referrer",
    })
      .then((response) => (response.ok ? response.blob() : null))
      .then((blob) => {
        if (!blob || !active) return;
        url = URL.createObjectURL(blob);
        setSrc(url);
      })
      .catch(() => undefined);
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [token, wishId]);
  if (!src) return null;
  // eslint-disable-next-line @next/next/no-img-element -- private photo held in memory, never a public URL
  return <img src={src} alt={`Referencia de ${title}`} />;
}

function Facts({ preview }: { preview: Extract<PersonalLinkPreview, { eventDate: string }> }) {
  return (
    <dl className="event-facts">
      <div><dt>Entrega</dt><dd>{formatEventDate(preview.eventDate)}</dd></div>
      <div><dt>Por regalo</dt><dd>{formatMoney(preview.budgetAmount, preview.currency)}</dd></div>
    </dl>
  );
}

/**
 * Personal papelito for someone without an account (for example, an older
 * adult). Opening is an explicit tap: it records the time, and the page shows
 * when the papelito was first opened, so an opening by someone else is visible.
 */
export function PersonalPapelito() {
  const [view, setView] = useState<View>({ phase: "loading" });
  const [papelito, setPapelito] = useState<Papelito | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);

  const check = useCallback(async () => {
    const token = readToken();
    setPapelito(null);
    setError("");
    if (!token) { setView({ phase: "missing" }); return; }
    setView({ phase: "loading" });
    const result = await callServerRead(() => previewPersonalPapelitoAction(token), "tu enlace");
    setView(result.success && result.data ? { phase: "ready", token, preview: result.data } : { phase: "error" });
  }, []);

  useEffect(() => {
    queueMicrotask(() => void check());
    const onHashChange = () => void check();
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [check]);

  async function open(token: string) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await callServerAction(() => openPersonalPapelitoAction(token));
      if (!result.success || !result.data) { setError("No pudimos abrir tu papelito. Revisá la conexión y probá de nuevo."); return; }
      // The state may have changed since the page loaded (new link, new draw).
      setView({ phase: "ready", token, preview: result.data.preview });
      setPapelito(result.data.papelito);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  if (view.phase === "loading") return <p className="paper-loading" role="status">Abriendo tu papelito…</p>;
  if (view.phase === "missing") {
    return (
      <div className="join-body">
        <h1>Abrí el enlace completo</h1>
        <p>Para ver tu papelito, tocá el enlace que te enviaron. Si llegó cortado, pedile a la persona que te inscribió que te lo envíe de nuevo.</p>
      </div>
    );
  }
  if (view.phase === "error") {
    return (
      <div className="join-body" role="alert">
        <h1>No pudimos revisar este enlace.</h1>
        <p>Puede ser la conexión o un problema pasajero. Tu papelito sigue guardado.</p>
        <button className="paper-button" type="button" onClick={() => void check()}>Intentar de nuevo</button>
      </div>
    );
  }

  const { preview, token } = view;
  if (preview.state === "invalid") {
    return (
      <div className="join-body">
        <h1>Enlace no disponible</h1>
        <p>Este enlace ya no funciona. Pedile a la persona que te inscribió que te envíe uno nuevo.</p>
      </div>
    );
  }
  if (preview.state === "closed") {
    return (
      <div className="join-body">
        <p className="workshop-step">{preview.exchangeName}</p>
        <h1>Este intercambio ya terminó.</h1>
        <p>Gracias por participar, {preview.alias}.</p>
      </div>
    );
  }
  if (preview.state === "waiting") {
    return (
      <div className="join-body">
        <p className="workshop-step">{preview.exchangeName}</p>
        <h1>Hola, {preview.alias}.</h1>
        <p>
          {preview.reason === "approval"
            ? "Todavía falta que quien organiza confirme tu lugar."
            : "Todavía no se hizo el sorteo."}{" "}
          Cuando esté listo, abrí este mismo enlace para ver a quién le regalás.
        </p>
        <Facts preview={preview} />
        <p className="field-help">Guardá el mensaje con este enlace: es para vos y sirve en cualquier teléfono.</p>
        <button className="paper-outline-button" type="button" onClick={() => void check()}>Revisar de nuevo</button>
      </div>
    );
  }

  const tastes = papelito ? TASTES.filter(([key]) => papelito.preferences[key]) : [];
  const firstOpened = papelito ? formatTimestamp(papelito.firstOpenedAt, { dateStyle: "long", timeStyle: "short" }) : "";
  return (
    <div className="join-body">
      <p className="workshop-step">{preview.exchangeName}</p>
      <h1>Hola, {preview.alias}.</h1>
      {!papelito ? (
        <>
          <p>Tu papelito está listo. Tocá el botón para ver a quién le regalás.</p>
          <Facts preview={preview} />
          <div className="personal-open">
            <button className="paper-button" type="button" onClick={() => void open(token)} disabled={busy}>
              {busy ? "Abriendo…" : "Abrir mi papelito"}
            </button>
            <p className="field-help">Abrilo cuando nadie más esté mirando la pantalla.</p>
            {error && <p className="workshop-error" role="alert">{error}</p>}
          </div>
        </>
      ) : (
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
              <p>Todavía no compartió ideas. Podés guiarte por sus gustos o preguntarle a quien organiza.</p>
            ) : (
              <ul className="personal-wishes">
                {papelito.wishes.map((wish) => (
                  <li key={wish.id}>
                    <strong>{wish.title}</strong>
                    {wish.description && <p>{wish.description}</p>}
                    {wish.hasPhoto && <WishPhotoByLink token={token} wishId={wish.id} title={wish.title} />}
                    {wish.url && <a href={wish.url} target="_blank" rel="noopener noreferrer">Ver referencia en la tienda</a>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <p className="personal-trace" role="note">
            {papelito.firstTimeNow
              ? "Es la primera vez que se abre este papelito."
              : `Este papelito se abrió por primera vez el ${firstOpened || "un día anterior"}. Si no fuiste vos, otra persona lo abrió antes: contale a quien organiza.`}
          </p>
          <div className="workshop-actions">
            <button className="paper-outline-button" type="button" onClick={() => setPapelito(null)}>Ocultar mi papelito</button>
          </div>
          <p className="field-help">Guardá el mensaje con este enlace: podés volver a abrirlo cuando quieras, desde cualquier teléfono.</p>
        </section>
      )}
    </div>
  );
}
