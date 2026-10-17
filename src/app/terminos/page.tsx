import React from 'react';
import Link from 'next/link';
import { RibbonLogo } from '@/components/RibbonLogo';
import { LEGAL_CONSTANTS } from '@/lib/legal/constants';

export const metadata = {
  title: 'Términos y Condiciones — Papelito',
  description: 'Términos y condiciones de uso para la plataforma de intercambios de regalos Papelito.',
};

export default function TerminosPage() {
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

        <div
          style={{
            backgroundColor: '#FEF3D6',
            color: '#7A5200',
            fontSize: '0.78rem',
            fontWeight: 700,
            textTransform: 'none',
            padding: '0.3rem 0.75rem',
            borderRadius: '999px',
            display: 'inline-block',
            marginBottom: '1rem',
          }}
        >
          {LEGAL_CONSTANTS.STATUS}
        </div>

        <h1
          style={{
            fontFamily: 'var(--font-heading)',
            fontSize: '1.9rem',
            fontWeight: 800,
            color: 'var(--color-tinta)',
            lineHeight: 1.2,
            margin: '0 0 0.5rem 0',
          }}
        >
          Términos y Condiciones de Uso
        </h1>

        <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          Versión legal {LEGAL_CONSTANTS.VERSION} · Fecha: {LEGAL_CONSTANTS.LAST_UPDATED}.
        </p>

        <hr style={{ border: 'none', borderTop: '1px solid #EDF2F7', margin: '1.5rem 0' }} />

        <div style={{ fontSize: '0.92rem', color: 'var(--color-tinta)', lineHeight: 1.6 }}>
          <h3>1. Identificación del servicio y estado operativo</h3>
          <p>
            «Papelito» es una aplicación para la coordinación de intercambios de regalos y amigos secretos.
            La identidad societaria u operadora definitiva y los canales de contacto formal se encuentran
            pendientes de configuración y revisión jurídica final previa al lanzamiento público.
          </p>

          <h3>2. Elegibilidad y participación</h3>
          <p>
            El servicio está propuesto para personas de al menos {LEGAL_CONSTANTS.MINIMUM_RECOMMENDED_AGE} años.
            Puedes acceder con Google o con correo electrónico y una contraseña de Papelito.
            Neon Auth administra la autenticación y las credenciales de acceso.
          </p>
          <p>
            La aceptación de la versión vigente de los términos y el consentimiento informado se registra
            en tu cuenta al completar el alta. No se exige nuevamente en cada inicio de sesión. Se solicita
            otra confirmación cuando cambia la versión de los documentos o cuando has revocado tu consentimiento.
          </p>

          <h3>3. Sorteos, versionado y cambios de miembros</h3>
          <p>
            El sorteo de asignaciones se ejecuta en el servidor y respeta las exclusiones registradas. Una vez
            sorteado un evento, sus asignaciones son inmutables para esa versión. La adición o baja de miembros
            con posterioridad no altera silenciosamente el resultado: si el organizador requiere rehacer el
            sorteo, deberá ejecutar una invalidación explícita que quedará registrada de forma visible para todos
            los participantes con un nuevo número de versión.
          </p>

          <h3>4. Enlaces a tiendas y deslinde de responsabilidad comercial</h3>
          <p>
            Los usuarios pueden incluir enlaces a tiendas de referencia en sus deseos. «Papelito» no realiza
            cobros, pagos, ventas ni intermediación comercial, ni recibe comisiones por compras. La
            disponibilidad, precio, compra, entrega física y calidad de los regalos son de exclusiva
            responsabilidad de los participantes y de las tiendas externas involucradas.
          </p>

          <h3>5. Conservación de eventos y datos</h3>
          <p>
            Los intercambios cerrados o finalizados se conservarán durante un período propuesto de{' '}
            {LEGAL_CONSTANTS.RETENTION_MONTHS_AFTER_CLOSE} meses, tras el cual podrán ser eliminados de las bases
            activas junto con sus asignaciones, sin perjuicio de los respaldos de seguridad técnicos.
          </p>

          <h3>6. Actualización de condiciones</h3>
          <p>
            Cualquier modificación sustancial a estos términos será publicada en esta misma ruta con
            incremento de versión y fecha de entrada en vigencia.
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
