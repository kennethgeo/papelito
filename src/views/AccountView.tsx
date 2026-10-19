"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useOptionalDemoData } from "@/context/DemoDataContext";
import { useOptionalRealData } from "@/context/RealDataContext";
import { AccountDeletionPanel } from "@/components/AccountDeletionPanel";
import { InstallGuide } from "@/components/InstallGuide";
import { GiftPreferencesForm } from '@/components/GiftPreferencesForm';
import { NotificationSettings } from '@/components/NotificationSettings';
import { PersonalHistory } from '@/components/PersonalHistory';
import { PersonalTools } from '@/components/PersonalTools';
import { OfflineCopy } from '@/components/OfflineCopy';
import { AccountSecurity } from '@/components/AccountSecurity';
import { clearOfflineCopy } from '../../public/offline-vault.js';

export function AccountView() {
  const real = useOptionalRealData();
  const demo = useOptionalDemoData();
  const user = real?.user ?? demo?.userProfile;
  const [alias, setAlias] = useState(user?.alias ?? "");
  const [busy, setBusy] = useState("");
  const lock = useRef(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [reset, setReset] = useState(false);
  const [revoke, setRevoke] = useState(false);
  async function run(key: string, action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(key);
    setMessage("");
    setError("");
    try {
      await action();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo completar el cambio. Revisá tu conexión.",
      );
    } finally {
      lock.current = false;
      setBusy("");
    }
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (alias.trim().length < 2 || alias.trim().length > 40) {
      setError("Elegí un nombre de 2 a 40 caracteres.");
      return;
    }
    await run("alias", async () => {
      if (real) {
        if (!(await real.updateUserAlias(alias.trim())))
          throw new Error("No se pudo guardar el nombre.");
      } else demo?.updateProfileAlias(alias.trim());
      setMessage("Tu nombre quedó guardado.");
    });
  }
  async function download() {
    await run("export", async () => {
      const payload = real
        ? await real.exportAllUserData()
        : {
            exportedAt: new Date().toISOString(),
            accountType: "demo",
            profile: demo?.userProfile,
            exchanges: demo?.exchanges,
            wishes: demo?.userWishes,
          };
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(payload, null, 2)], {
          type: "application/json",
        }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `papelito-mis-datos-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage("Copia preparada. Revisá las descargas de tu navegador.");
      if (real) await real.submitPrivacyRequest("export");
    });
  }
  return (
    <div className="workshop-page account-workshop">
      <div className="workshop-heading">
        <div>
          <p className="workshop-step">Un espacio para vos</p>
          <h1>Tu nombre en el papelito.</h1>
        </div>
      </div>
      {message && (
        <p role="status" className="workshop-success">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="workshop-error">
          {error}
        </p>
      )}
      <section className="workshop-sheet">
        <div className="account-identity">
          <span
            className="participant-avatar"
            style={{ background: user?.avatarColor }}
            aria-hidden="true"
          >
            {user?.alias?.slice(0, 1).toUpperCase()}
          </span>
          <div>
            <strong>{user?.alias}</strong>
            <p>{user?.email}</p>
            {!real && (
              <p>Cuenta de demostración · guardada en este navegador</p>
            )}
          </div>
        </div>
        <form onSubmit={save}>
          <label className="workshop-field" htmlFor="account-alias">
            ¿Cómo te conoce tu gente?
            <input
              id="account-alias"
              autoComplete="nickname"
              maxLength={40}
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              disabled={!!busy}
            />
          </label>
          <p className="field-help">
            Este es el nombre que aparece en tus intercambios.
          </p>
          <button
            className="paper-button"
            disabled={!!busy}
            aria-busy={busy === "alias"}
          >
            {busy === "alias" ? "Guardando…" : "Guardar mi nombre"}
          </button>
        </form>
      </section>
      <InstallGuide />
      <NotificationSettings />
      {(!real || real.hasConsented) && <GiftPreferencesForm />}
      {(!real || real.hasConsented) && <PersonalHistory />}
      <PersonalTools />
      {(!real || real.hasConsented) && <OfflineCopy />}
      {(!real || real.hasConsented) && <AccountSecurity />}
      {real && (
        <section className="workshop-sheet">
          <h2>Tus papelitos, al día.</h2>
          <p>
            Revisamos los cambios al volver a la app o recuperar la conexión.
            También podés actualizar cuando querás.
          </p>
          <p className="field-help">
            {real.lastSyncedAt
              ? `Última actualización: ${new Intl.DateTimeFormat("es-CR", { hour: "2-digit", minute: "2-digit" }).format(new Date(real.lastSyncedAt))}.`
              : "Todavía no se ha confirmado una actualización."}
          </p>
          <button
            className="paper-outline-button"
            disabled={real.isRefreshing}
            onClick={() => void real.refreshNow()}
            aria-busy={real.isRefreshing}
          >
            {real.isRefreshing ? "Actualizando…" : "Actualizar información"}
          </button>
        </section>
      )}
      <section className="workshop-sheet">
        <details>
          <summary className="account-privacy-summary">
            Mis datos y privacidad
          </summary>
          <h2>Control de tus datos</h2>
          <p>
            Podés descargar una copia de tus datos personales o registrar una
            solicitud de eliminación de cuenta.
          </p>
          <button
            className="paper-outline-button"
            disabled={!!busy}
            onClick={download}
          >
            {busy === "export"
              ? "Preparando copia…"
              : "Descargar mis datos (JSON)"}
          </button>
          <AccountDeletionPanel />
          {real && (
            <>
              <p>
                Consentimiento
                {real.consentVersion ? ` (${real.consentVersion})` : ""}:{" "}
                <strong>
                  {real.hasConsented ? "Vigente" : "Pendiente / Revocado"}
                </strong>
              </p>
              {real.hasConsented &&
                (!revoke ? (
                  <button
                    className="paper-text-button"
                    disabled={!!busy}
                    onClick={() => setRevoke(true)}
                  >
                    Revocar consentimiento
                  </button>
                ) : (
                  <div className="confirmation-note">
                    <p>
                      Para volver a usar intercambios y deseos tendrás que
                      otorgarlo de nuevo.
                    </p>
                    <div className="workshop-actions">
                      <button
                        className="paper-outline-button danger-button"
                        disabled={!!busy}
                        onClick={() =>
                          void run("revoke", async () => {
                            if (!(await real.revokeUserConsent()))
                              throw new Error(
                                "No se pudo revocar el consentimiento.",
                              );
                            setRevoke(false);
                            setMessage("Consentimiento revocado.");
                          })
                        }
                      >
                        Confirmar revocación
                      </button>
                      <button
                        className="paper-text-button"
                        onClick={() => setRevoke(false)}
                        disabled={!!busy}
                      >
                        Conservar consentimiento
                      </button>
                    </div>
                  </div>
                ))}
            </>
          )}
          <nav
            className="account-document-links"
            aria-label="Documentos existentes"
          >
            <Link href="/terminos">Términos y Condiciones del Servicio ↗</Link>
            <Link href="/privacidad">Política de Privacidad ↗</Link>
            <Link href="/consentimiento">
              Aviso de Consentimiento Informado ↗
            </Link>
            <Link href="/almacenamiento">Cookies y Almacenamiento Local ↗</Link>
          </nav>
        </details>
      </section>
      {real ? (
        <form action="/auth/logout" method="POST" onSubmit={e => { e.preventDefault(); const form = e.currentTarget; void clearOfflineCopy().then(() => form.submit()).catch(() => form.submit()); }}>
          <button type="submit" className="paper-outline-button logout-button">
            Cerrar sesión de {user?.email}
          </button>
        </form>
      ) : (
        <section className="workshop-sheet">
          <h2>Volver a empezar la demo</h2>
          <p>Restablecé únicamente los ejemplos guardados en este navegador.</p>
          {!reset ? (
            <button
              className="paper-outline-button"
              onClick={() => setReset(true)}
            >
              Restablecer datos de demostración
            </button>
          ) : (
            <div className="workshop-actions">
              <button
                className="paper-outline-button danger-button"
                onClick={() => {
                  demo?.resetDemoData();
                  setReset(false);
                }}
              >
                Sí, reiniciar demo
              </button>
              <button
                className="paper-text-button"
                onClick={() => setReset(false)}
              >
                Conservar datos
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
