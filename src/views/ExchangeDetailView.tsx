"use client";

import { useRef, useState } from "react";
import { useOptionalDemoData } from "@/context/DemoDataContext";
import { useOptionalRealData } from "@/context/RealDataContext";
import { THEME_CONFIG } from "@/lib/theme";
import { formatEventDate, formatMoney } from "@/lib/event-dates";
import type { ThemeKey } from "@/types";
import { ExchangeLifecycleControls } from "@/components/ExchangeLifecycleControls";
import { PaperIllustration } from "@/components/PaperIllustration";
import { AnonymousMessages } from '@/components/AnonymousMessages';
import { InvitationQR } from '@/components/InvitationQR';
import { RepeatExchange } from '@/components/RepeatExchange';

export function ExchangeDetailView() {
  const real = useOptionalRealData();
  const demo = useOptionalDemoData();
  const exchange = real ? real.currentExchange : demo?.currentExchange;
  const navigate = real?.navigateTo ?? demo?.navigateTo;
  const [busy, setBusy] = useState("");
  const lock = useRef(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [copyFallback, setCopyFallback] = useState("");
  const [shareUrl, setShareUrl] = useState("");
  const [renew, setRenew] = useState(false);
  const [confirmDraw, setConfirmDraw] = useState(false);
  const [reason, setReason] = useState("");
  const [giver, setGiver] = useState("");
  const [receiver, setReceiver] = useState("");
  const [mutual, setMutual] = useState(true);
  const [demoRules, setDemoRules] = useState<
    Array<{ giverId: string; receiverId: string }>
  >([]);

  async function run(
    key: string,
    action: () => Promise<boolean>,
    success = "",
  ) {
    if (lock.current) return false;
    lock.current = true;
    setBusy(key);
    setError("");
    setMessage("");
    try {
      const ok = await action();
      if (ok) setMessage(success);
      else
        setError(
          (previous) =>
            previous ||
            "No se pudo guardar el cambio. Revisá el aviso y volvé a intentar.",
        );
      return ok;
    } catch {
      setError(
        "Se interrumpió la conexión. Revisá el estado antes de repetir el cambio.",
      );
      return false;
    } finally {
      lock.current = false;
      setBusy("");
    }
  }

  if (!exchange)
    return (
      <div className="workshop-page compact-page">
        <div className="workshop-sheet">
          <p role="status">
            {real?.isRefreshing
              ? "Abriendo tu intercambio…"
              : "Este intercambio no está disponible para tu cuenta."}
          </p>
          <button
            className="paper-button"
            onClick={() => navigate?.("intercambios_lista")}
          >
            Volver a mis intercambios
          </button>
          {real && (
            <button
              className="paper-text-button"
              disabled={real.isRefreshing}
              onClick={() => void real.refreshNow()}
            >
              Intentar de nuevo
            </button>
          )}
        </div>
      </div>
    );

  const ex = exchange;
  const approved = ex.participants.filter(
    (p) => (p.status ?? "approved") === "approved",
  );
  const pending = ex.participants.filter((p) => p.status === "pending");
  const missing = approved.filter((p) => !p.wishCount);
  const closed = ["finalizado", "cancelado"].includes(ex.status);
  const canEnter = (ex.currentUserMemberStatus ?? "approved") === "approved";
  const owner = ex.isCurrentUserOrganizer;
  const canInvite = owner && canEnter && ex.status === "inscripcion_abierta";
  const shareUnavailable = !!real && !ex.inviteCode;
  const rules = real ? (ex.exclusions ?? []) : demoRules;
  const enough = approved.length >= ex.minParticipants;
  const drawn = ex.status === "sorteado";
  const repeated = (ex.currentDrawVersion ?? 0) > 0;
  const alias = (id: string) =>
    ex.participants.find((p) => p.id === id)?.alias ?? "Participante";
  const invitationUrl = () =>
    `${window.location.origin}/unirse/${ex.inviteCode}`;

  async function copyInvite() {
    if (!real) {
      setMessage(
        "Los enlaces de la demo son de ejemplo. Creá un intercambio con tu cuenta para invitar.",
      );
      return;
    }
    const url = invitationUrl();
    setShareUrl(url);
    setMessage("");
    try {
      await navigator.clipboard.writeText(url);
      setCopyFallback("");
      setMessage("Enlace copiado. Ya podés enviarlo a tu grupo.");
    } catch {
      setCopyFallback(url);
    }
  }
  async function shareInvite() {
    if (!real) return copyInvite();
    const url = invitationUrl();
    setShareUrl(url);
    if (!navigator.share) return copyInvite();
    try {
      await navigator.share({
        title: ex.name,
        text: `¡Te invito a ${ex.name} en Papelito!`,
        url,
      });
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError"))
        await copyInvite();
    }
  }
  async function draw() {
    if (!real) {
      setMessage(
        "Este grupo es de ejemplo. En tus intercambios reales el sorteo se guarda para cada participante.",
      );
      return;
    }
    if (repeated && reason.trim().length < 6) {
      setError("Contá el motivo del nuevo sorteo en al menos 6 caracteres.");
      return;
    }
    const ok = await run(
      "draw",
      async () => {
        const result = await real.executeDraw(
          ex.id,
          repeated ? reason.trim() : undefined,
        );
        if (!result.success) {
          setError(
            result.error ??
              "No se pudo hacer el sorteo. Revisá las restricciones.",
          );
          return false;
        }
        return true;
      },
      "¡Sorteo listo! Cada persona puede abrir su propio papelito.",
    );
    if (ok) {
      setConfirmDraw(false);
      setReason("");
    }
  }
  async function persistRules(next: typeof rules) {
    return run(
      "rules",
      async () => {
        if (real)
          return real.saveExclusions(
            ex.id,
            next.map((r) => ({
              giverUserId: r.giverId,
              excludedReceiverUserId: r.receiverId,
            })),
          );
        setDemoRules(next);
        return true;
      },
      "Restricciones guardadas.",
    );
  }
  async function addRule(e: React.FormEvent) {
    e.preventDefault();
    if (!giver || !receiver || giver === receiver) {
      setError("Elegí dos personas distintas. Nadie puede tocarse a sí mismo.");
      return;
    }
    const next = [...rules];
    for (const [g, r] of mutual
      ? [
          [giver, receiver],
          [receiver, giver],
        ]
      : [[giver, receiver]]) {
      if (!next.some((rule) => rule.giverId === g && rule.receiverId === r))
        next.push({ giverId: g, receiverId: r });
    }
    if (await persistRules(next)) {
      setGiver("");
      setReceiver("");
    }
  }

  return (
    <div className={`workshop-page occasion-${ex.selectedTheme}`}>
      <div className="section-heading">
        <button
          className="paper-text-button back-link"
          onClick={() => navigate?.("intercambios_lista")}
        >
          ← Mis intercambios
        </button>
        {real && (
          <button
            className="paper-text-button"
            disabled={real.isRefreshing || !!busy}
            onClick={() => void real.refreshNow()}
          >
            {real.isRefreshing ? "Actualizando…" : "Actualizar grupo"}
          </button>
        )}
      </div>
      <header className="exchange-invitation">
        <div>
          <p className="workshop-step">
            {closed
              ? "Un recuerdo compartido"
              : drawn
                ? "El secreto ya está repartido"
                : "Reuní a tu gente"}
          </p>
          <h1>{ex.name}</h1>
          <p className="occasion-label">
            {THEME_CONFIG[ex.selectedTheme].label}
          </p>
          <dl className="event-facts">
            <div>
              <dt>Entrega</dt>
              <dd>{formatEventDate(ex.eventDate)}</dd>
            </div>
            <div>
              <dt>Por regalo</dt>
              <dd>{formatMoney(ex.budgetAmount, ex.currency)}</dd>
            </div>
            <div>
              <dt>Organiza</dt>
              <dd>{ex.organizerName}</dd>
            </div>
          </dl>
          {ex.description && (
            <p className="handwritten-message">{ex.description}</p>
          )}
        </div>
        <PaperIllustration theme={ex.selectedTheme} />
      </header>
      {message && (
        <p className="workshop-success" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="workshop-error" role="alert">
          {error}
        </p>
      )}
      {!canEnter ? (
        <section className="workshop-sheet">
          <h2>
            {ex.currentUserMemberStatus === "pending"
              ? "Tu lugar está en espera."
              : "No tenés acceso a este grupo."}
          </h2>
          <p>
            {ex.currentUserMemberStatus === "pending"
              ? "La persona que organiza debe aprobar tu ingreso. Volvé a revisar más tarde; actualizamos al regresar a la app."
              : "Consultá con la persona que organiza si creés que hubo un error."}
          </p>
          {real && (
            <button
              className="paper-button"
              disabled={real.isRefreshing}
              onClick={() => void real.refreshNow()}
            >
              Revisar mi ingreso
            </button>
          )}
        </section>
      ) : (
        <>
          {ex.drawNotice && (
            <p className="next-note" role="status">
              {ex.drawNotice}
            </p>
          )}
          {drawn && ex.assignment && (
            <section className="secret-strip">
              <div>
                <span className="workshop-step">
                  Hay alguien esperando tu regalo.
                </span>
                <h2>Tu papelito sigue aquí.</h2>
              </div>
              <button
                className="paper-button"
                onClick={() => navigate?.("asignacion_revelar", ex.id)}
              >
                {ex.assignment.revealed
                  ? "Volver a ver mi persona"
                  : "Abrir mi papelito"}
              </button>
            </section>
          )}
          <div className="detail-columns">
            <div>
              {!closed && (
                <section className="workshop-sheet readiness-sheet">
                  <p className="workshop-step">Antes de repartir secretos</p>
                  <h2>
                    {drawn
                      ? "Así va tu grupo."
                      : enough
                        ? "Ya pueden sortear."
                        : `Faltan ${ex.minParticipants - approved.length} para sortear.`}
                  </h2>
                  <div className="readiness-numbers">
                    <span>
                      <strong>{approved.length}</strong>{" "}
                      {approved.length === 1
                        ? "persona aprobada"
                        : "personas aprobadas"}
                    </span>
                    {owner && (
                      <span>
                        <strong>{pending.length}</strong>{" "}
                        {pending.length === 1 ? "por aprobar" : "por aprobar"}
                      </span>
                    )}
                    <span>
                      <strong>{missing.length}</strong> sin pistas de regalo
                    </span>
                  </div>
                  <p className="field-help">
                    Las pistas son opcionales. Para sortear hacen falta al menos{" "}
                    {ex.minParticipants} personas aprobadas.
                  </p>
                  <p className="field-help">
                    Inscripción hasta el{" "}
                    {formatEventDate(ex.registrationDeadline)}.
                  </p>
                  {owner && !drawn && (
                    <button
                      className="paper-button"
                      disabled={!enough || !!busy}
                      onClick={() => {
                        setConfirmDraw(true);
                        setError("");
                      }}
                    >
                      Preparar sorteo
                    </button>
                  )}
                  {!owner && !drawn && (
                    <p>
                      Cuando se haga el sorteo, aquí vas a poder abrir tu
                      papelito.
                    </p>
                  )}
                  {owner && drawn && real && (
                    <details className="workshop-options">
                      <summary>¿Necesitás repetir el sorteo?</summary>
                      <p>
                        Cambiará la persona asignada a todo el grupo. Avisales
                        antes de hacerlo.
                      </p>
                      <button
                        className="paper-outline-button"
                        disabled={!!busy}
                        onClick={() => setConfirmDraw(true)}
                      >
                        Preparar nuevo sorteo
                      </button>
                    </details>
                  )}
                  {confirmDraw && owner && (
                    <div className="confirmation-note">
                      <h3>
                        {repeated
                          ? "Un nuevo sorteo para todos"
                          : "¿Repartimos los papelitos?"}
                      </h3>
                      <p>
                        Participan {approved.length} personas aprobadas.{" "}
                        {pending.length > 0 &&
                          `${pending.length} solicitudes pendientes quedarán fuera.`}{" "}
                        Cada persona verá únicamente a quien le corresponde.
                      </p>
                      {repeated && (
                        <label className="workshop-field">
                          Motivo del nuevo sorteo
                          <textarea
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            minLength={6}
                            maxLength={500}
                            rows={2}
                          />
                        </label>
                      )}
                      <div className="workshop-actions">
                        <button
                          className="paper-button"
                          disabled={!!busy}
                          aria-busy={busy === "draw"}
                          onClick={draw}
                        >
                          {busy === "draw"
                            ? "Repartiendo secretos…"
                            : repeated
                              ? "Confirmar nuevo sorteo"
                              : "Confirmar sorteo"}
                        </button>
                        <button
                          className="paper-text-button"
                          disabled={!!busy}
                          onClick={() => setConfirmDraw(false)}
                        >
                          Todavía no
                        </button>
                      </div>
                    </div>
                  )}
                </section>
              )}
              <section className="workshop-sheet">
                <div className="section-heading">
                  <h2>La gente del intercambio</h2>
                  <span className="count-stamp">{approved.length}</span>
                </div>
                <ul className="participant-list">
                  {approved.map((p) => (
                    <li key={p.id}>
                      <span
                        className="participant-avatar"
                        style={{ background: p.avatarColor }}
                        aria-hidden="true"
                      >
                        {p.alias.slice(0, 1).toUpperCase()}
                      </span>
                      <div>
                        <strong>
                          {p.alias}
                          {p.isOrganizer && <small> · Organiza</small>}
                        </strong>
                        <span>
                          {p.wishCount
                            ? `${p.wishCount} ${p.wishCount === 1 ? "pista compartida" : "pistas compartidas"}`
                            : "Todavía sin pistas"}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
                <button
                  className="paper-outline-button"
                  onClick={() => navigate?.("deseos_lista")}
                >
                  Preparar mis deseos
                </button>
                {owner && pending.length > 0 && (
                  <div className="pending-members">
                    <h3>Están tocando la puerta</h3>
                    {pending.map((p) => (
                      <div key={p.id} className="pending-row">
                        <strong>{p.alias}</strong>
                        <div className="workshop-actions">
                          <button
                            className="paper-button"
                            disabled={!!busy}
                            onClick={() =>
                              void run(
                                p.id,
                                () => real!.manageMember(p.id, "approved"),
                                `${p.alias} ya está en el intercambio.`,
                              )
                            }
                          >
                            Aprobar a {p.alias}
                          </button>
                          <button
                            className="paper-text-button"
                            disabled={!!busy}
                            onClick={() =>
                              void run(
                                p.id,
                                () => real!.manageMember(p.id, "rejected"),
                                "Solicitud rechazada.",
                              )
                            }
                          >
                            Rechazar a {p.alias}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
            <aside>
              {canInvite && (
                <section className="workshop-sheet invite-sheet">
                  <p className="workshop-step">El siguiente paso</p>
                  <h2>Pasá la invitación.</h2>
                  {!shareUnavailable && <InvitationQR url={real ? `/unirse/${ex.inviteCode}` : '/?mode=demo'} name={ex.name} />}
                  {!real && <p className="field-help">El QR de ejemplo abre la demo; las invitaciones reales se crean con tu cuenta.</p>}
                  <p>
                    Compartí el enlace con tu familia o tus amigos.
                    {ex.requiresApproval && " Vos decidís quién entra."}
                  </p>
                  <div className="invite-actions">
                    <button
                      className="paper-button"
                      onClick={shareInvite}
                      disabled={shareUnavailable}
                    >
                      Compartir invitación
                    </button>
                    <button
                      className="paper-outline-button"
                      onClick={copyInvite}
                      disabled={shareUnavailable}
                    >
                      Copiar enlace
                    </button>
                    <button
                      className="paper-text-button"
                      onClick={() => {
                        if (real) setShareUrl(invitationUrl());
                        else void copyInvite();
                      }}
                      disabled={shareUnavailable}
                    >
                      Preparar para WhatsApp
                    </button>
                  </div>
                  {shareUnavailable && (
                    <p className="field-help">
                      No hay una invitación vigente. Revisá el cierre de
                      inscripción antes de renovar el enlace.
                    </p>
                  )}
                  {shareUrl && (
                    <a
                      className="paper-outline-button"
                      href={`https://wa.me/?text=${encodeURIComponent(`¡Te invito a ${ex.name} en Papelito! ${shareUrl}`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Abrir WhatsApp ↗
                    </a>
                  )}
                  {copyFallback && (
                    <label className="workshop-field">
                      Copiá este enlace
                      <input
                        readOnly
                        value={copyFallback}
                        onFocus={(e) => e.target.select()}
                      />
                      <small>
                        No pudimos usar el portapapeles. Seleccioná y copiá el
                        enlace.
                      </small>
                    </label>
                  )}
                  {real && (
                    <details className="workshop-options">
                      <summary>Reemplazar el enlace</summary>
                      <p>
                        El enlace anterior dejará de funcionar. Usalo si se
                        compartió con personas que no conocés.
                      </p>
                      {!renew ? (
                        <button
                          className="paper-text-button"
                          onClick={() => setRenew(true)}
                        >
                          Quiero cambiarlo
                        </button>
                      ) : (
                        <div className="workshop-actions">
                          <button
                            className="paper-outline-button"
                            disabled={!!busy}
                            onClick={() =>
                              void run(
                                "invite",
                                async () => {
                                  const token = await real.regenerateInviteLink(
                                    ex.id,
                                  );
                                  if (!token) return false;
                                  setShareUrl("");
                                  setCopyFallback("");
                                  setRenew(false);
                                  return true;
                                },
                                "Enlace renovado. Copiá o compartí la nueva invitación.",
                              )
                            }
                          >
                            Confirmar cambio de enlace
                          </button>
                          <button
                            className="paper-text-button"
                            onClick={() => setRenew(false)}
                            disabled={!!busy}
                          >
                            Conservar enlace
                          </button>
                        </div>
                      )}
                    </details>
                  )}
                </section>
              )}
              {owner && !closed && (
                <section className="workshop-sheet">
                  <details className="workshop-options">
                    <summary>El papel de esta celebración</summary>
                    <fieldset className="theme-picker">
                      <legend>Elegí el tema</legend>
                      <div>
                        {(Object.keys(THEME_CONFIG) as ThemeKey[]).map((t) => (
                          <button
                            className={`theme-choice occasion-${t}`}
                            aria-pressed={ex.selectedTheme === t}
                            disabled={!!busy}
                            key={t}
                            onClick={() =>
                              void run(
                                "theme",
                                async () => {
                                  if (real)
                                    return real.updateExchangeTheme(ex.id, t);
                                  demo?.updateExchangeTheme(ex.id, t);
                                  return true;
                                },
                                "Tema actualizado.",
                              )
                            }
                          >
                            <span className="theme-swatch" aria-hidden="true" />
                            {THEME_CONFIG[t].label}
                          </button>
                        ))}
                      </div>
                    </fieldset>
                  </details>
                  {!drawn && (
                    <details className="workshop-options">
                      <summary>Quiénes no se pueden tocar</summary>
                      <p>
                        Útil para parejas o personas del mismo hogar. Nadie
                        puede tocarse a sí mismo.
                      </p>
                      <form onSubmit={addRule}>
                        <label className="workshop-field">
                          Persona que regala
                          <select
                            value={giver}
                            onChange={(e) => setGiver(e.target.value)}
                            disabled={!!busy}
                          >
                            <option value="">Elegí una persona</option>
                            {approved.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.alias}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="workshop-field">
                          No le puede regalar a
                          <select
                            value={receiver}
                            onChange={(e) => setReceiver(e.target.value)}
                            disabled={!!busy}
                          >
                            <option value="">Elegí otra persona</option>
                            {approved.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.alias}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="workshop-check">
                          <input
                            type="checkbox"
                            checked={mutual}
                            onChange={(e) => setMutual(e.target.checked)}
                            disabled={!!busy}
                          />
                          <span>Aplicar en ambas direcciones</span>
                        </label>
                        <button
                          className="paper-outline-button"
                          disabled={!!busy || !giver || !receiver}
                        >
                          Guardar restricción
                        </button>
                      </form>
                      <ul className="rule-list">
                        {rules.map((r) => (
                          <li key={`${r.giverId}-${r.receiverId}`}>
                            <span>
                              {alias(r.giverId)} → no {alias(r.receiverId)}
                            </span>
                            <button
                              className="paper-text-button"
                              aria-label={`Quitar restricción de ${alias(r.giverId)} a ${alias(r.receiverId)}`}
                              disabled={!!busy}
                              onClick={() =>
                                void persistRules(rules.filter((x) => x !== r))
                              }
                            >
                              Quitar
                            </button>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </section>
              )}
              <ExchangeLifecycleControls exchange={ex} />
              {ex.isCurrentUserOrganizer && <RepeatExchange key={ex.id} exchange={ex} />}
            </aside>
          </div>
        </>
      )}
      {ex.status === 'sorteado' && <AnonymousMessages key={`${ex.id}:${ex.currentDrawVersion}`} exchangeId={ex.id} version={ex.currentDrawVersion || 1} />}
    </div>
  );
}
