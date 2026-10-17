import React from 'react';
import Link from 'next/link';
import { RibbonLogo } from '@/components/RibbonLogo';

export default function UnconfiguredAuthPage() {
  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: 'var(--bg-app)',
        padding: '2rem 1rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          maxWidth: '460px',
          width: '100%',
          backgroundColor: '#FFFFFF',
          borderRadius: '24px',
          border: '1px solid var(--border-subtle)',
          padding: '2.5rem 1.75rem',
          boxShadow: '0 8px 30px rgba(70, 36, 93, 0.08)',
          textAlign: 'center',
        }}
      >
        <RibbonLogo size="md" />

        <h1
          style={{
            fontFamily: 'var(--font-heading)',
            fontSize: '1.4rem',
            fontWeight: 800,
            color: 'var(--color-tinta)',
            margin: '1.5rem 0 0.5rem 0',
          }}
        >
          El acceso todavía no está disponible
        </h1>

        <p
          style={{
            fontSize: '0.92rem',
            color: 'var(--text-secondary)',
            lineHeight: 1.5,
            margin: '0 0 1.75rem 0',
          }}
        >
          El acceso con cuenta no está habilitado en este entorno. Puedes volver a la pantalla inicial o explorar la demostración interactiva.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <Link
            href="/?mode=demo"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: '48px',
              backgroundColor: 'var(--color-frambuesa)',
              color: '#FFFFFF',
              borderRadius: '14px',
              textDecoration: 'none',
              fontWeight: 700,
              fontFamily: 'var(--font-heading)',
              fontSize: '0.95rem',
            }}
          >
            Explorar demostración interactiva
          </Link>

          <Link
            href="/"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: '44px',
              backgroundColor: 'var(--surface-subtle)',
              color: 'var(--color-tinta)',
              borderRadius: '14px',
              textDecoration: 'none',
              fontWeight: 700,
              fontSize: '0.9rem',
            }}
          >
            Volver al inicio
          </Link>
        </div>
      </div>
    </div>
  );
}
