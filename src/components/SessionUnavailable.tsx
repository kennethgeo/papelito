import { RibbonLogo } from '@/components/RibbonLogo';

/**
 * Shown when the session or the account state could not be confirmed. It is
 * never the welcome or consent screen: infrastructure failures must not look
 * like a sign-out or a pending legal confirmation.
 */
export function SessionUnavailable({ retryHref = '/', context = 'cuenta' }: { retryHref?: string; context?: 'cuenta' | 'invitación' }) {
  return (
    <main className="workshop-page compact-page" style={{ minHeight: '100dvh' }}>
      <section className="workshop-sheet" role="alert">
        <RibbonLogo size="sm" />
        <h1>{context === 'invitación' ? 'No pudimos revisar esta invitación.' : 'No pudimos confirmar tu sesión.'}</h1>
        <p>
          Puede ser la conexión o un problema temporal del servicio. No cerramos tu sesión y tus
          intercambios siguen guardados.
        </p>
        <p className="field-help">Esperá unos segundos y volvé a intentar. Si el problema sigue, avisanos desde la ayuda.</p>
        <div className="workshop-actions">
          {/* A full navigation renders the page again on the server. */}
          <a className="paper-button" href={retryHref}>Intentar de nuevo</a>
          <a className="paper-text-button" href="/ayuda">Ir a la ayuda</a>
        </div>
      </section>
    </main>
  );
}
