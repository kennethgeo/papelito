"use client";

import { useEffect, useRef, useState } from "react";
import { useOptionalDemoData } from "@/context/DemoDataContext";
import { useOptionalRealData } from "@/context/RealDataContext";
import { PaperIllustration } from "@/components/PaperIllustration";
import type { ThemeKey, Currency } from "@/types";
import { inferThemeFromDate, THEME_CONFIG } from "@/lib/theme";
import {
  addCalendarDays,
  costaRicaDate,
  formatEventDate,
  formatMoney,
  suggestedEventDates,
  validateExchangeDraft,
} from "@/lib/event-dates";

export function CreateExchangeWizard() {
  const real = useOptionalRealData();
  const demo = useOptionalDemoData();
  const navigate = real?.navigateTo ?? demo?.navigateTo;
  const [step, setStep] = useState<1 | 2>(1);
  const [today, setToday] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [deadline, setDeadline] = useState("");
  const [deadlineEdited, setDeadlineEdited] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [budget, setBudget] = useState("15000");
  const [currency, setCurrency] = useState<Currency>("CRC");
  const [requiresApproval, setRequiresApproval] = useState(true);
  const [manualTheme, setManualTheme] = useState<ThemeKey | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const busy = useRef(false);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const inferred = inferThemeFromDate(eventDate);
  const theme = manualTheme ?? inferred.theme;

  useEffect(() => {
    const localToday = costaRicaDate(new Date());
    const defaults = suggestedEventDates(localToday);
    queueMicrotask(() => {
      setToday(localToday);
      setEventDate(defaults.eventDate);
      setDeadline(defaults.registrationDeadline);
    });
  }, []);

  function changeDate(value: string) {
    setEventDate(value);
    if (!deadlineEdited) {
      const before = addCalendarDays(value, -7);
      setDeadline(before < today ? today : before);
    }
  }

  function review(event: React.FormEvent) {
    event.preventDefault();
    const validation = validateExchangeDraft(
      {
        name,
        eventDate,
        registrationDeadline: deadline,
        budgetAmount: Number(budget),
      },
      today,
    );
    setErrors(validation);
    if (Object.keys(validation).length) {
      requestAnimationFrame(() => errorRef.current?.focus());
      return;
    }
    setStep(2);
    setError("");
    requestAnimationFrame(() => titleRef.current?.focus());
    window.scrollTo({ top: 0 });
  }

  async function create() {
    if (busy.current) return;
    busy.current = true;
    setCreating(true);
    setError("");
    try {
      if (real) {
        const res = await real.createExchange({
          name: name.trim(),
          description: description.trim(),
          eventDate,
          registrationDeadline: deadline,
          budgetAmount: Number(budget),
          currency,
          requiresApproval,
          suggestedTheme: inferred.theme,
          selectedTheme: theme,
        });
        if (!res.success || !res.exchangeId) {
          setError(
            res.error ||
              "No se pudo crear. Revisá tu conexión y volvé a intentar.",
          );
          return;
        }
      } else if (demo) {
        const id = demo.createExchange({
          name: name.trim(),
          description: description.trim(),
          eventDate,
          registrationDeadline: deadline,
          budgetAmount: Number(budget),
          currency,
          requiresApproval,
          manualThemeOverride: manualTheme ?? undefined,
        });
        navigate?.("intercambio_detalle", id);
      }
    } catch {
      setError(
        "Se interrumpió la conexión. Conservamos lo que escribiste; revisá tus intercambios antes de volver a crear.",
      );
    } finally {
      busy.current = false;
      setCreating(false);
    }
  }

  return (
    <div className={`workshop-page occasion-${theme}`}>
      <button
        className="paper-text-button back-link"
        disabled={creating}
        onClick={() => navigate?.("intercambios_lista")}
      >
        ← Mis intercambios
      </button>
      <div className="workshop-heading">
        <div>
          <p className="workshop-step">
            {step === 1 ? "Primero, los detalles" : "Todo listo para invitar"}
          </p>
          <h1 ref={titleRef} tabIndex={-1}>
            {step === 1
              ? "Armemos un buen secreto."
              : "Así queda tu invitación."}
          </h1>
        </div>
        <span className="step-counter" aria-label={`Paso ${step} de 2`}>
          {step} / 2
        </span>
      </div>
      <div className="creation-layout">
        <section className="workshop-sheet">
          {step === 1 ? (
            <form onSubmit={review} noValidate>
              {Object.keys(errors).length > 0 && (
                <div
                  className="workshop-error"
                  role="alert"
                  tabIndex={-1}
                  ref={errorRef}
                >
                  <strong>Revisemos estos detalles:</strong>
                  <ul>
                    {Object.entries(errors).map(([key, message]) => (
                      <li key={key}>
                        <a href={`#create-${key}`}>{message}</a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <label className="workshop-field" htmlFor="create-name">
                ¿Cómo se llama el intercambio?
                <input
                  id="create-name"
                  autoComplete="off"
                  maxLength={100}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej. Navidad en casa de la abuela"
                  aria-invalid={!!errors.name}
                  aria-describedby={errors.name ? "error-name" : undefined}
                />
              </label>
              {errors.name && (
                <p id="error-name" className="field-error">
                  {errors.name}
                </p>
              )}
              <label className="workshop-field" htmlFor="create-eventDate">
                ¿Cuándo se entregan los regalos?
                <input
                  id="create-eventDate"
                  type="date"
                  min={today || undefined}
                  value={eventDate}
                  onChange={(e) => changeDate(e.target.value)}
                  aria-invalid={!!errors.eventDate}
                  aria-describedby="date-help"
                />
              </label>
              <p id="date-help" className="field-help">
                El tema se sugiere por esta fecha. Siempre podés cambiarlo.
              </p>
              <div className="workshop-fields-row">
                <label className="workshop-field" htmlFor="create-budgetAmount">
                  Presupuesto por regalo
                  <input
                    id="create-budgetAmount"
                    type="number"
                    min="0.01"
                    max="100000000"
                    step={currency === "USD" ? "0.01" : "1"}
                    inputMode="decimal"
                    value={budget}
                    onChange={(e) => setBudget(e.target.value)}
                    aria-invalid={!!errors.budgetAmount}
                  />
                </label>
                <label className="workshop-field" htmlFor="create-currency">
                  Moneda
                  <select
                    id="create-currency"
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value as Currency)}
                  >
                    <option value="CRC">Colones ₡</option>
                    <option value="USD">Dólares $</option>
                  </select>
                </label>
              </div>
              <fieldset className="theme-picker">
                <legend>Una ocasión, su propio papelito</legend>
                <div>
                  {(Object.keys(THEME_CONFIG) as ThemeKey[]).map((key) => (
                    <button
                      key={key}
                      type="button"
                      aria-pressed={theme === key}
                      className={`theme-choice occasion-${key}`}
                      onClick={() => setManualTheme(key)}
                    >
                      <span className="theme-swatch" aria-hidden="true" />
                      {key === "general"
                        ? "Para celebrar"
                        : key === "amistad"
                          ? "Amistad"
                          : key === "cumpleanos"
                            ? "Cumpleaños"
                            : "Navidad"}
                    </button>
                  ))}
                </div>
                <p className="field-help">
                  {manualTheme ? (
                    <button
                      className="paper-text-button"
                      type="button"
                      onClick={() => setManualTheme(null)}
                    >
                      Volver al tema automático
                    </button>
                  ) : (
                    inferred.reason
                  )}
                </p>
              </fieldset>
              <details
                className="workshop-options"
                open={!!errors.registrationDeadline}
              >
                <summary>Más opciones para tu grupo</summary>
                <label
                  className="workshop-field"
                  htmlFor="create-registrationDeadline"
                >
                  Último día para unirse
                  <input
                    id="create-registrationDeadline"
                    type="date"
                    min={today || undefined}
                    max={eventDate || undefined}
                    value={deadline}
                    onChange={(e) => {
                      setDeadline(e.target.value);
                      setDeadlineEdited(true);
                    }}
                    aria-invalid={!!errors.registrationDeadline}
                  />
                </label>
                <p className="field-help">
                  Por defecto, una semana antes de la entrega. Podés sortear
                  antes cuando haya al menos tres personas aprobadas.
                </p>
                <label className="workshop-field" htmlFor="create-description">
                  Un mensaje para tu gente <span>(opcional)</span>
                  <textarea
                    id="create-description"
                    maxLength={500}
                    rows={3}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Dónde se reúnen, cómo envolver los regalos…"
                  />
                </label>
                <label className="workshop-check">
                  <input
                    type="checkbox"
                    checked={requiresApproval}
                    onChange={(e) => setRequiresApproval(e.target.checked)}
                  />
                  <span>
                    <strong>Aprobar a cada persona antes de que entre</strong>
                    <small>
                      Recomendado si el enlace se comparte en un grupo grande.
                    </small>
                  </span>
                </label>
              </details>
              <button type="submit" className="paper-button workshop-primary">
                Revisar mi intercambio
              </button>
            </form>
          ) : (
            <div>
              <h2>{name}</h2>
              <dl className="review-list">
                <div>
                  <dt>Entrega de regalos</dt>
                  <dd>{formatEventDate(eventDate)}</dd>
                </div>
                <div>
                  <dt>Presupuesto por persona</dt>
                  <dd>{formatMoney(Number(budget), currency)}</dd>
                </div>
                <div>
                  <dt>Último día para unirse</dt>
                  <dd>{formatEventDate(deadline)}</dd>
                </div>
                <div>
                  <dt>Participantes</dt>
                  <dd>
                    {requiresApproval
                      ? "Entran cuando los aprobás"
                      : "Entran directamente con el enlace"}
                  </dd>
                </div>
              </dl>
              {description && (
                <p className="handwritten-message">{description}</p>
              )}
              <div className="next-note">
                <strong>Después, reuní a tu gente.</strong>
                <p>
                  Al crearlo vas a tener un enlace para compartir. El sorteo se
                  hace cuando vos lo decidás, con al menos tres personas
                  aprobadas.
                </p>
              </div>
              {error && (
                <p role="alert" className="workshop-error">
                  {error}
                </p>
              )}
              <div className="workshop-actions">
                <button
                  className="paper-button"
                  onClick={create}
                  disabled={creating}
                  aria-busy={creating}
                >
                  {creating ? "Creando tu intercambio…" : "Crear intercambio"}
                </button>
                <button
                  className="paper-text-button"
                  disabled={creating}
                  onClick={() => {
                    setStep(1);
                    requestAnimationFrame(() => titleRef.current?.focus());
                  }}
                >
                  Editar detalles
                </button>
              </div>
            </div>
          )}
        </section>
        <aside
          className="invitation-preview"
          aria-label="Vista previa del tema"
        >
          <div className="preview-pin" aria-hidden="true" />
          <p>Hay un papelito para tu gente.</p>
          <PaperIllustration theme={theme} />
          <strong>{name.trim() || "Tu próxima celebración"}</strong>
          <span>{formatEventDate(eventDate)}</span>
          <small>{THEME_CONFIG[theme].tagline}</small>
        </aside>
      </div>
    </div>
  );
}
