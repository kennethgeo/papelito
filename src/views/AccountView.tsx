'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useOptionalDemoData } from '@/context/DemoDataContext';
import { useOptionalRealData } from '@/context/RealDataContext';
import { RibbonDivider } from '@/components/RibbonDivider';

export const AccountView: React.FC = () => {
  const realData = useOptionalRealData();
  const demoData = useOptionalDemoData();

  // If in real mode
  const isReal = !!realData;

  const currentAlias = isReal ? (realData.user?.alias || '') : (demoData?.userProfile.alias || '');
  const currentFullName = isReal ? (realData.user?.fullName || '') : (demoData?.userProfile.fullName || '');
  const currentEmail = isReal ? (realData.user?.email || '') : (demoData?.userProfile.email || '');
  const currentAvatarColor = isReal ? (realData.user?.avatarColor || '#46245D') : (demoData?.userProfile.avatarColor || '#46245D');

  const [alias, setAlias] = useState(currentAlias);
  const [isSaved, setIsSaved] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Privacy requests state
  const [deleteRequested, setDeleteRequested] = useState(false);
  const [deleteNotes, setDeleteNotes] = useState('');
  const [showDeleteForm, setShowDeleteForm] = useState(false);
  const [exported, setExported] = useState(false);

  const handleSaveAlias = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!alias.trim()) return;
    setSaveError('');

    if (isReal && realData) {
      const ok = await realData.updateUserAlias(alias.trim());
      if (!ok) {
        setSaveError('No se pudo guardar el alias en el servidor.');
        return;
      }
    } else if (demoData) {
      demoData.updateProfileAlias(alias.trim());
    }

    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  const handleExportData = async () => {
    setSaveError('');
    let exportPayload: unknown;

    if (isReal && realData) {
      try {
        exportPayload = await realData.exportAllUserData();
        await realData.submitPrivacyRequest('export');
      } catch {
        setSaveError('Error al exportar los datos desde el servidor.');
        return;
      }
    } else {
      exportPayload = {
        exportedAt: new Date().toISOString(),
        accountType: 'demo',
        profile: {
          alias,
          fullName: currentFullName,
          email: currentEmail,
        },
        exchanges: demoData?.exchanges.map((e) => ({ id: e.id, name: e.name, eventDate: e.eventDate })),
        wishes: demoData?.userWishes,
      };
    }

    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `papelito-mis-datos-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setExported(true);
    setTimeout(() => setExported(false), 3000);
  };

  const [deleteError, setDeleteError] = useState('');
  const [consentMsg, setConsentMsg] = useState('');

  const handleRequestDeletion = async (e: React.FormEvent) => {
    e.preventDefault();
    setDeleteError('');
    if (isReal && realData) {
      const ok = await realData.submitPrivacyRequest('delete', deleteNotes);
      if (!ok) {
        setDeleteError('No se pudo registrar la solicitud de eliminación en el servidor. Inténtalo de nuevo.');
        return;
      }
    }
    setDeleteRequested(true);
    setShowDeleteForm(false);
  };

  const handleRevokeConsent = async () => {
    if (!isReal || !realData) return;
    setConsentMsg('');
    const ok = await realData.revokeUserConsent();
    if (ok) {
      setConsentMsg('Consentimiento revocado. Para volver a operar intercambios o deseos deberás otorgarlo nuevamente.');
    } else {
      setConsentMsg('No se pudo revocar el consentimiento en el servidor.');
    }
  };

  return (
    <div
      className="account-page animate-fade-in"
      style={{
        maxWidth: '560px',
        margin: '0 auto',
        padding: '1.25rem 1rem 5rem 1rem',
      }}
    >
      <h1
        style={{
          fontFamily: 'var(--font-heading)',
          fontSize: '1.75rem',
          fontWeight: 800,
          color: 'var(--color-tinta)',
          margin: '0 0 0.25rem 0',
          lineHeight: 1.15,
        }}
      >
        Mi cuenta
      </h1>

      <p
        style={{
          fontSize: '0.85rem',
          color: 'var(--text-secondary)',
          margin: '0 0 1.5rem 0',
        }}
      >
        Gestión de tu perfil visible y derechos de privacidad
      </p>

      {/* Profile Card */}
      <div
        className="profile-card"
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '20px',
          border: '1px solid var(--border-subtle)',
          padding: '1.35rem',
          boxShadow: '0 4px 16px rgba(70, 36, 93, 0.05)',
          marginBottom: '1.5rem',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.85rem',
            marginBottom: '1.25rem',
          }}
        >
          <div
            style={{
              width: '52px',
              height: '52px',
              borderRadius: '50%',
              backgroundColor: currentAvatarColor,
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'var(--font-heading)',
              fontSize: '1.4rem',
              fontWeight: 800,
              flexShrink: 0,
            }}
          >
            {alias.charAt(0) || 'U'}
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <strong style={{ fontSize: '1.15rem', color: 'var(--color-tinta)' }}>
                {currentFullName}
              </strong>
              {!isReal && (
                <span
                  style={{
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    backgroundColor: '#FEF3D6',
                    color: '#7A5200',
                    padding: '0.15rem 0.45rem',
                    borderRadius: '6px',
                  }}
                >
                  Datos de ejemplo
                </span>
              )}
            </div>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', display: 'block' }}>
              {currentEmail}
            </span>
          </div>
        </div>

        {/* Alias Edit Form */}
        <form onSubmit={handleSaveAlias}>
          <label
            htmlFor="user-alias"
            style={{
              display: 'block',
              fontSize: '0.84rem',
              fontWeight: 700,
              color: 'var(--color-tinta)',
              marginBottom: '0.35rem',
            }}
          >
            Nombre o alias visible para otros participantes:
          </label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              id="user-alias"
              type="text"
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              style={{
                flex: 1,
                padding: '0.75rem',
                borderRadius: '12px',
                border: '1.5px solid var(--border-subtle)',
                fontSize: '0.95rem',
                fontFamily: 'var(--font-body)',
              }}
            />
            <button
              type="submit"
              style={{
                backgroundColor: isSaved ? '#276749' : 'var(--color-tinta)',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '12px',
                padding: '0.75rem 1.15rem',
                fontWeight: 700,
                fontSize: '0.88rem',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'background-color 0.15s ease',
              }}
            >
              {isSaved ? '✓ Guardado' : 'Actualizar'}
            </button>
          </div>
          {saveError && (
            <div role="alert" style={{ color: '#C53030', fontSize: '0.8rem', marginTop: '0.4rem', fontWeight: 600 }}>
              {saveError}
            </div>
          )}
          <small
            style={{
              display: 'block',
              fontSize: '0.75rem',
              color: 'var(--text-secondary)',
              marginTop: '0.35rem',
              lineHeight: 1.35,
            }}
          >
            Este es el único nombre que verán los demás participantes en los intercambios. Tu correo
            permanece privado.
          </small>
        </form>
      </div>

      {/* ARCO Rights: Export & Deletion Request */}
      <div
        className="privacy-rights-card"
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '20px',
          border: '1px solid var(--border-subtle)',
          padding: '1.35rem',
          boxShadow: '0 4px 16px rgba(70, 36, 93, 0.05)',
          marginBottom: '1.5rem',
        }}
      >
        <h2
          style={{
            fontFamily: 'var(--font-heading)',
            fontSize: '1.18rem',
            fontWeight: 800,
            color: 'var(--color-tinta)',
            margin: '0 0 0.5rem 0',
          }}
        >
          Tus datos y derechos de privacidad (Costa Rica)
        </h2>

        <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.45, margin: '0 0 1rem 0' }}>
          De conformidad con la Ley 8968, puedes descargar una copia íntegra de tu información o
          registrar una solicitud formal de eliminación de cuenta.
        </p>

        <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          {/* Export Data */}
          <button
            onClick={handleExportData}
            style={{
              flex: 1,
              minHeight: '42px',
              backgroundColor: 'var(--surface-subtle)',
              color: 'var(--color-tinta)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '12px',
              fontSize: '0.85rem',
              fontWeight: 700,
              cursor: 'pointer',
              padding: '0.5rem 0.85rem',
            }}
          >
            {exported ? '✓ Archivo JSON descargado' : '📥 Exportar mis datos (JSON)'}
          </button>

          {/* Request Deletion */}
          {!deleteRequested && (
            <button
              onClick={() => setShowDeleteForm(!showDeleteForm)}
              style={{
                flex: 1,
                minHeight: '42px',
                backgroundColor: '#FFF5F5',
                color: '#C53030',
                border: '1px solid #FEB2B2',
                borderRadius: '12px',
                fontSize: '0.85rem',
                fontWeight: 700,
                cursor: 'pointer',
                padding: '0.5rem 0.85rem',
              }}
            >
              Solicitar eliminación
            </button>
          )}
        </div>

        {/* Deletion Form */}
        {showDeleteForm && !deleteRequested && (
          <form
            onSubmit={handleRequestDeletion}
            style={{
              backgroundColor: '#FFF5F5',
              border: '1px solid #FEB2B2',
              borderRadius: '14px',
              padding: '1rem',
              marginTop: '0.75rem',
            }}
          >
            <strong style={{ display: 'block', fontSize: '0.88rem', color: '#9B1C1C', marginBottom: '0.35rem' }}>
              Confirmación de solicitud de supresión
            </strong>
            <p style={{ fontSize: '0.8rem', color: '#7F1D1D', lineHeight: 1.4, margin: '0 0 0.75rem 0' }}>
              Al pulsar «Enviar solicitud», se registrará tu petición en el sistema. Si formas parte de un
              intercambio con sorteo ya completado, tu salida requiere coordinación previa con el
              organizador para no alterar la asignación del grupo.
            </p>
            <textarea
              rows={2}
              placeholder="Motivo o aclaración (opcional)"
              value={deleteNotes}
              onChange={(e) => setDeleteNotes(e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem',
                borderRadius: '8px',
                border: '1px solid #FEB2B2',
                fontSize: '0.85rem',
                marginBottom: '0.75rem',
              }}
            />
            {deleteError && (
              <div role="alert" style={{ color: '#C53030', fontSize: '0.8rem', marginBottom: '0.6rem', fontWeight: 600 }}>
                {deleteError}
              </div>
            )}
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="submit"
                style={{
                  backgroundColor: '#C53030',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '10px',
                  padding: '0.5rem 1rem',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Confirmar y enviar solicitud
              </button>
              <button
                type="button"
                onClick={() => setShowDeleteForm(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#7F1D1D',
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
            </div>
          </form>
        )}

        {deleteRequested && (
          <div
            style={{
              backgroundColor: '#FEF3D6',
              border: '1px solid #F6E05E',
              borderRadius: '12px',
              padding: '0.85rem',
              fontSize: '0.82rem',
              color: '#744210',
              lineHeight: 1.45,
            }}
          >
            ⏳ <strong>Solicitud de eliminación registrada:</strong> Se ha guardado tu solicitud
            administrativa. El artículo 7 de la Ley 8968 establece cinco días hábiles, desde la recepción,
            para resolver lo que corresponda. La cuenta aún no se ha eliminado.
          </div>
        )}

        {isReal && realData && (
          <div
            style={{
              marginTop: '1rem',
              paddingTop: '0.85rem',
              borderTop: '1px dashed var(--border-subtle)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '0.5rem',
            }}
          >
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Estado de consentimiento ({realData.consentVersion}):{' '}
              <strong style={{ color: realData.hasConsented ? '#276749' : '#9B1C1C' }}>
                {realData.hasConsented ? 'Vigente' : 'Pendiente / Revocado'}
              </strong>
            </div>
            {realData.hasConsented && (
              <button
                type="button"
                onClick={handleRevokeConsent}
                style={{
                  background: 'none',
                  border: '1px solid #FEB2B2',
                  color: '#C53030',
                  borderRadius: '8px',
                  padding: '0.35rem 0.65rem',
                  fontSize: '0.76rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Revocar consentimiento
              </button>
            )}
            {consentMsg && (
              <div style={{ width: '100%', fontSize: '0.78rem', color: 'var(--color-tinta)', marginTop: '0.25rem' }}>
                {consentMsg}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Legal documents list */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '20px',
          border: '1px solid var(--border-subtle)',
          padding: '1.25rem',
          boxShadow: '0 4px 16px rgba(70, 36, 93, 0.05)',
          marginBottom: '1.5rem',
        }}
      >
        <h2
          style={{
            fontFamily: 'var(--font-heading)',
            fontSize: '1.15rem',
            fontWeight: 800,
            color: 'var(--color-tinta)',
            margin: '0 0 0.75rem 0',
          }}
        >
          Documentación legal y avisos
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <Link
            href="/terminos"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0.65rem 0.85rem',
              backgroundColor: 'var(--surface-subtle)',
              borderRadius: '10px',
              color: 'var(--color-tinta)',
              textDecoration: 'none',
              fontSize: '0.85rem',
              fontWeight: 600,
            }}
          >
            <span>Términos y Condiciones del Servicio</span>
            <span aria-hidden="true">→</span>
          </Link>

          <Link
            href="/privacidad"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0.65rem 0.85rem',
              backgroundColor: 'var(--surface-subtle)',
              borderRadius: '10px',
              color: 'var(--color-tinta)',
              textDecoration: 'none',
              fontSize: '0.85rem',
              fontWeight: 600,
            }}
          >
            <span>Política de Privacidad (Ley 8968)</span>
            <span aria-hidden="true">→</span>
          </Link>

          <Link
            href="/consentimiento"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0.65rem 0.85rem',
              backgroundColor: 'var(--surface-subtle)',
              borderRadius: '10px',
              color: 'var(--color-tinta)',
              textDecoration: 'none',
              fontSize: '0.85rem',
              fontWeight: 600,
            }}
          >
            <span>Aviso de Consentimiento Informado</span>
            <span aria-hidden="true">→</span>
          </Link>

          <Link
            href="/almacenamiento"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0.65rem 0.85rem',
              backgroundColor: 'var(--surface-subtle)',
              borderRadius: '10px',
              color: 'var(--color-tinta)',
              textDecoration: 'none',
              fontSize: '0.85rem',
              fontWeight: 600,
            }}
          >
            <span>Cookies y Almacenamiento Local</span>
            <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>

      <RibbonDivider />

      {/* Sign Out or Reset Demo */}
      {isReal ? (
        <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
          <form action="/auth/logout" method="POST">
            <button
              type="submit"
              style={{
                width: '100%',
                minHeight: '46px',
                backgroundColor: 'var(--surface-subtle)',
                color: '#C53030',
                border: '1px solid #FEB2B2',
                borderRadius: '14px',
                fontSize: '0.92rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Cerrar sesión de {currentEmail}
            </button>
          </form>
        </div>
      ) : (
        /* Demo Reset Card */
        <div
          style={{
            backgroundColor: '#FFF5F5',
            border: '1px solid #FEB2B2',
            borderRadius: '20px',
            padding: '1.25rem',
            marginTop: '1rem',
          }}
        >
          <h3
            style={{
              fontFamily: 'var(--font-heading)',
              fontSize: '1.1rem',
              fontWeight: 800,
              color: '#9B1C1C',
              margin: '0 0 0.35rem 0',
            }}
          >
            Control de datos de demostración
          </h3>

          <p
            style={{
              fontSize: '0.82rem',
              color: '#7F1D1D',
              lineHeight: 1.4,
              margin: '0 0 1rem 0',
            }}
          >
            Permite restablecer los intercambios, deseos y revelaciones de prueba al estado inicial
            limpio del navegador:
          </p>

          {!showResetConfirm ? (
            <button
              onClick={() => setShowResetConfirm(true)}
              style={{
                backgroundColor: '#C53030',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '12px',
                padding: '0.65rem 1.15rem',
                fontSize: '0.85rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Restablecer datos de demostración
            </button>
          ) : (
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <button
                onClick={() => {
                  demoData?.resetDemoData();
                  setShowResetConfirm(false);
                }}
                style={{
                  backgroundColor: '#9B1C1C',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '12px',
                  padding: '0.65rem 1rem',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Sí, reiniciar demo
              </button>
              <button
                onClick={() => setShowResetConfirm(false)}
                style={{
                  backgroundColor: 'transparent',
                  color: '#7F1D1D',
                  border: '1px solid #FEB2B2',
                  borderRadius: '12px',
                  padding: '0.65rem 1rem',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
