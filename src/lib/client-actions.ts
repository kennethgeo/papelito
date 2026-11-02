import type { ActionResult } from "./data/server-actions";
import { checkDeployedVersion } from "./version";

const SNAPSHOT_SUBJECT = "tus intercambios";

/**
 * Reads can fail before any data exists; they never describe the failure as
 * an unconfirmed change. `subject` names what was being loaded.
 */
export async function callServerRead<T>(
  read: () => Promise<ActionResult<T>>,
  subject: string = SNAPSHOT_SUBJECT,
): Promise<ActionResult<T>> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return {
      success: false,
      error: subject === SNAPSHOT_SUBJECT
        ? "Estás sin conexión. Conectate y usá «Actualizar información» para cargar tus intercambios."
        : `Estás sin conexión. Conectate para cargar ${subject}.`,
    };
  }
  try {
    return await read();
  } catch {
    if ((await checkDeployedVersion()) === "new") {
      return { success: false, error: "Papelito se actualizó. Recargá la página para ver tu información al día." };
    }
    return {
      success: false,
      error: subject === SNAPSHOT_SUBJECT
        ? "No pudimos cargar tus intercambios. Revisá la conexión y usá «Actualizar información»."
        : `No pudimos cargar ${subject}. Revisá la conexión e intentá de nuevo.`,
    };
  }
}

/**
 * A failed mutation is never retried automatically: its outcome may be
 * uncertain. When a new deployment explains the failure, say so.
 */
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
    if ((await checkDeployedVersion()) === "new") {
      return {
        success: false,
        error: "Papelito se actualizó mientras lo usabas. No sabemos si este cambio se guardó: recargá la página y revisá antes de repetirlo.",
      };
    }
    return {
      success: false,
      error: "No pudimos confirmar el cambio. Revisá el estado antes de repetirlo.",
    };
  }
}
