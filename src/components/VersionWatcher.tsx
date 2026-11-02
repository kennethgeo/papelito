"use client";

import { useEffect, useRef, useState } from "react";
import { checkDeployedVersion, NEW_VERSION_EVENT } from "@/lib/version";

const CHECK_INTERVAL_MS = 60_000;

/** Activates a waiting service worker (if any) and reloads the page. */
async function applyUpdate() {
  const registration = await navigator.serviceWorker?.getRegistration?.().catch(() => undefined);
  const waiting = registration?.waiting;
  if (waiting && navigator.serviceWorker.controller) {
    navigator.serviceWorker.addEventListener("controllerchange", () => window.location.reload(), { once: true });
    waiting.postMessage({ type: "ACTIVATE_UPDATE" });
    window.setTimeout(() => window.location.reload(), 3000);
    return;
  }
  window.location.reload();
}

/**
 * Detects a new deployment when the person returns to the app (or when a
 * request fails) and offers to reload. It never reloads by itself, and warns
 * before discarding text typed since the last page load.
 */
export function VersionWatcher() {
  const [available, setAvailable] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const typed = useRef(false);
  const lastCheck = useRef(0);

  useEffect(() => {
    const announce = () => setAvailable(true);
    const markTyped = (event: Event) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "TEXTAREA" || (target.tagName === "INPUT" && !["checkbox", "radio", "button", "submit"].includes((target as HTMLInputElement).type))))
        typed.current = true;
    };
    const onReturn = () => {
      if (document.visibilityState !== "visible" || Date.now() - lastCheck.current < CHECK_INTERVAL_MS) return;
      lastCheck.current = Date.now();
      void checkDeployedVersion();
    };
    window.addEventListener(NEW_VERSION_EVENT, announce);
    document.addEventListener("input", markTyped, true);
    document.addEventListener("visibilitychange", onReturn);
    window.addEventListener("online", onReturn);
    return () => {
      window.removeEventListener(NEW_VERSION_EVENT, announce);
      document.removeEventListener("input", markTyped, true);
      document.removeEventListener("visibilitychange", onReturn);
      window.removeEventListener("online", onReturn);
    };
  }, []);

  if (!available) return null;
  return (
    <aside className="update-banner" role="status" aria-live="polite">
      {confirmDiscard ? (
        <>
          <p>Escribiste algo en esta pantalla. Si recargás ahora, lo que no guardaste se pierde.</p>
          <button onClick={() => void applyUpdate()}>Recargar igual</button>
          <button onClick={() => setConfirmDiscard(false)}>Volver y guardar</button>
        </>
      ) : (
        <>
          <p>Hay una versión nueva de Papelito. Recargá para seguir con todo al día.</p>
          <button onClick={() => (typed.current ? setConfirmDiscard(true) : void applyUpdate())}>Recargar</button>
          <button onClick={() => setAvailable(false)}>Más tarde</button>
        </>
      )}
    </aside>
  );
}
