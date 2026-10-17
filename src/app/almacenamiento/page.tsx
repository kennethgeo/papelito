import React from 'react';
import Link from 'next/link';
import { RibbonLogo } from '@/components/RibbonLogo';

export const metadata = {
  title: 'Cookies y Almacenamiento — Papelito',
  description: 'Información sobre cookies y almacenamiento local utilizado en Papelito.',
};

export default function AlmacenamientoPage() {
  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-app)', padding: '2rem 1rem 4rem 1rem' }}>
      <div
        style={{
          maxWidth: '680px',
          margin: '0 auto',
          backgroundColor: '#FFFFFF',
          borderRadius: '24px',
          border: '1px solid var(--border-subtle)',
          padding: '2.5rem 1.75rem',
          boxShadow: '0 8px 30px rgba(70, 36, 93, 0.06)',
        }}
      >
        <Link href="/" style={{ textDecoration: 'none', display: 'inline-block', marginBottom: '1.5rem' }}>
          <RibbonLogo size="sm" />
        </Link>

        <h1
          style={{
            fontFamily: 'var(--font-heading)',
            fontSize: '1.8rem',
            fontWeight: 800,
            color: 'var(--color-tinta)',
            lineHeight: 1.2,
            margin: '0 0 1rem 0',
          }}
        >
          Información de Cookies y Almacenamiento
        </h1>

        <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          Transparencia técnica sobre las tecnologías de persistencia empleadas por la aplicación.
        </p>

        <hr style={{ border: 'none', borderTop: '1px solid #EDF2F7', margin: '1.5rem 0' }} />

        <div style={{ fontSize: '0.92rem', color: 'var(--color-tinta)', lineHeight: 1.6 }}>
          <h3>1. Cookies técnicas esenciales</h3>
          <p>
            Papelito utiliza cookies técnicas para:
          </p>
          <ul>
            <li>Mantener activa y renovar la sesión, tanto al acceder con Google como con correo y contraseña.</li>
            <li>Proteger el inicio de sesión frente a solicitudes no autorizadas.</li>
          </ul>
          <p>
            La aceptación de los términos y el consentimiento informado se guardan en tu cuenta, en el
            servidor. No necesitas repetirlos al cambiar de navegador o volver a iniciar sesión, mientras
            la versión aceptada siga vigente y no hayas revocado el consentimiento.
          </p>

          <h3>2. Almacenamiento local (localStorage / Service Worker)</h3>
          <p>
            En el modo de demostración para evaluación de interfaz, se utiliza <code>localStorage</code> del
            navegador para guardar temporalmente datos ficticios. En el modo de producción conectado, las
            sesiones, asignaciones y deseos privados <strong>nunca se almacenan en cachés públicas ni en el
            service worker</strong>, requiriendo siempre conexión segura y autorización de servidor.
          </p>

          <h3>3. Sin rastreadores de terceros</h3>
          <p>
            No se emplean cookies de marketing, publicidad comportamental ni píxeles de seguimiento de redes
            sociales en la aplicación. El acceso externo de Google se rige también por sus propias
            condiciones y políticas de privacidad.
          </p>
        </div>

        <div style={{ marginTop: '2rem', paddingTop: '1.25rem', borderTop: '1px solid #EDF2F7' }}>
          <Link href="/" style={{ color: 'var(--color-frambuesa)', fontWeight: 700, textDecoration: 'none' }}>
            ← Volver a Papelito
          </Link>
        </div>
      </div>
    </div>
  );
}
