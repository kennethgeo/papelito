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
            Su nombre público es {LEGAL_CONSTANTS.PUBLIC_NAME}. El contacto es{' '}
            <a href={`mailto:${LEGAL_CONSTANTS.CONTACT_EMAIL}`}>{LEGAL_CONSTANTS.CONTACT_EMAIL}</a>.
            La identidad jurídica y el domicilio del responsable están pendientes de completar y revisar;
            el nombre público no se presenta como una sociedad inscrita.
          </p>

          <h3>2. Elegibilidad y participación</h3>
          <p>
            El servicio está dirigido a personas de al menos {LEGAL_CONSTANTS.MINIMUM_RECOMMENDED_AGE} años.
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
          <p>
            Si se procesa la eliminación de la cuenta de un participante de un sorteo activo, esa versión
            se invalida y se borran sus asignaciones. El organizador deberá repetirlo con los miembros restantes.
            La organización puede transferirse a otro participante aprobado. Finalizar o cancelar un intercambio
            desactiva sus invitaciones y nuevos sorteos; el cierre no se puede deshacer.
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
            Los intercambios finalizados o cancelados se eliminan de la base activa mediante una tarea diaria
            al cumplir {LEGAL_CONSTANTS.RETENTION_MONTHS_AFTER_CLOSE} meses desde el cierre registrado, junto
            con sus asignaciones. La política de privacidad detalla los cierres anteriores a esta versión y
            el alcance de la eliminación en respaldos. Las cuentas y listas personales de deseos tienen un ciclo separado.
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
