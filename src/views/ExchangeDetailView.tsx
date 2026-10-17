'use client';

import React, { useState } from 'react';
import { useOptionalDemoData } from '@/context/DemoDataContext';
import { useOptionalRealData } from '@/context/RealDataContext';
import { THEME_CONFIG } from '@/lib/theme';
import { ThemeKey, Participant } from '@/types';
import { RibbonDivider } from '@/components/RibbonDivider';

export const ExchangeDetailView: React.FC = () => {
  const real = useOptionalRealData();
  const demo = useOptionalDemoData();
  const currentExchange = real ? real.currentExchange : (demo?.currentExchange || null);
  const navigateTo = real ? real.navigateTo : (demo?.navigateTo || (() => {}));

  const [copied, setCopied] = useState(false);
  const [regeneratingLink, setRegeneratingLink] = useState(false);
  const [showThemeModal, setShowThemeModal] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawError, setDrawError] = useState('');

  // Redraw state
  const [showRedrawForm, setShowRedrawForm] = useState(false);
  const [redrawReason, setRedrawReason] = useState('');

  // Exclusions state
  const [selectedGiverId, setSelectedGiverId] = useState('');
  const [selectedReceiverId, setSelectedReceiverId] = useState('');
  const [mutualExclusion, setMutualExclusion] = useState(true);
  const [savingExclusion, setSavingExclusion] = useState(false);
  const [exclusionError, setExclusionError] = useState('');
  const [demoExclusions, setDemoExclusions] = useState<Array<{ giverId: string; receiverId: string }>>([]);

  const updateExchangeTheme = async (id: string, theme: ThemeKey) => {
    if (real) {
      await real.updateExchangeTheme(id, theme);
    } else if (demo) {
      demo.updateExchangeTheme(id, theme);
    }
  };

  const handleExecuteDraw = async () => {
    if (!currentExchange) return;
    setIsDrawing(true);
    setDrawError('');
    if (real) {
      const res = await real.executeDraw(currentExchange.id);
      if (!res.success) {
        setDrawError(res.error || 'Error al ejecutar el sorteo.');
      }
    } else if (demo) {
      demo.revealAssignment(currentExchange.id);
    }
    setIsDrawing(false);
  };

  const handleRedraw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentExchange || !real) return;
    if (!redrawReason.trim()) {
      setDrawError('Debes indicar un motivo válido para repetir el sorteo.');
      return;
    }
    setIsDrawing(true);
    setDrawError('');
    const res = await real.executeDraw(currentExchange.id, redrawReason.trim());
    setIsDrawing(false);
    if (!res.success) {
      setDrawError(res.error || 'No se pudo repetir el sorteo.');
    } else {
      setRedrawReason('');
      setShowRedrawForm(false);
    }
  };

  if (!currentExchange) {
    return (
      <div style={{ padding: '2rem 1rem', textAlign: 'center' }}>
        <p>No se encontró el intercambio seleccionado.</p>
        <button
          onClick={() => navigateTo('intercambios_lista')}
          style={{
            padding: '0.65rem 1.25rem',
            backgroundColor: 'var(--color-frambuesa)',
            color: '#FFFFFF',
            border: 'none',
            borderRadius: '12px',
            cursor: 'pointer',
          }}
        >
          Volver a intercambios
        </button>
      </div>
    );
  }

  const themeMeta = THEME_CONFIG[currentExchange.selectedTheme as ThemeKey] || THEME_CONFIG.general;
  const memberStatus = currentExchange.currentUserMemberStatus || 'approved';
  const isApprovedMember = memberStatus === 'approved';

  const approvedParticipants = (currentExchange.participants || []).filter(
    (p) => (p.status || 'approved') === 'approved'
  );

  const activeExclusions = real
    ? (currentExchange.exclusions || [])
    : demoExclusions;

  const formatCurrency = (amount: number, currency: string) => {
    if (currency === 'CRC') {
      return `₡${amount.toLocaleString('es-CR')}`;
    }
    return `$${amount.toLocaleString('en-US')}`;
  };

  const handleCopyInviteLink = () => {
    if (!currentExchange.inviteCode) return;
    const link = `${window.location.origin}/unirse/${currentExchange.inviteCode}`;
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(link).catch(() => {});
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleRegenerateInviteLink = async () => {
    if (!real) return;
    setRegeneratingLink(true);
    await real.regenerateInviteLink(currentExchange.id);
    setRegeneratingLink(false);
  };

  const handleAddExclusion = async (e: React.FormEvent) => {
    e.preventDefault();
    setExclusionError('');
    if (!selectedGiverId || !selectedReceiverId) {
      setExclusionError('Selecciona ambas personas para crear la restricción.');
      return;
    }
    if (selectedGiverId === selectedReceiverId) {
      setExclusionError('Cada participante ya está excluido de regalarse a sí mismo.');
      return;
    }

    const nextRules = activeExclusions.map((r) => ({
      giverUserId: r.giverId,
      excludedReceiverUserId: r.receiverId,
    }));

    const addPair = (g: string, rec: string) => {
      if (!nextRules.some((r) => r.giverUserId === g && r.excludedReceiverUserId === rec)) {
        nextRules.push({ giverUserId: g, excludedReceiverUserId: rec });
      }
    };

    addPair(selectedGiverId, selectedReceiverId);
    if (mutualExclusion) {
      addPair(selectedReceiverId, selectedGiverId);
    }

    if (real) {
      setSavingExclusion(true);
      const ok = await real.saveExclusions(currentExchange.id, nextRules);
      setSavingExclusion(false);
      if (!ok) {
        setExclusionError('No se pudo guardar la restricción en el servidor.');
        return;
      }
    } else {
      setDemoExclusions(
        nextRules.map((r) => ({ giverId: r.giverUserId, receiverId: r.excludedReceiverUserId }))
      );
    }

    setSelectedGiverId('');
    setSelectedReceiverId('');
  };

  const handleRemoveExclusion = async (giverId: string, receiverId: string) => {
    setExclusionError('');
    const nextRules = activeExclusions
      .filter((r) => !(r.giverId === giverId && r.receiverId === receiverId))
      .map((r) => ({
        giverUserId: r.giverId,
        excludedReceiverUserId: r.receiverId,
      }));

    if (real) {
      setSavingExclusion(true);
      await real.saveExclusions(currentExchange.id, nextRules);
      setSavingExclusion(false);
    } else {
      setDemoExclusions(
        nextRules.map((r) => ({ giverId: r.giverUserId, receiverId: r.excludedReceiverUserId }))
      );
    }
  };

  const getParticipantAlias = (userId: string) => {
    return currentExchange.participants.find((p) => p.id === userId)?.alias || userId;
  };

  return (
    <div
      className="exchange-detail-page animate-fade-in"
      style={{
        maxWidth: '560px',
        margin: '0 auto',
        padding: '1rem 1rem 5rem 1rem',
      }}
    >
      <button
        onClick={() => navigateTo('intercambios_lista')}
        className="btn-back"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.4rem',
          background: 'none',
          border: 'none',
          color: 'var(--text-secondary)',
          fontSize: '0.9rem',
          fontWeight: 600,
          cursor: 'pointer',
          padding: '0.5rem 0',
          marginBottom: '0.75rem',
        }}
      >
        ← Volver a mis intercambios
      </button>

      {/* Main Themed Header Card */}
      <div
        className="exchange-hero-box"
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '24px',
          border: `2px solid ${themeMeta.accentColor}33`,
          boxShadow: '0 8px 30px rgba(70, 36, 93, 0.07)',
          overflow: 'hidden',
          marginBottom: '1.5rem',
        }}
      >
        {/* Themed ribbon top bar */}
        <div
          style={{
            backgroundColor: themeMeta.accentColor,
            color: '#FFFFFF',
            padding: '1.15rem 1.25rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.5rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span
              style={{
                fontSize: '0.74rem',
                fontWeight: 800,
                textTransform: 'none',
                letterSpacing: '0.06em',
                backgroundColor: 'rgba(255, 255, 255, 0.2)',
                padding: '0.2rem 0.6rem',
                borderRadius: '999px',
              }}
            >
              {themeMeta.label}
            </span>
          </div>

          {/* Organizer theme switch button */}
          {currentExchange.isCurrentUserOrganizer && currentExchange.status !== 'sorteado' && (
            <button
              onClick={() => setShowThemeModal(true)}
              style={{
                background: 'rgba(255, 255, 255, 0.25)',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '8px',
                fontSize: '0.74rem',
                fontWeight: 700,
                padding: '0.25rem 0.55rem',
                cursor: 'pointer',
              }}
            >
              Cambiar tema ✎
            </button>
          )}
        </div>

        {/* Card Body */}
        <div style={{ padding: '1.35rem' }}>
          <h1
            style={{
              fontFamily: 'var(--font-heading)',
              fontSize: '1.65rem',
              fontWeight: 800,
              color: 'var(--color-tinta)',
              margin: '0 0 0.45rem 0',
              lineHeight: 1.2,
            }}
          >
            {currentExchange.name}
          </h1>

          <p
            style={{
              fontSize: '0.9rem',
              color: 'var(--text-secondary)',
              lineHeight: 1.45,
              margin: '0 0 1.25rem 0',
            }}
          >
            {currentExchange.description}
          </p>

          {/* Key Metrics grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '0.75rem',
              backgroundColor: 'var(--surface-subtle)',
              borderRadius: '16px',
              padding: '1rem',
              marginBottom: '1.25rem',
            }}
          >
            <div>
              <span
                style={{
                  display: 'block',
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                  textTransform: 'none',
                }}
              >
                Fecha de entrega
              </span>
              <strong style={{ fontSize: '1rem', color: 'var(--color-tinta)' }}>
                {currentExchange.eventDate}
              </strong>
            </div>

            <div>
              <span
                style={{
                  display: 'block',
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                  textTransform: 'none',
                }}
              >
                Presupuesto
              </span>
              <strong style={{ fontSize: '1.05rem', color: 'var(--color-tinta)' }}>
                {formatCurrency(currentExchange.budgetAmount, currentExchange.currency)}
              </strong>
            </div>

            <div>
              <span
                style={{
                  display: 'block',
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                  textTransform: 'none',
                }}
              >
                Cierre inscripción
              </span>
              <span style={{ fontSize: '0.9rem', color: 'var(--color-tinta)', fontWeight: 600 }}>
                {currentExchange.registrationDeadline}
              </span>
            </div>

            <div>
              <span
                style={{
                  display: 'block',
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                  textTransform: 'none',
                }}
              >
                Organizador
              </span>
              <span style={{ fontSize: '0.9rem', color: 'var(--color-tinta)', fontWeight: 600 }}>
                {currentExchange.isCurrentUserOrganizer ? 'Tú eres el organizador' : currentExchange.organizerName}
              </span>
            </div>
          </div>

          {/* Pending / Rejected Member Notice */}
          {!isApprovedMember ? (
            <div
              role="status"
              style={{
                padding: '1rem',
                borderRadius: '14px',
                backgroundColor: memberStatus === 'pending' ? '#FEF3D6' : '#FFF5F5',
                border: `1px solid ${memberStatus === 'pending' ? '#F6E05E' : '#FEB2B2'}`,
                color: memberStatus === 'pending' ? '#7A5200' : '#9B1C1C',
                fontSize: '0.88rem',
                lineHeight: 1.45,
              }}
            >
              {memberStatus === 'pending' ? (
                <>
                  <strong>⏳ Solicitud pendiente de aprobación:</strong> La persona organizadora (
                  {currentExchange.organizerName}) debe aprobar tu ingreso antes de que puedas participar en el sorteo y compartir deseos.
                </>
              ) : (
                <>
                  <strong>Participación no aprobada:</strong> Tu solicitud de ingreso a este intercambio fue rechazada por la persona organizadora.
                </>
              )}
            </div>
          ) : currentExchange.status === 'sorteado' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              <button
                onClick={() => navigateTo('asignacion_revelar', currentExchange.id)}
                className="btn-primary"
                style={{
                  width: '100%',
                  minHeight: '48px',
                  backgroundColor: 'var(--color-frambuesa)',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '16px',
                  fontSize: '1.02rem',
                  fontWeight: 700,
                  fontFamily: 'var(--font-heading)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  boxShadow: '0 4px 14px rgba(112, 67, 162, 0.28)',
                }}
              >
                <span>Ver a quién regalo</span>
              </button>

              {currentExchange.isCurrentUserOrganizer && real && (
                <div style={{ marginTop: '0.25rem' }}>
                  {!showRedrawForm ? (
                    <button
                      type="button"
                      onClick={() => setShowRedrawForm(true)}
                      style={{
                        width: '100%',
                        padding: '0.55rem',
                        backgroundColor: 'var(--surface-subtle)',
                        color: 'var(--color-tinta)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '12px',
                        fontSize: '0.82rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      Repetir sorteo (requiere motivo)
                    </button>
                  ) : (
                    <form
                      onSubmit={handleRedraw}
                      style={{
                        backgroundColor: '#FFFDF5',
                        border: '1px solid #FEF3D6',
                        padding: '0.85rem',
                        borderRadius: '12px',
                        marginTop: '0.35rem',
                      }}
                    >
                      <label
                        style={{
                          display: 'block',
                          fontSize: '0.8rem',
                          fontWeight: 700,
                          color: '#7A5200',
                          marginBottom: '0.35rem',
                        }}
                      >
                        Motivo de invalidación del sorteo actual (v{currentExchange.currentDrawVersion || 1}):
                      </label>
                      <input
                        type="text"
                        placeholder="Ej. Se sumó un familiar de último minuto"
                        value={redrawReason}
                        onChange={(e) => setRedrawReason(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '0.55rem 0.75rem',
                          borderRadius: '8px',
                          border: '1px solid #CBD5E1',
                          fontSize: '0.85rem',
                          marginBottom: '0.5rem',
                        }}
                      />
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          type="submit"
                          disabled={isDrawing}
                          style={{
                            flex: 1,
                            padding: '0.5rem',
                            backgroundColor: 'var(--color-frambuesa)',
                            color: '#FFFFFF',
                            border: 'none',
                            borderRadius: '8px',
                            fontSize: '0.82rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          {isDrawing ? 'Sorteando...' : 'Confirmar nuevo sorteo'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowRedrawForm(false)}
                          style={{
                            padding: '0.5rem 0.75rem',
                            backgroundColor: 'transparent',
                            color: 'var(--text-secondary)',
                            border: 'none',
                            fontSize: '0.82rem',
                            cursor: 'pointer',
                          }}
                        >
                          Cancelar
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )}

              {drawError && (
                <div role="alert" style={{ color: '#C53030', fontSize: '0.82rem', fontWeight: 600 }}>
                  {drawError}
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              {currentExchange.isCurrentUserOrganizer && (
                <button
                  disabled={approvedParticipants.length < currentExchange.minParticipants || isDrawing}
                  onClick={handleExecuteDraw}
                  style={{
                    width: '100%',
                    minHeight: '48px',
                    backgroundColor:
                      approvedParticipants.length < currentExchange.minParticipants
                        ? '#CBD5E1'
                        : 'var(--color-frambuesa)',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '16px',
                    fontSize: '0.96rem',
                    fontWeight: 700,
                    fontFamily: 'var(--font-heading)',
                    cursor:
                      approvedParticipants.length < currentExchange.minParticipants
                        ? 'not-allowed'
                        : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.45rem',
                  }}
                >
                  <span>{isDrawing ? 'Realizando sorteo...' : '🎲 Realizar sorteo del amigo secreto'}</span>
                </button>
              )}

              {drawError && (
                <div role="alert" style={{ color: '#C53030', fontSize: '0.82rem', fontWeight: 600 }}>
                  {drawError}
                </div>
              )}

              <button
                onClick={() => navigateTo('deseos_lista')}
                style={{
                  width: '100%',
                  minHeight: '48px',
                  backgroundColor: 'var(--color-tinta)',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '16px',
                  fontSize: '0.96rem',
                  fontWeight: 700,
                  fontFamily: 'var(--font-heading)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.45rem',
                }}
              >
                <span>⭐ Mi lista de deseos para este intercambio</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Share Invitation Section (Organizer Only in Real Mode) */}
      {isApprovedMember && (currentExchange.isCurrentUserOrganizer || Boolean(demo)) && (
        <div
          className="invite-box"
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '20px',
            border: '1px solid var(--border-subtle)',
            padding: '1.25rem',
            boxShadow: '0 4px 16px rgba(70, 36, 93, 0.04)',
            marginBottom: '1.5rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.35rem' }}>
            <h3
              style={{
                fontFamily: 'var(--font-heading)',
                fontSize: '1.15rem',
                fontWeight: 800,
                color: 'var(--color-tinta)',
                margin: 0,
              }}
            >
              Invitar participantes
            </h3>
            {real && currentExchange.isCurrentUserOrganizer && currentExchange.status === 'inscripcion_abierta' && (
              <button
                type="button"
                onClick={handleRegenerateInviteLink}
                disabled={regeneratingLink}
                style={{
                  background: 'none',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '8px',
                  padding: '0.25rem 0.6rem',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  color: 'var(--color-tinta)',
                  cursor: 'pointer',
                }}
              >
                {regeneratingLink ? 'Renovando...' : '↻ Renovar enlace'}
              </button>
            )}
          </div>

          <p
            style={{
              fontSize: '0.85rem',
              color: 'var(--text-secondary)',
              margin: '0 0 0.85rem 0',
              lineHeight: 1.4,
            }}
          >
            Comparte el enlace seguro para que las personas confirmen su nombre y deseos.
            {currentExchange.requiresApproval && ' (Requiere tu aprobación al unirse).'}
          </p>

          {currentExchange.inviteCode ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <div
                style={{
                  flex: 1,
                  backgroundColor: 'var(--surface-subtle)',
                  borderRadius: '12px',
                  padding: '0.65rem 0.85rem',
                  fontSize: '0.85rem',
                  color: 'var(--color-tinta)',
                  fontWeight: 600,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                /unirse/{currentExchange.inviteCode}
              </div>

              <button
                onClick={handleCopyInviteLink}
                style={{
                  backgroundColor: copied ? '#276749' : 'var(--color-tinta)',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '12px',
                  padding: '0.65rem 1rem',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'background-color 0.15s ease',
                }}
              >
                {copied ? '✓ Copiado' : 'Copiar enlace'}
              </button>
            </div>
          ) : (
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: 0 }}>
              No hay un enlace activo disponible. Pulsa «Renovar enlace» para generar uno nuevo.
            </p>
          )}
        </div>
      )}

      {isApprovedMember && (
        <>
          <RibbonDivider />

          {/* Participants List */}
          <div className="participants-box" style={{ marginTop: '1.25rem' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '0.85rem',
              }}
            >
              <div>
                <h3
                  style={{
                    fontFamily: 'var(--font-heading)',
                    fontSize: '1.2rem',
                    fontWeight: 800,
                    color: 'var(--color-tinta)',
                    margin: '0 0 0.15rem 0',
                  }}
                >
                  Participantes aprobados ({approvedParticipants.length})
                </h3>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  Mínimo requerido: {currentExchange.minParticipants} personas
                </span>
              </div>

              {approvedParticipants.length < currentExchange.minParticipants && (
                <span
                  style={{
                    backgroundColor: '#FEF3D6',
                    color: '#7A5200',
                    fontSize: '0.74rem',
                    fontWeight: 700,
                    padding: '0.2rem 0.6rem',
                    borderRadius: '999px',
                  }}
                >
                  Faltan participantes
                </span>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              {(currentExchange.participants || []).map((p: Participant) => {
                const pStatus = p.status || 'approved';
                return (
                  <div
                    key={p.id}
                    style={{
                      backgroundColor: '#FFFFFF',
                      borderRadius: '16px',
                      border: '1px solid var(--border-subtle)',
                      padding: '0.85rem 1rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '0.75rem',
                      opacity: pStatus === 'rejected' ? 0.65 : 1,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                      <div
                        style={{
                          width: '36px',
                          height: '36px',
                          borderRadius: '50%',
                          backgroundColor: p.avatarColor,
                          color: '#FFFFFF',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 700,
                          fontSize: '0.9rem',
                        }}
                      >
                        {p.alias.charAt(0)}
                      </div>

                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                          <strong style={{ fontSize: '0.92rem', color: 'var(--color-tinta)' }}>
                            {p.alias}
                          </strong>
                          {p.isOrganizer && (
                            <span
                              style={{
                                fontSize: '0.68rem',
                                fontWeight: 700,
                                backgroundColor: '#EDE5F5',
                                color: '#46245D',
                                padding: '0.1rem 0.4rem',
                                borderRadius: '6px',
                              }}
                            >
                              Organizador
                            </span>
                          )}
                          {pStatus === 'pending' && (
                            <span
                              style={{
                                fontSize: '0.68rem',
                                fontWeight: 700,
                                backgroundColor: '#FEF3D6',
                                color: '#7A5200',
                                padding: '0.1rem 0.4rem',
                                borderRadius: '6px',
                              }}
                            >
                              Pendiente
                            </span>
                          )}
                          {pStatus === 'rejected' && (
                            <span
                              style={{
                                fontSize: '0.68rem',
                                fontWeight: 700,
                                backgroundColor: '#FFF5F5',
                                color: '#C53030',
                                padding: '0.1rem 0.4rem',
                                borderRadius: '6px',
                              }}
                            >
                              Rechazado
                            </span>
                          )}
                        </div>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          Unido el {p.joinedAt}
                        </span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {currentExchange.isCurrentUserOrganizer &&
                      !p.isOrganizer &&
                      currentExchange.status !== 'sorteado' &&
                      (pStatus === 'pending' || pStatus === 'rejected') ? (
                        <div style={{ display: 'flex', gap: '0.35rem' }}>
                          <button
                            onClick={() => real?.manageMember(p.id, 'approved')}
                            style={{
                              padding: '0.25rem 0.65rem',
                              backgroundColor: '#276749',
                              color: '#FFFFFF',
                              border: 'none',
                              borderRadius: '8px',
                              fontSize: '0.74rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                          >
                            Aprobar
                          </button>
                          {pStatus === 'pending' && (
                            <button
                              onClick={() => real?.manageMember(p.id, 'rejected')}
                              style={{
                                padding: '0.25rem 0.65rem',
                                backgroundColor: '#C53030',
                                color: '#FFFFFF',
                                border: 'none',
                                borderRadius: '8px',
                                fontSize: '0.74rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                              }}
                            >
                              Rechazar
                            </button>
                          )}
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <span
                            style={{
                              fontSize: '0.74rem',
                              fontWeight: 600,
                              backgroundColor: p.isReady ? '#F0FFF4' : '#FFFDF5',
                              color: p.isReady ? '#276749' : '#7A5200',
                              border: `1px solid ${p.isReady ? '#C6F6D5' : '#FEF3D6'}`,
                              padding: '0.2rem 0.55rem',
                              borderRadius: '999px',
                            }}
                          >
                            {p.isReady ? `✓ ${p.wishCount || 1} deseo(s)` : 'Sin deseos aún'}
                          </span>
                          {currentExchange.isCurrentUserOrganizer &&
                            !p.isOrganizer &&
                            currentExchange.status !== 'sorteado' &&
                            real && (
                              <button
                                onClick={() => real.manageMember(p.id, 'rejected')}
                                title="Retirar del sorteo"
                                style={{
                                  background: 'none',
                                  border: '1px solid #FEB2B2',
                                  color: '#C53030',
                                  borderRadius: '8px',
                                  padding: '0.2rem 0.45rem',
                                  fontSize: '0.72rem',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                }}
                              >
                                Quitar
                              </button>
                            )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Organizer Exclusions Section */}
          {currentExchange.isCurrentUserOrganizer && currentExchange.status === 'inscripcion_abierta' && (
            <div
              className="exclusions-box"
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: '20px',
                border: '1px solid var(--border-subtle)',
                padding: '1.25rem',
                marginTop: '1.5rem',
                boxShadow: '0 4px 16px rgba(70, 36, 93, 0.04)',
              }}
            >
              <h3
                style={{
                  fontFamily: 'var(--font-heading)',
                  fontSize: '1.12rem',
                  fontWeight: 800,
                  color: 'var(--color-tinta)',
                  margin: '0 0 0.35rem 0',
                }}
              >
                Restricciones del sorteo (opcional)
              </h3>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0 0 0.85rem 0', lineHeight: 1.4 }}>
                Evita que parejas o personas específicas se regalen entre sí durante el sorteo.
              </p>

              <form onSubmit={handleAddExclusion} style={{ marginBottom: '1rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <select
                    aria-label="Persona que regala"
                    value={selectedGiverId}
                    onChange={(e) => setSelectedGiverId(e.target.value)}
                    style={{
                      padding: '0.6rem',
                      borderRadius: '10px',
                      border: '1px solid var(--border-subtle)',
                      fontSize: '0.84rem',
                      backgroundColor: '#FFFFFF',
                    }}
                  >
                    <option value="">Quién regala...</option>
                    {approvedParticipants.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.alias}
                      </option>
                    ))}
                  </select>

                  <select
                    aria-label="Persona excluida"
                    value={selectedReceiverId}
                    onChange={(e) => setSelectedReceiverId(e.target.value)}
                    style={{
                      padding: '0.6rem',
                      borderRadius: '10px',
                      border: '1px solid var(--border-subtle)',
                      fontSize: '0.84rem',
                      backgroundColor: '#FFFFFF',
                    }}
                  >
                    <option value="">No regala a...</option>
                    {approvedParticipants.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.alias}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: 'var(--color-tinta)', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={mutualExclusion}
                      onChange={(e) => setMutualExclusion(e.target.checked)}
                    />
                    <span>Exclusión mutua (ambos sentidos)</span>
                  </label>

                  <button
                    type="submit"
                    disabled={savingExclusion}
                    style={{
                      backgroundColor: 'var(--color-tinta)',
                      color: '#FFFFFF',
                      border: 'none',
                      borderRadius: '10px',
                      padding: '0.45rem 0.85rem',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {savingExclusion ? 'Guardando...' : '+ Añadir restricción'}
                  </button>
                </div>
              </form>

              {exclusionError && (
                <div role="alert" style={{ color: '#C53030', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.65rem' }}>
                  {exclusionError}
                </div>
              )}

              {activeExclusions.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {activeExclusions.map((rule) => (
                    <div
                      key={`${rule.giverId}-${rule.receiverId}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.5rem 0.75rem',
                        backgroundColor: 'var(--surface-subtle)',
                        borderRadius: '10px',
                        fontSize: '0.82rem',
                      }}
                    >
                      <span>
                        <strong>{getParticipantAlias(rule.giverId)}</strong> no regala a{' '}
                        <strong>{getParticipantAlias(rule.receiverId)}</strong>
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveExclusion(rule.giverId, rule.receiverId)}
                        disabled={savingExclusion}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#C53030',
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        Quitar
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: 0 }}>
                  No hay restricciones configuradas para este intercambio.
                </p>
              )}
            </div>
          )}
        </>
      )}

      {/* Modal for manual theme change by organizer */}
      {showThemeModal && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(70, 36, 93, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            zIndex: 100,
          }}
        >
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '20px',
              padding: '1.5rem',
              maxWidth: '440px',
              width: '100%',
              boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
            }}
          >
            <h3
              style={{
                fontFamily: 'var(--font-heading)',
                fontSize: '1.25rem',
                fontWeight: 800,
                color: 'var(--color-tinta)',
                margin: '0 0 0.5rem 0',
              }}
            >
              Cambiar tema visual
            </h3>

            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0 0 1rem 0' }}>
              Elige el tema festivo para este intercambio. Solo el organizador puede modificarlo
              antes del sorteo.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.25rem' }}>
              {(Object.keys(THEME_CONFIG) as ThemeKey[]).map((tk) => {
                const m = THEME_CONFIG[tk];
                const active = currentExchange.selectedTheme === tk;
                return (
                  <button
                    key={tk}
                    onClick={() => {
                      void updateExchangeTheme(currentExchange.id, tk);
                      setShowThemeModal(false);
                    }}
                    style={{
                      textAlign: 'left',
                      padding: '0.75rem 1rem',
                      borderRadius: '12px',
                      border: active ? '2px solid var(--color-frambuesa)' : '1px solid var(--border-subtle)',
                      backgroundColor: active ? m.bgSubtle : '#FFFFFF',
                      cursor: 'pointer',
                    }}
                  >
                    <strong style={{ display: 'block', fontSize: '0.9rem', color: 'var(--color-tinta)' }}>
                      {m.label}
                    </strong>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      {m.tagline}
                    </span>
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => setShowThemeModal(false)}
              style={{
                width: '100%',
                padding: '0.65rem',
                backgroundColor: 'var(--surface-subtle)',
                color: 'var(--color-tinta)',
                border: 'none',
                borderRadius: '12px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
