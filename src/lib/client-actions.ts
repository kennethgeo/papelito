import type { ActionResult } from "./data/server-actions";

/** A failed mutation is never retried automatically: its outcome may be uncertain. */
export async function callServerAction<T>(
  action: () => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return {
      success: false,
      error:
        "Estás sin conexión. El cambio no se envió; podés volver a intentarlo cuando regresés a internet.",
    };
  }
  try {
    return await action();
  } catch {
    return {
      success: false,
      error:
        "No pudimos confirmar el cambio. Revisá el estado antes de repetirlo. Si acabás de actualizar Papelito, recargá la página.",
    };
  }
}
