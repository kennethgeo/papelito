"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import {
  getInstallPrompt,
  noInstallPrompt,
  setInstallPrompt,
  subscribeInstallPrompt,
} from "@/lib/pwa-install";

export function InstallGuide({ compact = false }: { compact?: boolean }) {
  const prompt = useSyncExternalStore(
    subscribeInstallPrompt,
    getInstallPrompt,
    noInstallPrompt,
  );
  const [installed, setInstalled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [help, setHelp] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(display-mode: standalone)");
    const update = () =>
      setInstalled(
        media.matches ||
          !!(navigator as Navigator & { standalone?: boolean }).standalone,
      );
    queueMicrotask(update);
    media.addEventListener("change", update);
    const done = () => setInstalled(true);
    window.addEventListener("appinstalled", done);
    return () => {
      media.removeEventListener("change", update);
      window.removeEventListener("appinstalled", done);
    };
  }, []);
  async function install() {
    const event = prompt;
    if (busy) return;
    if (!event) { setHelp(true); return; }
    setBusy(true);
    setMessage("");
    try {
      await event.prompt();
      const result = await event.userChoice;
      setMessage(
        result.outcome === "accepted"
          ? "Solicitud aceptada. Tu navegador terminará la instalación."
          : "Podés instalarla más adelante desde el menú del navegador.",
      );
    } catch {
      setMessage(
        "Usá el menú del navegador para agregar Papelito a tu pantalla de inicio.",
      );
    } finally {
      setInstallPrompt(null);
      setBusy(false);
    }
  }
  return (
    <section className={compact ? 'install-shortcut' : 'workshop-sheet install-guide'}>
      {!compact && <>
      <p className="workshop-step">Siempre a mano</p>
      <h2>
        {installed
          ? "Tu papelito ya tiene un lugar."
          : "Papelito en tu pantalla de inicio."}
      </h2>
      <p>
        {installed
          ? "Ya estás usando la app instalada. Necesitás conexión para guardar cambios y consultar tu asignación."
          : "Abrila como una app y volvé a consultar tu intercambio cuando querás."}
      </p>
      </>}
      {!installed && (
        <button className="paper-button" onClick={install} disabled={busy}>
          {busy ? "Abriendo instalación…" : "Instalar Papelito"}
        </button>
      )}
      {!installed && (!compact || help) && (
        <details open={help} onToggle={e => setHelp(e.currentTarget.open)}>
          <summary>Cómo agregarla en mi teléfono</summary>
          <h3>iPhone o iPad</h3>
          <ol>
            <li>Abrí Papelito en Safari.</li>
            <li>Tocá Compartir y luego «Agregar a pantalla de inicio».</li>
            <li>Confirmá con «Agregar».</li>
          </ol>
          <h3>Android</h3>
          <ol>
            <li>Abrí Papelito en Chrome.</li>
            <li>
              En el menú ⋮, buscá «Instalar app» o «Agregar a pantalla
              principal».
            </li>
            <li>Confirmá la instalación.</li>
          </ol>
          <p className="field-help">
            Si estás dentro de WhatsApp o Instagram, abrí primero el enlace en
            tu navegador. El nombre de las opciones puede variar.
          </p>
        </details>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
