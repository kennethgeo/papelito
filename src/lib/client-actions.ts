import type { ActionResult } from "./data/server-actions";

/** Reads can fail before a snapshot exists; do not describe them as a change. */
export async function callServerRead<T>(
  read: () => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { success: false, error: "Estás sin conexión. Conectate y usá «Actualizar información» para cargar tus intercambios." };
  }
  try {
    return await read();
  } catch {
    return {
      success: false,
      error: "No pudimos cargar tus intercambios. Revisá la conexión y usá «Actualizar información». Si acabás de actualizar Papelito, recargá la página.",
    };
  }
}

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
