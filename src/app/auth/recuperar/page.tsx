'use client';

import React, { Suspense, useId, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { RibbonLogo } from '@/components/RibbonLogo';
import { RibbonDivider } from '@/components/RibbonDivider';
import { authClient } from '@/lib/auth/client';
import {
  MIN_PASSWORD_LENGTH,
  buildPasswordResetRedirectTo,
  buildSafeAuthDestination,
  isInvalidRecoveryTokenState,
  mapAuthErrorToSpanish,
  normalizeEmailInput,
  validateEmailInput,
  validatePasswordInput,
} from '@/lib/auth/auth-helpers';

function RecuperarPasswordContent() {
  const searchParams = useSearchParams();
  const formId = useId();

  const rawToken = searchParams.get('token');
  const rawError = searchParams.get('error');
  const rawNext = searchParams.get('next');
  const safeNext = buildSafeAuthDestination(rawNext);

  const initialTokenInvalid = isInvalidRecoveryTokenState({
    token: rawToken,
    error: rawError,
  });

  const [tokenInvalid, setTokenInvalid] = useState(initialTokenInvalid);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(
    rawError?.toUpperCase() === 'INVALID_TOKEN'
      ? 'El enlace de recuperación no es válido o ya expiró. Solicita uno nuevo a continuación.'
      : null
  );
  const [resetCompleted, setResetCompleted] = useState(false);
  const [requestSentMessage, setRequestSentMessage] = useState<string | null>(null);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!rawToken || tokenInvalid) {
      setTokenInvalid(true);
      setErrorMessage('El enlace de recuperación no es válido o ya expiró.');
      return;
    }

    const passErr = validatePasswordInput(newPassword, 'reset');
    if (passErr) {
      setErrorMessage(passErr);
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage('Las contraseñas no coinciden. Verifica que ambas sean idénticas.');
      return;
    }

    if (!authClient) {
      setErrorMessage('El servicio de autenticación no está disponible en este momento.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await authClient.resetPassword({
        newPassword, // Never trim password
        token: rawToken,
      });

      if (res?.error) {
        const mapped = mapAuthErrorToSpanish(res.error, 'reset');
        if (mapped.isInvalidToken) {
          setTokenInvalid(true);
        }
        setErrorMessage(mapped.message);
        setIsSubmitting(false);
        return;
      }

      setResetCompleted(true);
      setIsSubmitting(false);
    } catch (err) {
      const mapped = mapAuthErrorToSpanish(err, 'reset');
      if (mapped.isInvalidToken) {
        setTokenInvalid(true);
      }
      setErrorMessage(mapped.message);
      setIsSubmitting(false);
    }
  };

  const handleRequestNewLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setRequestSentMessage(null);

    const emailErr = validateEmailInput(recoveryEmail);
    if (emailErr) {
      setErrorMessage(emailErr);
      return;
    }

    if (!authClient) {
      setErrorMessage('El servicio de autenticación no está disponible en este momento.');
      return;
    }

    const normalizedEmail = normalizeEmailInput(recoveryEmail);
    const redirectTo = buildPasswordResetRedirectTo(window.location.origin, safeNext);

    setIsSubmitting(true);
    try {
      const res = await authClient.requestPasswordReset({
        email: normalizedEmail,
        redirectTo,
      });

      if (res?.error) {
        const mapped = mapAuthErrorToSpanish(res.error, 'forgot');
        setErrorMessage(mapped.message);
        setIsSubmitting(false);
        return;
      }

      setRequestSentMessage(
        `Si existe una cuenta asociada a ${normalizedEmail}, enviamos un nuevo enlace para establecer tu contraseña.`
      );
      setIsSubmitting(false);
    } catch (err) {
      const mapped = mapAuthErrorToSpanish(err, 'forgot');
      setErrorMessage(mapped.message);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="paper-welcome-card" style={{ maxWidth: '460px', width: '100%' }}>
      <div className="paper-welcome-header">
        <RibbonLogo size="md" />
        <h1 className="paper-welcome-title" style={{ fontSize: '1.55rem', marginTop: '0.5rem' }}>
          {resetCompleted
            ? 'Contraseña actualizada'
            : tokenInvalid
              ? 'Recuperar contraseña'
              : 'Establecer nueva contraseña'}
        </h1>
        <p className="paper-welcome-subtitle">
          {resetCompleted
            ? 'Tu nueva contraseña quedó guardada. Ya puedes iniciar sesión con tu correo.'
            : tokenInvalid
              ? 'Solicita un enlace seguro para definir o restablecer la contraseña de tu cuenta.'
              : 'Elige una contraseña segura de al menos 8 caracteres para tu cuenta de Papelito.'}
        </p>
      </div>

      <RibbonDivider />

      {errorMessage && (
        <div role="alert" className="paper-auth-alert paper-auth-alert-error" style={{ marginBottom: '1rem' }}>
          {errorMessage}
        </div>
      )}

      {requestSentMessage && (
        <div role="status" className="paper-auth-alert paper-auth-alert-success" style={{ marginBottom: '1rem' }}>
          {requestSentMessage}
        </div>
      )}

      {resetCompleted ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', textAlign: 'center' }}>
          <Link
            href={safeNext}
            className="paper-btn-primary"
            style={{ textDecoration: 'none', display: 'inline-flex', width: '100%' }}
          >
            Continuar al acceso →
          </Link>
        </div>
      ) : tokenInvalid ? (
        <form onSubmit={handleRequestNewLink} className="paper-auth-form" noValidate>
          <div className="paper-auth-field">
            <label htmlFor={`${formId}-recovery-email`} className="paper-auth-label">
              Correo electrónico de tu cuenta
            </label>
            <input
              id={`${formId}-recovery-email`}
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              placeholder="tu@correo.com"
              value={recoveryEmail}
              onChange={(e) => {
                setRecoveryEmail(e.target.value);
                if (errorMessage) setErrorMessage(null);
              }}
              disabled={isSubmitting}
              className="paper-auth-input"
            />
          </div>

          <button type="submit" disabled={isSubmitting} className="paper-btn-primary paper-auth-submit">
            {isSubmitting ? 'Enviando enlace...' : 'Enviar enlace de recuperación'}
          </button>

          <div style={{ textAlign: 'center', marginTop: '0.5rem' }}>
            <Link href={safeNext} className="paper-auth-inline-link" style={{ textDecoration: 'none' }}>
              ← Volver al acceso
            </Link>
          </div>
        </form>
      ) : (
        <form onSubmit={handleResetPassword} className="paper-auth-form" noValidate>
          <div className="paper-auth-field">
            <label htmlFor={`${formId}-new-password`} className="paper-auth-label">
              Nueva contraseña (mínimo {MIN_PASSWORD_LENGTH} caracteres)
            </label>
            <div className="paper-auth-password-wrap">
              <input
                id={`${formId}-new-password`}
                name="newPassword"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                required
                minLength={MIN_PASSWORD_LENGTH}
                placeholder="Mínimo 8 caracteres"
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  if (errorMessage) setErrorMessage(null);
                }}
                disabled={isSubmitting}
                className="paper-auth-input paper-auth-input-password"
              />
              <button
                type="button"
                className="paper-auth-password-toggle"
                aria-pressed={showPassword}
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                onClick={() => setShowPassword((prev) => !prev)}
                disabled={isSubmitting}
              >
                {showPassword ? 'Ocultar' : 'Mostrar'}
              </button>
            </div>
          </div>

          <div className="paper-auth-field">
            <label htmlFor={`${formId}-confirm-password`} className="paper-auth-label">
              Confirmar nueva contraseña
            </label>
            <input
              id={`${formId}-confirm-password`}
              name="confirmPassword"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              required
              minLength={MIN_PASSWORD_LENGTH}
              placeholder="Repite tu nueva contraseña"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                if (errorMessage) setErrorMessage(null);
              }}
              disabled={isSubmitting}
              className="paper-auth-input"
            />
          </div>

          <button type="submit" disabled={isSubmitting} className="paper-btn-primary paper-auth-submit">
            {isSubmitting ? 'Guardando contraseña...' : 'Guardar nueva contraseña'}
          </button>

          <div style={{ textAlign: 'center', marginTop: '0.5rem' }}>
            <Link href={safeNext} className="paper-auth-inline-link" style={{ textDecoration: 'none' }}>
              ← Cancelar y volver
            </Link>
          </div>
        </form>
      )}
    </div>
  );
}

export default function RecuperarPasswordPage() {
  return (
    <main className="paper-welcome-shell">
      <Suspense
        fallback={
          <div className="paper-welcome-card" style={{ textAlign: 'center', maxWidth: '460px' }}>
            <strong>Cargando recuperación de acceso...</strong>
          </div>
        }
      >
        <RecuperarPasswordContent />
      </Suspense>
    </main>
  );
}
