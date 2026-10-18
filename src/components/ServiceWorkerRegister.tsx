"use client";

import { useEffect, useRef, useState } from "react";
import { setInstallPrompt, type InstallPrompt } from "@/lib/pwa-install";

export function ServiceWorkerRegister() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const applying = useRef(false);
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let active = true;
    let cleanupWorker: (() => void) | undefined;
    let cleanupRegistration: (() => void) | undefined;
    const readyToInstall = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as InstallPrompt);
    };
    const installed = () => setInstallPrompt(null);
    window.addEventListener("beforeinstallprompt", readyToInstall);
    window.addEventListener("appinstalled", installed);
    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js");
        if (!active) return;
        const detect = () => {
          if (registration.waiting && navigator.serviceWorker.controller)
            setWaiting(registration.waiting);
        };
        detect();
        const update = () => {
          const worker = registration.installing;
          if (!worker) return;
          const state = () => {
            if (worker.state === "installed") detect();
          };
          cleanupWorker?.();
          worker.addEventListener("statechange", state);
          cleanupWorker = () =>
            worker.removeEventListener("statechange", state);
        };
        registration.addEventListener("updatefound", update);
        cleanupRegistration = () => {
          registration.removeEventListener("updatefound", update);
        };
      } catch {
        /* Installation help remains usable when the browser does not support workers. */
      }
    };
    const changed = () => {
      if (applying.current) window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", changed);
    if (document.readyState === "complete") void register();
    else window.addEventListener("load", register, { once: true });
    return () => {
      active = false;
      window.removeEventListener("load", register);
      window.removeEventListener("beforeinstallprompt", readyToInstall);
      window.removeEventListener("appinstalled", installed);
      navigator.serviceWorker.removeEventListener("controllerchange", changed);
      cleanupWorker?.();
      cleanupRegistration?.();
    };
  }, []);
  if (!waiting || dismissed) return null;
  return (
    <aside className="update-banner" role="status">
      <p>
        Hay una nueva versión de Papelito. Guardá lo que estás escribiendo antes
        de actualizar.
      </p>
      <button
        onClick={() => {
          applying.current = true;
          waiting.postMessage({ type: "ACTIVATE_UPDATE" });
        }}
      >
        Actualizar ahora
      </button>
      <button onClick={() => setDismissed(true)}>Más tarde</button>
    </aside>
  );
}
