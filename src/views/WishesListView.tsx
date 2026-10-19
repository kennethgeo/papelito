"use client";

import { useRef, useState } from "react";
import { useOptionalDemoData } from "@/context/DemoDataContext";
import { useOptionalRealData } from "@/context/RealDataContext";
import { formatMoney } from "@/lib/event-dates";
import type { Currency, Wish } from "@/types";
import { WishPhoto } from '@/components/WishPhoto';
import { LinkPreview } from '@/components/LinkPreview';

const emptyDraft = {
  title: "",
  description: "",
  url: "",
  price: "",
  currency: "CRC" as Currency,
  priority: "media" as Wish["priority"],
};
function selectedGroups(wish: Wish) {
  return wish.selectedInExchanges ?? (wish.exchangeId ? [wish.exchangeId] : []);
}

export function WishesListView() {
  const real = useOptionalRealData();
  const demo = useOptionalDemoData();
  const wishes = real?.myWishes ?? demo?.userWishes ?? [];
  const exchanges = (real?.exchanges ?? demo?.exchanges ?? []).filter(
    (ex) => (ex.currentUserMemberStatus ?? "approved") === "approved",
  );
  const [draft, setDraft] = useState(emptyDraft);
  const [editing, setEditing] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const selectionLocks = useRef(new Set<string>());
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const titleRef = useRef<HTMLInputElement>(null);

  function cancelEdit() {
    setEditing(null);
    setDraft(emptyDraft);
    setExpanded(false);
    setError("");
  }
  function edit(wish: Wish) {
    setEditing(wish.id);
    setDraft({
      title: wish.title,
      description: wish.description ?? "",
      url: wish.url ?? "",
      price:
        wish.approximatePrice === undefined
          ? ""
          : String(wish.approximatePrice),
      currency: wish.currency,
      priority: wish.priority,
    });
    setExpanded(
      !!(wish.description || wish.url || wish.approximatePrice !== undefined),
    );
    setError("");
    setMessage("");
    titleRef.current?.focus();
    titleRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (lock.current) return;
    setError("");
    setMessage("");
    if (!draft.title.trim() || draft.title.trim().length > 150) {
      setError("Escribí una idea de regalo de hasta 150 caracteres.");
      titleRef.current?.focus();
      return;
    }
    if (draft.url.trim()) {
      try {
        const url = new URL(draft.url.trim());
        if (!["http:", "https:"].includes(url.protocol)) throw new Error();
      } catch {
        setError("El enlace debe empezar con https:// o http://.");
        return;
      }
    }
    const price = draft.price.trim() === "" ? undefined : Number(draft.price);
    if (
      price !== undefined &&
      (!Number.isFinite(price) || price < 0 || price > 100_000_000)
    ) {
      setError("Revisá el precio: usá un número entre 0 y 100 millones.");
      return;
    }
    lock.current = true;
    setBusy(true);
    try {
      const data = {
        title: draft.title.trim(),
        description: draft.description.trim(),
        url: draft.url.trim(),
        approximatePrice: price,
        currency: draft.currency,
        priority: draft.priority,
      };
      if (real) {
        if (!(await real.saveWish({ ...data, id: editing ?? undefined }))) {
          setError("No se guardó la idea. Conservamos lo que escribiste.");
          return;
        }
      } else if (demo) {
        if (editing) demo.updateUserWish(editing, data);
        else demo.addUserWish(data);
      }
      setMessage(
        editing
          ? "Cambios guardados."
          : "¡Idea guardada! Elegí abajo en cuáles intercambios compartirla.",
      );
      cancelEdit();
      titleRef.current?.focus();
    } catch {
      setError(
        "Se perdió la conexión. Revisá tu lista antes de volver a guardar. Conservamos tu idea.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function remove(id: string) {
    if (lock.current || selectionLocks.current.size) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (real) {
        if (!(await real.deleteWish(id))) {
          setError("No se pudo borrar la idea. Intentá de nuevo.");
          return;
        }
      } else demo?.deleteUserWish(id);
      if (editing === id) cancelEdit();
      setDeleting(null);
      setMessage(
        "Idea eliminada de tu lista y de los intercambios donde la compartiste.",
      );
    } catch {
      setError(
        "Revisá tu conexión y la lista antes de intentar borrar otra vez.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function select(wish: Wish, exchangeId: string, checked: boolean) {
    const key = `${wish.id}:${exchangeId}`;
    if (selectionLocks.current.size || lock.current) return;
    selectionLocks.current.add(key);
    setPending((prev) => ({ ...prev, [key]: checked }));
    setError("");
    setMessage("");
    try {
      const ok = real
        ? await real.toggleWishInExchange(exchangeId, wish.id, checked)
        : (demo?.toggleWishInExchange(exchangeId, wish.id, checked), true);
      if (!ok)
        setError(
          "No se pudo cambiar dónde se comparte esta idea. La selección anterior se conservó.",
        );
      else
        setMessage(
          checked
            ? "Idea compartida en ese intercambio."
            : "Idea retirada de ese intercambio. Sigue en tu lista personal.",
        );
    } catch {
      setError(
        "No pudimos confirmar el cambio. Actualizá la lista antes de repetirlo.",
      );
    } finally {
      selectionLocks.current.delete(key);
      setPending((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  }

  return (
    <div className="workshop-page wishes-workshop">
      <div className="workshop-heading">
        <div>
          <p className="workshop-step">Una ayudita para quien te regala</p>
          <h1>Se vale dar pistas.</h1>
          <p>
            Guardá tus ideas y elegí en qué intercambios compartir cada una.
          </p>
        </div>
        <span className="wish-doodle" aria-hidden="true">
          ✳
        </span>
      </div>
      <div className="wishes-layout">
        <section
          className="workshop-sheet wish-composer"
          aria-labelledby="wish-form-title"
        >
          <span className="paper-tape" aria-hidden="true" />
          <h2 id="wish-form-title">
            {editing ? "Afinemos esta pista." : "¿Qué te haría ilusión?"}
          </h2>
          <form onSubmit={save} noValidate aria-busy={busy}>
            <label className="workshop-field" htmlFor="wish-title">
              Idea de regalo
              <input
                id="wish-title"
                ref={titleRef}
                maxLength={150}
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                placeholder="Un libro, una plantita, algo hecho a mano…"
                disabled={busy}
              />
            </label>
            <details
              className="workshop-options"
              open={expanded}
              onToggle={(e) => setExpanded(e.currentTarget.open)}
            >
              <summary>Agregar enlace, precio o detalles</summary>
              <label className="workshop-field" htmlFor="wish-description">
                Detalles que ayudan
                <textarea
                  id="wish-description"
                  value={draft.description}
                  onChange={(e) =>
                    setDraft({ ...draft, description: e.target.value })
                  }
                  maxLength={500}
                  rows={3}
                  disabled={busy}
                  placeholder="Talla, color, sabor favorito…"
                />
              </label>
              <label className="workshop-field" htmlFor="wish-url">
                Enlace al regalo <span>(opcional)</span>
                <input
                  id="wish-url"
                  type="url"
                  inputMode="url"
                  value={draft.url}
                  onChange={(e) => setDraft({ ...draft, url: e.target.value })}
                  placeholder="https://"
                  maxLength={2000}
                  disabled={busy}
                />
              </label>
              <LinkPreview url={draft.url} demo={!real} onTitle={title => setDraft({ ...draft, title })} />
              <div className="workshop-fields-row">
                <label className="workshop-field" htmlFor="wish-price">
                  Precio aproximado
                  <input
                    id="wish-price"
                    type="number"
                    min="0"
                    max="100000000"
                    step="0.01"
                    inputMode="decimal"
                    value={draft.price}
                    onChange={(e) =>
                      setDraft({ ...draft, price: e.target.value })
                    }
                    disabled={busy}
                  />
                </label>
                <label className="workshop-field" htmlFor="wish-currency">
                  Moneda
                  <select
                    id="wish-currency"
                    value={draft.currency}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        currency: e.target.value as Currency,
                      })
                    }
                    disabled={busy}
                  >
                    <option value="CRC">Colones ₡</option>
                    <option value="USD">Dólares $</option>
                  </select>
                </label>
              </div>
              <label className="workshop-field" htmlFor="wish-priority">
                ¿Cuánto te gusta esta idea?
                <select
                  id="wish-priority"
                  value={draft.priority}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      priority: e.target.value as Wish["priority"],
                    })
                  }
                  disabled={busy}
                >
                  <option value="media">Me encantaría</option>
                  <option value="alta">Es mi favorita</option>
                  <option value="baja">También me gustaría</option>
                </select>
              </label>
            </details>
            <div className="workshop-actions">
              <button className="paper-button" disabled={busy}>
                {busy
                  ? "Guardando…"
                  : editing
                    ? "Guardar cambios"
                    : "Guardar idea"}
              </button>
              {editing && (
                <button
                  className="paper-text-button"
                  type="button"
                  disabled={busy}
                  onClick={cancelEdit}
                >
                  Cancelar edición
                </button>
              )}
            </div>
          </form>
          <p className="field-help">
            El nombre del regalo es suficiente. Los demás detalles son
            opcionales.
          </p>
        </section>
        <section className="wish-pool" aria-label="Mis ideas de regalo">
          <div className="section-heading">
            <h2>Tu lista de ilusiones</h2>
            <span className="count-stamp">{wishes.length}</span>
          </div>
          <div aria-live="polite" aria-atomic="true">
            {message && <p className="workshop-success">{message}</p>}
          </div>
          {error && (
            <p role="alert" className="workshop-error">
              {error}
            </p>
          )}
          {!wishes.length && (
            <div className="empty-wish-note">
              <p className="workshop-step">
                El primer papelito está en blanco.
              </p>
              <h3>Algo pequeño también cuenta.</h3>
              <p>
                Tu café favorito, un color que te encanta o una experiencia
                juntos. Dale una pista a quien te regala.
              </p>
              <button
                className="paper-text-button"
                onClick={() => titleRef.current?.focus()}
              >
                Escribir mi primera idea ↑
              </button>
            </div>
          )}
          <ul className="wish-list">
            {wishes.map((wish, index) => (
              <li key={wish.id} className="wish-note">
                <article aria-labelledby={`wish-${wish.id}`}>
                  <div className="wish-note-heading">
                    <span className="wish-number" aria-hidden="true">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <h3 id={`wish-${wish.id}`}>{wish.title}</h3>
                    {wish.priority === "alta" && (
                      <span className="favorite-stamp">Favorita</span>
                    )}
                  </div>
                  {wish.description && <p>{wish.description}</p>}
                  <WishPhoto wishId={wish.id} hasPhoto={wish.hasPhoto} editable demo={!real} />
                  <div className="wish-meta">
                    {wish.approximatePrice !== undefined && (
                      <span>
                        {formatMoney(wish.approximatePrice, wish.currency)}
                      </span>
                    )}
                    {wish.url && /^https?:\/\//i.test(wish.url) && (
                      <a
                        href={wish.url}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                      >
                        Ver regalo ↗
                      </a>
                    )}
                  </div>
                  <details className="wish-sharing">
                    <summary>
                      {selectedGroups(wish).length
                        ? `Compartida en ${selectedGroups(wish).length} ${selectedGroups(wish).length === 1 ? "intercambio" : "intercambios"}`
                        : "Solo en tu lista · Elegí dónde compartirla"}
                    </summary>
                    <p className="field-help">
                      En cada intercambio seleccionado podrá verla la persona a
                      quien le toque regalarte.
                    </p>
                    {exchanges.length ? (
                      exchanges.map((ex) => {
                        const key = `${wish.id}:${ex.id}`;
                        return (
                          <label className="workshop-check" key={key}>
                            <input
                              type="checkbox"
                              checked={
                                pending[key] ??
                                selectedGroups(wish).includes(ex.id)
                              }
                              disabled={Object.keys(pending).length > 0 || busy}
                              onChange={(e) =>
                                void select(wish, ex.id, e.target.checked)
                              }
                            />
                            <span>
                              {ex.name}
                              {key in pending && (
                                <small>Guardando selección…</small>
                              )}
                            </span>
                          </label>
                        );
                      })
                    ) : (
                      <p>
                        Primero creá un intercambio o esperá a que aprueben tu
                        ingreso.
                      </p>
                    )}
                  </details>
                  {deleting === wish.id ? (
                    <div className="confirmation-note">
                      <p>
                        ¿Borrar «{wish.title}»? También se quitará de los
                        intercambios donde la compartiste.
                      </p>
                      <div className="workshop-actions">
                        <button
                          className="paper-outline-button danger-button"
                          disabled={busy || Object.keys(pending).length > 0}
                          onClick={() => void remove(wish.id)}
                        >
                          Sí, borrar idea
                        </button>
                        <button
                          className="paper-text-button"
                          disabled={busy}
                          onClick={() => setDeleting(null)}
                        >
                          Conservar idea
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="wish-note-actions">
                      <button
                        className="paper-text-button"
                        aria-label={`Editar ${wish.title}`}
                        disabled={busy}
                        onClick={() => edit(wish)}
                      >
                        Editar
                      </button>
                      <button
                        className="paper-text-button"
                        aria-label={`Borrar ${wish.title}`}
                        disabled={busy}
                        onClick={() => setDeleting(wish.id)}
                      >
                        Borrar
                      </button>
                    </div>
                  )}
                </article>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
