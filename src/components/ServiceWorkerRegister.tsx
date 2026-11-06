"use client";

import { useEffect } from "react";
import { rememberInstallWelcome, setInstallPrompt, type InstallPrompt } from "@/lib/pwa-install";
import { NEW_VERSION_EVENT } from "@/lib/version";

/**
 * Registers the public service worker. A waiting worker is announced through
 * the same «nueva versión» banner as a new deployment (VersionWatcher), which
 * activates it only when the person chooses to reload.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let active = true;
    let cleanupWorker: (() => void) | undefined;
    let cleanupRegistration: (() => void) | undefined;
    const readyToInstall = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as InstallPrompt);
    };
    const installed = () => { setInstallPrompt(null); rememberInstallWelcome(); };
    window.addEventListener("beforeinstallprompt", readyToInstall);
    window.addEventListener("appinstalled", installed);
    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js");
        if (!active) return;
        const detect = () => {
          if (registration.waiting && navigator.serviceWorker.controller)
            window.dispatchEvent(new CustomEvent(NEW_VERSION_EVENT));
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
    if (document.readyState === "complete") void register();
    else window.addEventListener("load", register, { once: true });
    return () => {
      active = false;
      window.removeEventListener("load", register);
      window.removeEventListener("beforeinstallprompt", readyToInstall);
      window.removeEventListener("appinstalled", installed);
      cleanupWorker?.();
      cleanupRegistration?.();
    };
  }, []);
  return null;
}
