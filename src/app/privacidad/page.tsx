import React from 'react';
import Link from 'next/link';
import { RibbonLogo } from '@/components/RibbonLogo';
import { LEGAL_CONSTANTS } from '@/lib/legal/constants';

export const metadata = {
  title: 'Política de Privacidad — Papelito',
  description: 'Tratamiento de datos personales de acuerdo con la Ley 8968 de la República de Costa Rica.',
};

export default function PrivacidadPage() {
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
          Política de Privacidad y Tratamiento de Datos
        </h1>

        <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          Versión legal {LEGAL_CONSTANTS.VERSION} · Ley No. 8968 de Costa Rica.
        </p>

        <hr style={{ border: 'none', borderTop: '1px solid #EDF2F7', margin: '1.5rem 0' }} />

        <div style={{ fontSize: '0.92rem', color: 'var(--color-tinta)', lineHeight: 1.6 }}>
          <h3>1. Responsable del tratamiento y contacto</h3>
          <p>
            Los datos identificativos definitivos del operador y el correo específico para atención de
            solicitudes de privacidad se encuentran pendientes de asignación formal. Deben completarse
            antes de habilitar el servicio con datos reales. Las opciones de «Mi cuenta» permiten exportar
            datos y registrar solicitudes cuando el servicio esté conectado.
          </p>

          <h3>2. Tratamiento internacional y proveedores de infraestructura</h3>
          <p>
            La infraestructura prevista utiliza Neon PostgreSQL, Neon Auth, Netlify y Google para el acceso.
            Antes del lanzamiento se identificarán los proveedores efectivamente contratados, la ubicación
            del tratamiento y las condiciones aplicables a transferencias fuera de Costa Rica.
          </p>

          <h3>3. Finalidad y visibilidad segmentada</h3>
          <p>
            Los datos se tratan exclusivamente para el funcionamiento del intercambio:
          </p>
          <ul>
            <li>Los demás miembros solo ven tu alias y avatar en la lista del evento.</li>
            <li>Tu asignación secreta solo la ves tú.</li>
            <li>
              Tus deseos seleccionados solo son accesibles para la persona a quien le tocó regalarte.
            </li>
            <li>
              El organizador no tiene facultades para consultar la matriz de resultados en la aplicación.
            </li>
          </ul>

          <h3>4. Ejercicio de derechos ARCO y eliminación</h3>
          <p>
            Todo titular puede exportar una copia estructurada de sus datos en formato JSON desde su perfil
            o remitir una solicitud de eliminación. Las solicitudes de eliminación se procesan
            administrativamente. El{' '}
            <a href="https://formatos.inamu.go.cr/SIDOC/DOCS/ley_8968.pdf" target="_blank" rel="noopener noreferrer">artículo 7 de la Ley 8968</a>{' '}
            establece cinco días hábiles, desde su recepción, para resolver lo que corresponda. Registrar
            la solicitud no equivale a haber eliminado la cuenta. En caso de encontrarse en un
            intercambio activo ya sorteado, la salida se coordinará para resguardar la dinámica del grupo sin
            desatender el derecho de supresión.
          </p>

          <h3>5. Conservación y respaldos</h3>
          <p>
            Los eventos cerrados se retienen por un plazo sugerido de{' '}
            {LEGAL_CONSTANTS.RETENTION_MONTHS_AFTER_CLOSE} meses. La versión definitiva deberá precisar
            el plazo efectivo, el procedimiento de eliminación y la conservación en respaldos de los
            proveedores seleccionados. La eliminación automática por antigüedad está pendiente de implementación.
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
