
/**
 * Browser history for the in-app views, so Android's back gesture and reloads
 * keep the person where they were. URLs only carry the view name and the
 * exchange id (useless without membership); never assignments, names or
 * wishes. Other parameters (such as ?mode=demo) are preserved.
 */
export type AppView =
  | "intercambios_lista"
  | "intercambio_crear"
  | "intercambio_detalle"
  | "asignacion_revelar"
  | "deseos_lista"
  | "cuenta_perfil";

const SLUGS: Record<AppView, string> = {
  intercambios_lista: "",
  intercambio_crear: "crear",
  intercambio_detalle: "intercambio",
  asignacion_revelar: "papelito",
  deseos_lista: "deseos",
  cuenta_perfil: "cuenta",
};
const VIEWS = Object.fromEntries(Object.entries(SLUGS).filter(([, slug]) => slug).map(([view, slug]) => [slug, view])) as Record<string, AppView>;
const EXCHANGE_ID = /^[A-Za-z0-9-]{1,64}$/;
const NEEDS_EXCHANGE = new Set<AppView>(["intercambio_detalle", "asignacion_revelar"]);

export const VIEW_TITLES: Record<AppView, string> = {
  intercambios_lista: "Mis intercambios",
  intercambio_crear: "Crear intercambio",
  intercambio_detalle: "Intercambio",
  asignacion_revelar: "Mi papelito",
  deseos_lista: "Mis deseos",
  cuenta_perfil: "Mi cuenta",
};

export function readViewFromUrl(search: string): { view: AppView; exchangeId: string | null } {
  const params = new URLSearchParams(search);
  const raw = params.get("intercambio");
  const exchangeId = raw && EXCHANGE_ID.test(raw) ? raw : null;
  const view = VIEWS[params.get("vista") ?? ""] ?? (exchangeId ? "intercambio_detalle" : "intercambios_lista");
  if (NEEDS_EXCHANGE.has(view) && !exchangeId) return { view: "intercambios_lista", exchangeId: null };
  return { view, exchangeId: NEEDS_EXCHANGE.has(view) ? exchangeId : null };
}

function urlFor(view: AppView, exchangeId: string | null) {
  const url = new URL(window.location.href);
  url.searchParams.delete("vista");
  url.searchParams.delete("intercambio");
  if (SLUGS[view]) url.searchParams.set("vista", SLUGS[view]);
  if (NEEDS_EXCHANGE.has(view) && exchangeId) url.searchParams.set("intercambio", exchangeId);
  return `${url.pathname}${url.search}${url.hash}`;
}

function depth(): number {
  const value = (window.history.state as { papelitoDepth?: unknown } | null)?.papelitoDepth;
  return typeof value === "number" ? value : 0;
}

/** Records a new view as a history entry (no-op if it is already current). */
export function pushView(view: AppView, exchangeId: string | null = null) {
  if (typeof window === "undefined") return;
  const next = urlFor(view, exchangeId);
  if (next === `${window.location.pathname}${window.location.search}${window.location.hash}`) return;
  window.history.pushState({ papelitoDepth: depth() + 1 }, "", next);
}

/** Normalizes the current entry (first load) without adding history. */
export function replaceView(view: AppView, exchangeId: string | null = null) {
  if (typeof window === "undefined") return;
  window.history.replaceState({ papelitoDepth: depth() }, "", urlFor(view, exchangeId));
}

/**
 * «Volver»: return to the previous in-app entry when there is one; otherwise
 * go to the fallback view replacing the current entry (no loop of entries).
 */
export function goBackOr(fallback: () => void) {
  if (typeof window !== "undefined" && depth() > 0) window.history.back();
  else fallback();
}

/**
 * `?abrir=<section>` reopens a section after re-authentication. Returns true
 * once for the matching section and removes the parameter from the URL.
 */
export function consumeOpenSection(section: string): boolean {
  if (typeof window === "undefined") return false;
  const url = new URL(window.location.href);
  if (url.searchParams.get("abrir") !== section) return false;
  url.searchParams.delete("abrir");
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  return true;
}
