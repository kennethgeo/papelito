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
            El servicio utiliza el nombre público {LEGAL_CONSTANTS.PUBLIC_NAME}. Para soporte y solicitudes
            de privacidad, escribí a <a href={`mailto:${LEGAL_CONSTANTS.CONTACT_EMAIL}`}>{LEGAL_CONSTANTS.CONTACT_EMAIL}</a>.
            La identidad jurídica y el domicilio del responsable todavía deben completarse; este nombre
            público no identifica por sí solo una sociedad inscrita. Este documento está pendiente de revisión jurídica.
          </p>

          <h3>2. Tratamiento internacional y proveedores de infraestructura</h3>
          <p>
            La base de datos y el acceso (Neon PostgreSQL y Neon Auth) se alojan en la región de Ohio,
            Estados Unidos. Cloudflare aloja y distribuye la aplicación desde su red global (Workers y Pages),
            procesa las fotos de referencia antes de guardarlas y conserva registros técnicos de las solicitudes
            (por ejemplo, la dirección visitada y los errores), sin el contenido de deseos ni mensajes.
            El tratamiento puede ocurrir fuera de Costa Rica. Google participa
            cuando elegís acceder mediante ese proveedor. El acceso con correo y contraseña lo administra
            Neon Auth; las contraseñas no se guardan en texto plano en los perfiles de Papelito.
            Neon Auth envía los correos transaccionales de acceso y recuperación mediante su proveedor compartido.
            No utilizamos estos correos para publicidad. No vendemos los datos de los participantes.
          </p>

          <h3>3. Finalidad y visibilidad segmentada</h3>
          <p>
            Los datos se tratan exclusivamente para el funcionamiento del intercambio:
          </p>
          <ul>
            <li>Tu cuenta conserva el registro de aceptación de los documentos legales con su versión y fecha.</li>
            <li>Los demás miembros solo ven tu alias y avatar en la lista del evento.</li>
            <li>Tu asignación secreta solo la ves vos. Si participás mediante una persona adulta que te representa, esa persona también puede consultarla, salvo que haya elegido que abrás tu papelito personalmente: en ese caso tu asignación no aparece en su cuenta y la abrís con un enlace personal. Esa persona recibe el enlace para entregártelo; si alguien lo abre antes que vos, tu papelito te muestra cuándo se abrió por primera vez.</li>
            <li>
              Tus deseos seleccionados solo son accesibles para la persona a quien le tocó regalarte.
            </li>
            <li>
              El organizador no tiene facultades para consultar la matriz de resultados en la aplicación.
            </li>
          </ul>

          <h3>4. Ejercicio de derechos ARCO y eliminación</h3>
          <p>
            Si elegís adjuntar una foto a un deseo, se comprime, se eliminan sus metadatos y se guarda
            en la base privada de Papelito en Neon. Solo acceden su propietario, su representante autorizado
            y quien le regala mediante una asignación vigente. Las encuestas guardan un voto por persona;
            la aplicación muestra únicamente los totales y tu propio voto. La representación conserva un alias,
            su vínculo con la cuenta adulta, la fecha de autorización y si esa persona gestiona el papelito o
            se abre personalmente, sin solicitar correo ni fecha de nacimiento. El enlace personal se guarda
            solo como una huella criptográfica que no permite reconstruirlo, junto con su fecha de creación y
            las fechas en que se abrió el papelito; la fecha de la primera apertura se muestra en el papelito
            y quien representa solo ve si ya se abrió. El secreto del enlace no viaja en la dirección que
            recibe el servidor, por lo que no queda en los registros técnicos.
            Si respondés sobre asistencia, guardamos tu opción y fecha; quien organiza ve las respuestas
            individuales y los demás participantes solo los totales. Los cupos conservan una lista de espera
            con el orden de las solicitudes. Si marcás las reglas del grupo como leídas, guardamos la versión
            y la fecha de esa lectura. Las reglas son visibles para quienes ya solicitaron ingresar.
            Estos registros se incluyen en tu exportación personal y se eliminan con la cuenta o el intercambio.
          </p>
          <p>
            Al registrar una passkey guardamos su clave pública, contador, dominio y nombre elegido;
            no recibimos tu huella, rostro, PIN ni la clave privada. Conservamos identificadores de sesión,
            fechas y una descripción aproximada del navegador para administrar tus accesos. Los reportes
            de soporte guardan tu cuenta, el área y la descripción que revisaste antes de enviar.
            Estos datos se incluyen en la exportación personal y se eliminan con la cuenta en la base activa.
          </p>
          <p>
            Si completás tu perfil de gustos, guardamos las preferencias opcionales para mostrarlas solo
            a quien te regala en un sorteo vigente. Las conversaciones entre ambas personas se guardan
            en la base de datos; se oculta la identidad de quien regala dentro de la aplicación, pero no
            existe cifrado de extremo a extremo. Un sorteo nuevo deja inaccesibles sus conversaciones anteriores.
            Para recordatorios optativos guardamos la suscripción y las claves técnicas del dispositivo.
            El proveedor push de tu navegador (por ejemplo, Google, Apple o Mozilla) participa en la entrega.
            Los avisos no incluyen nombres, destinatarios del sorteo ni el contenido de los mensajes.
            Podés desactivarlos en Mi cuenta; los registros de entrega se conservan hasta 30 días.
          </p>
          <p>
            Todo titular puede exportar una copia estructurada de sus datos en formato JSON desde su perfil
            o remitir una solicitud de eliminación. Las solicitudes de eliminación se procesan
            administrativamente. El{' '}
            <a href="https://formatos.inamu.go.cr/SIDOC/DOCS/ley_8968.pdf" target="_blank" rel="noopener noreferrer">artículo 7 de la Ley 8968</a>{' '}
            establece cinco días hábiles, desde su recepción, para resolver lo que corresponda. Registrar
            la solicitud no equivale a haber eliminado la cuenta. La pantalla muestra los intercambios afectados
            y pide una confirmación expresa. Si organizás un grupo activo con otras personas, podés transferirlo
            antes o autorizar su transferencia al participante aprobado más antiguo al enviar la solicitud;
            si solo hay personas pendientes, se cancela. Al procesar la baja se eliminan el acceso y los datos
            personales de la base activa. Los sorteos activos en los que participabas se invalidan, se borran
            sus asignaciones y deben repetirse con los participantes restantes. Los datos propios de las otras
            personas se conservan. Los grupos sin otros participantes se eliminan.
          </p>

          <h3>5. Conservación y respaldos</h3>
          <p>
            Los intercambios finalizados o cancelados se eliminan de la base activa mediante una tarea diaria
            al cumplir {LEGAL_CONSTANTS.RETENTION_MONTHS_AFTER_CLOSE} meses desde su cierre registrado,
            junto con sus invitaciones, participantes y asignaciones. Para cierres anteriores a esta versión,
            el plazo comienza con la migración del 17 de octubre de 2026. Los intercambios activos no se eliminan
            por antigüedad. Tu cuenta y tu lista personal de deseos se conservan hasta que solicites su eliminación.
            La persona organizadora actual puede eliminar un intercambio antes de ese plazo; se borran de la base
            activa sus invitaciones, miembros, sorteos, asignaciones, mensajes, selecciones y reservas de deseos,
            incluidos los datos del grupo correspondientes a otras personas. Las cuentas y listas personales
            permanecen. Una edición vinculada deja de apuntar al intercambio eliminado.
            Los respaldos de los proveedores siguen sus propios ciclos de expiración; una baja en la base activa
            no implica la eliminación instantánea de todas sus copias técnicas.
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
