'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PaperBrand } from '@/components/PaperBrand';
import { PaperIllustration } from '@/components/PaperIllustration';
import { PaperAccessCard } from '@/components/PaperAccessCard';

export function PaperWelcome() {
  const router = useRouter();

  return (
    <div className="paper-welcome">
      <header className="paper-welcome-header">
        <PaperBrand />
        <span>Un pequeño gran secreto.</span>
      </header>

      <div className="paper-welcome-grid">
        <section className="paper-welcome-story">
          <h1>
            La mitad del regalo
            <br />
            es la sorpresa.
          </h1>
          <p>
            Armá un amigo secreto con tu gente. Cada quien recibe un nombre y comparte sus ideas para regalar.
          </p>
          <PaperIllustration />
          <div className="paper-welcome-footnote">
            <span>Familia, amigos o esa gente de la oficina.</span>
            <span>Hay un papelito para todos.</span>
          </div>
        </section>

        <section className="paper-access" aria-labelledby="paper-access-title">
          <span className="paper-access-tab">La invitación es para vos</span>
          <h2 id="paper-access-title">
            Que empiece
            <br />
            el secreto.
          </h2>
          <p>
            Entrá con tu correo o con Google para guardar tus intercambios y volver a tu papelito cuando quieras.
          </p>

          <PaperAccessCard nextUrl="/" />

          <div className="paper-try-demo">
            <p>¿Primero una miradita?</p>
            <button
              type="button"
              className="paper-text-button"
              onClick={() => router.push('/?mode=demo')}
            >
              Explorar la demo
            </button>
            <span>Sin cuenta, con datos de ejemplo.</span>
          </div>

          <p className="paper-privacy-note">
            <Link href="/privacidad">Privacidad</Link>
            <span>Tu sorpresa merece discreción.</span>
          </p>
        </section>
      </div>

      <footer className="paper-welcome-footer">
        <span>Para regalar con ganas.</span>
        <Link href="/almacenamiento">Cookies y almacenamiento</Link>
      </footer>
    </div>
  );
}
