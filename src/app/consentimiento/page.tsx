import React from 'react';
import Link from 'next/link';
import { RibbonLogo } from '@/components/RibbonLogo';
import { LEGAL_CONSTANTS } from '@/lib/legal/constants';

export const metadata = {
  title: 'Consentimiento Informado — Papelito',
  description: 'Información y fundamentos del consentimiento informado para el tratamiento de datos en Costa Rica.',
};

export default function ConsentimientoPage() {
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
          Aviso y Consentimiento Informado
        </h1>

        <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          Borrador basado en los artículos 5 y 6 de la Ley 8968 de Costa Rica. Pendiente de revisión jurídica
          y de completar la identidad y dirección del responsable.
        </p>
        <p>Nombre público: {LEGAL_CONSTANTS.PUBLIC_NAME}. Contacto de privacidad:{' '}
          <a href={`mailto:${LEGAL_CONSTANTS.CONTACT_EMAIL}`}>{LEGAL_CONSTANTS.CONTACT_EMAIL}</a>.
          Versión {LEGAL_CONSTANTS.VERSION}.</p>

        <hr style={{ border: 'none', borderTop: '1px solid #EDF2F7', margin: '1.5rem 0' }} />

        <div style={{ fontSize: '0.92rem', color: 'var(--color-tinta)', lineHeight: 1.6 }}>
          <p>
            Al otorgar su consentimiento en Papelito, usted manifiesta que ha sido informado claramente de:
          </p>

          <ul>
            <li>
              <strong>Finalidad:</strong> Sus datos (identificador de cuenta, alias público y lista de deseos)
              serán tratados únicamente para habilitar su participación en los intercambios en los que decida
              inscribirse.
            </li>
            <li>
              <strong>Destinatarios:</strong> Su alias y avatar serán visibles para los demás miembros de sus
              intercambios. Su asignación secreta y sus deseos solo serán consultados por la persona a quien le
              corresponda regalarle.
            </li>
            <li>
              <strong>Proveedores:</strong> Neon administra la base de datos, el acceso y los correos
              transaccionales; Netlify aloja el servicio. La base de datos y el acceso se alojan en Ohio,
              Estados Unidos. Google interviene si elegís ingresar con Google. Consultá la{' '}
              <Link href="/privacidad">política de privacidad</Link> para conocer la conservación y la eliminación.
            </li>
            <li>
              <strong>Carácter facultativo:</strong> La entrega de estos datos es voluntaria; sin embargo, no
              proporcionarlos impide su inclusión en la dinámica del sorteo.
            </li>
            <li>
              <strong>Separación de voluntades:</strong> La aceptación de los Términos del Servicio y el
              Consentimiento de Datos se recaban mediante controles separados e independientes, sin
              premarcado automático.
            </li>
            <li>
              <strong>Revocación:</strong> Puede revocar este consentimiento o solicitar la supresión de sus
              datos en cualquier momento desde «Mi cuenta».
            </li>
          </ul>
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
