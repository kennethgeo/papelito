'use client';

import React, { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { RibbonLogo } from '@/components/RibbonLogo';

function AuthErrorContent() {
  const searchParams = useSearchParams();
  const errorMsg = searchParams.get('error') || 'Ocurrió un error inesperado durante la autenticación.';

  return (
    <div
      style={{
        maxWidth: '480px',
        width: '100%',
        backgroundColor: '#FFFFFF',
        borderRadius: '24px',
        border: '1px solid #FEB2B2',
        padding: '2rem 1.5rem',
        boxShadow: '0 8px 30px rgba(70, 36, 93, 0.08)',
        textAlign: 'center',
      }}
    >
      <RibbonLogo size="md" />

      <h1
        style={{
          fontFamily: 'var(--font-heading)',
          fontSize: '1.45rem',
          fontWeight: 800,
          color: '#9B1C1C',
          margin: '1.25rem 0 0.5rem 0',
        }}
      >
        No se pudo completar el acceso
      </h1>

      <p
        style={{
          fontSize: '0.88rem',
          color: '#7F1D1D',
          lineHeight: 1.45,
          backgroundColor: '#FFF5F5',
          padding: '0.85rem',
          borderRadius: '12px',
          border: '1px solid #FED7D7',
          marginBottom: '1.5rem',
        }}
      >
        {errorMsg}
      </p>

      <Link
        href="/"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          minHeight: '46px',
          backgroundColor: 'var(--color-tinta)',
          color: '#FFFFFF',
          borderRadius: '14px',
          textDecoration: 'none',
          fontWeight: 700,
          fontFamily: 'var(--font-heading)',
        }}
      >
        ← Volver al inicio
      </Link>
    </div>
  );
}

export default function AuthErrorPage() {
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
      <Suspense fallback={<div>Cargando...</div>}>
        <AuthErrorContent />
      </Suspense>
    </div>
  );
}
