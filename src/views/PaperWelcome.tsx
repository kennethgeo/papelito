'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PaperBrand } from '@/components/PaperBrand';
import { PaperIllustration } from '@/components/PaperIllustration';
import { authClient } from '@/lib/auth/client';
import { LEGAL_CONSTANTS } from '@/lib/legal/constants';

export function PaperWelcome() {
  const router = useRouter();
  const [terms, setTerms] = useState(false);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState(false);

  async function signIn() {
    if (!terms || !consent) { setError(true); return; }
    setError(false);

    // Record explicit user consent intent with timestamp in short-lived first-party cookie to consume once via POST Server Action
    document.cookie = `papelito_pending_consent=${encodeURIComponent(`${LEGAL_CONSTANTS.VERSION}|${Date.now()}`)}; path=/; max-age=600; SameSite=Lax`;

    try {
      if (authClient) {
        const result = await authClient.signIn.social({
          provider: 'google',
          callbackURL: window.location.origin,
        });
        if (result?.error) {
          router.push('/auth/unconfigured?provider=google');
        }
      } else {
        router.push('/auth/unconfigured?provider=google');
      }
    } catch {
      router.push('/auth/unconfigured?provider=google');
    }
  }
  return <div className="paper-welcome">
    <header className="paper-welcome-header"><PaperBrand /><span>Un pequeño gran secreto.</span></header>
    <div className="paper-welcome-grid">
      <section className="paper-welcome-story"><h1>La mitad del regalo<br />es la sorpresa.</h1><p>Armá un amigo secreto con tu gente. Cada quien recibe un nombre y comparte sus ideas para regalar.</p><PaperIllustration /><div className="paper-welcome-footnote"><span>Familia, amigos o esa gente de la oficina.</span><span>Hay un papelito para todos.</span></div></section>
      <section className="paper-access" aria-labelledby="paper-access-title"><span className="paper-access-tab">La invitación es para vos</span><h2 id="paper-access-title">Que empiece<br />el secreto.</h2><p>Entrá con Google para guardar tus intercambios y volver a tu papelito cuando quieras.</p>
        <div className="paper-consents">
          <label><input type="checkbox" checked={terms} onChange={e => setTerms(e.target.checked)} /><span>Acepto los <Link href="/terminos" target="_blank">Términos y Condiciones</Link>.</span></label>
          <label><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} /><span>Leí el <Link href="/consentimiento" target="_blank">consentimiento informado</Link> y autorizo el uso de mis datos para organizar los intercambios.</span></label>
        </div>
        {error && <p className="paper-form-error" role="alert">Revisá y marcá ambas casillas para entrar con Google.</p>}
        <button className="paper-google" onClick={signIn}><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2.1H12v4h5.4a4.6 4.6 0 0 1-2 3v2.5h3.3c1.9-1.8 2.9-4.3 2.9-7.4Z" /><path fill="#34A853" d="M12 22c2.7 0 5-.9 6.7-2.4l-3.3-2.5c-.9.6-2 1-3.4 1a6 6 0 0 1-5.6-4.2H3v2.6A10 10 0 0 0 12 22Z" /><path fill="#FBBC05" d="M6.4 13.9a6 6 0 0 1 0-3.8V7.5H3a10 10 0 0 0 0 9l3.4-2.6Z" /><path fill="#EA4335" d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.9-2.9A9.7 9.7 0 0 0 12 2a10 10 0 0 0-9 5.5l3.4 2.6A6 6 0 0 1 12 5.9Z" /></svg>Continuar con Google</button>
        <div className="paper-try-demo"><p>¿Primero una miradita?</p><button className="paper-text-button" onClick={() => router.push('/?mode=demo')}>Explorar la demo</button><span>Sin cuenta, con datos de ejemplo.</span></div>
        <p className="paper-privacy-note"><Link href="/privacidad">Privacidad</Link><span>Tu sorpresa merece discreción.</span></p>
      </section>
    </div>
    <footer className="paper-welcome-footer"><span>Para regalar con ganas.</span><Link href="/almacenamiento">Cookies y almacenamiento</Link></footer>
  </div>;
}
