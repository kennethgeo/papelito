'use client';

import React, { useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { authClient } from '@/lib/auth/client';
import {
  MIN_PASSWORD_LENGTH,
  OTP_RESEND_COOLDOWN_SECONDS,
  buildAbsoluteCallbackUrl,
  buildPasswordResetRedirectTo,
  buildSafeAuthDestination,
  mapAuthErrorToSpanish,
  normalizeEmailInput,
  validateEmailInput,
  validateNameOrAliasInput,
  validatePasswordInput,
} from '@/lib/auth/auth-helpers';

export type AccessMode = 'signin' | 'signup' | 'forgot' | 'verify-otp';

interface PaperAccessCardProps {
  nextUrl?: string;
  initialMode?: AccessMode;
  compact?: boolean;
}

export const PaperAccessCard: React.FC<PaperAccessCardProps> = ({
  nextUrl = '/',
  initialMode = 'signin',
  compact = false,
}) => {
  const formIdPrefix = useId();
  const safeNext = buildSafeAuthDestination(nextUrl);

  const [mode, setMode] = useState<AccessMode>(initialMode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [otpCode, setOtpCode] = useState('');

  const [loadingAction, setLoadingAction] = useState<'email' | 'google' | 'otp-send' | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [suggestRecoveryActions, setSuggestRecoveryActions] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = window.setInterval(() => {
      setResendCooldown((prev) => (prev > 1 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendCooldown]);

  const switchMode = (targetMode: AccessMode) => {
    setMode(targetMode);
    setPassword('');
    setShowPassword(false);
    setOtpCode('');
    setErrorMessage(null);
    setStatusMessage(null);
    setSuggestRecoveryActions(false);
  };

  const triggerSendOtp = async (targetEmail: string): Promise<boolean> => {
    if (!authClient) {
      setErrorMessage('El servicio de autenticación no está disponible en este momento.');
      setStatusMessage(null);
      return false;
    }
    setLoadingAction('otp-send');
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const res = await authClient.emailOtp.sendVerificationOtp({
        email: targetEmail,
        type: 'email-verification',
      });
      if (res?.error) {
        const mapped = mapAuthErrorToSpanish(res.error, 'otp');
        setErrorMessage(mapped.message);
        return false;
      }
      setResendCooldown(OTP_RESEND_COOLDOWN_SECONDS);
      setStatusMessage(
        `Enviamos un código de verificación a ${targetEmail}. Ingrésalo abajo para continuar.`
      );
      return true;
    } catch (err) {
      const mapped = mapAuthErrorToSpanish(err, 'otp');
      setErrorMessage(mapped.message);
      return false;
    } finally {
      setLoadingAction(null);
    }
  };

  const handleGoogleAccess = async () => {
    setErrorMessage(null);
    setStatusMessage(null);

    if (!authClient) {
      setErrorMessage('El servicio de autenticación no está disponible en este momento.');
      return;
    }

    setLoadingAction('google');
    try {
      const callbackURL = buildAbsoluteCallbackUrl(window.location.origin, safeNext);
      const res = await authClient.signIn.social({
        provider: 'google',
        callbackURL,
      });
      if (res?.error) {
        const mapped = mapAuthErrorToSpanish(res.error, 'google');
        setErrorMessage(mapped.message);
        setLoadingAction(null);
      }
    } catch (err) {
      const mapped = mapAuthErrorToSpanish(err, 'google');
      setErrorMessage(mapped.message);
      setLoadingAction(null);
    }
  };

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setStatusMessage(null);
    setSuggestRecoveryActions(false);

    const emailErr = validateEmailInput(email);
    if (emailErr) {
      setErrorMessage(emailErr);
      return;
    }
    const passErr = validatePasswordInput(password, 'signin');
    if (passErr) {
      setErrorMessage(passErr);
      return;
    }

    if (!authClient) {
      setErrorMessage('El servicio de autenticación no está disponible en este momento.');
      return;
    }

    const normalizedEmail = normalizeEmailInput(email);
    const callbackURL = buildAbsoluteCallbackUrl(window.location.origin, safeNext);
    setLoadingAction('email');

    try {
      const res = await authClient.signIn.email({
        email: normalizedEmail,
        password, // Never trim password
        callbackURL,
      });

      if (res?.error) {
        const mapped = mapAuthErrorToSpanish(res.error, 'signin');
        if (mapped.requiresEmailVerification) {
          setShowPassword(false);
          setMode('verify-otp');
          setLoadingAction(null);
          await triggerSendOtp(normalizedEmail);
          return;
        }
        setSuggestRecoveryActions(mapped.suggestGoogleOrReset);
        setErrorMessage(mapped.message);
        setLoadingAction(null);
        return;
      }

      window.location.assign(safeNext);
    } catch (err) {
      const mapped = mapAuthErrorToSpanish(err, 'signin');
      if (mapped.requiresEmailVerification) {
        setShowPassword(false);
        setMode('verify-otp');
        setLoadingAction(null);
        await triggerSendOtp(normalizedEmail);
        return;
      }
      setSuggestRecoveryActions(mapped.suggestGoogleOrReset);
      setErrorMessage(mapped.message);
      setLoadingAction(null);
    }
  };

  const handleEmailSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setStatusMessage(null);
    setSuggestRecoveryActions(false);

    const nameErr = validateNameOrAliasInput(name);
    if (nameErr) {
      setErrorMessage(nameErr);
      return;
    }
    const emailErr = validateEmailInput(email);
    if (emailErr) {
      setErrorMessage(emailErr);
      return;
    }
    const passErr = validatePasswordInput(password, 'signup');
    if (passErr) {
      setErrorMessage(passErr);
      return;
    }

    if (!authClient) {
      setErrorMessage('El servicio de autenticación no está disponible en este momento.');
      return;
    }

    const normalizedEmail = normalizeEmailInput(email);
    const trimmedName = name.trim();
    const callbackURL = buildAbsoluteCallbackUrl(window.location.origin, safeNext);
    setLoadingAction('email');

    try {
      const res = await authClient.signUp.email({
        name: trimmedName,
        email: normalizedEmail,
        password, // Never trim password
        callbackURL,
      });

      if (res?.error) {
        const mapped = mapAuthErrorToSpanish(res.error, 'signup');
        if (mapped.requiresEmailVerification) {
          setShowPassword(false);
          setMode('verify-otp');
          setLoadingAction(null);
          await triggerSendOtp(normalizedEmail);
          return;
        }
        setSuggestRecoveryActions(mapped.suggestGoogleOrReset);
        setErrorMessage(mapped.message);
        setLoadingAction(null);
        return;
      }

      // Check if session token was returned immediately or if email verification is required
      const tokenReturned = res?.data && 'token' in res.data ? res.data.token : null;
      const emailVerified =
        res?.data && 'user' in res.data && res.data.user
          ? res.data.user.emailVerified
          : true;

      if (!tokenReturned && emailVerified === false) {
        setShowPassword(false);
        setMode('verify-otp');
        setLoadingAction(null);
        await triggerSendOtp(normalizedEmail);
        return;
      }

      window.location.assign(safeNext);
    } catch (err) {
      const mapped = mapAuthErrorToSpanish(err, 'signup');
      if (mapped.requiresEmailVerification) {
        setShowPassword(false);
        setMode('verify-otp');
        setLoadingAction(null);
        await triggerSendOtp(normalizedEmail);
        return;
      }
      setSuggestRecoveryActions(mapped.suggestGoogleOrReset);
      setErrorMessage(mapped.message);
      setLoadingAction(null);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setStatusMessage(null);

    const emailErr = validateEmailInput(email);
    if (emailErr) {
      setErrorMessage(emailErr);
      return;
    }

    if (!authClient) {
      setErrorMessage('El servicio de autenticación no está disponible en este momento.');
      return;
    }

    const normalizedEmail = normalizeEmailInput(email);
    const redirectTo = buildPasswordResetRedirectTo(window.location.origin, safeNext);
    setLoadingAction('email');

    try {
      const res = await authClient.requestPasswordReset({
        email: normalizedEmail,
        redirectTo,
      });

      if (res?.error) {
        const mapped = mapAuthErrorToSpanish(res.error, 'forgot');
        setErrorMessage(mapped.message);
        setLoadingAction(null);
        return;
      }

      setStatusMessage(
        `Si existe una cuenta asociada a ${normalizedEmail}, recibirás un enlace para establecer o recuperar tu contraseña. Si entraste antes con Google, también puedes usar «Continuar con Google».`
      );
      setLoadingAction(null);
    } catch (err) {
      const mapped = mapAuthErrorToSpanish(err, 'forgot');
      setErrorMessage(mapped.message);
      setLoadingAction(null);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setStatusMessage(null);

    const normalizedEmail = normalizeEmailInput(email);
    const emailErr = validateEmailInput(normalizedEmail);
    if (emailErr) {
      setErrorMessage(emailErr);
      return;
    }

    const cleanOtp = otpCode.trim();
    if (cleanOtp.length < 4) {
      setErrorMessage('Ingresa el código de verificación enviado a tu correo.');
      return;
    }

    if (!authClient) {
      setErrorMessage('El servicio de autenticación no está disponible en este momento.');
      return;
    }

    setLoadingAction('email');
    try {
      const res = await authClient.emailOtp.verifyEmail({
        email: normalizedEmail,
        otp: cleanOtp,
      });

      if (res?.error) {
        const mapped = mapAuthErrorToSpanish(res.error, 'otp');
        setErrorMessage(mapped.message);
        setLoadingAction(null);
        return;
      }

      // Check if verifyEmail already established a session
      const verifyToken = res?.data && 'token' in res.data ? res.data.token : null;
      let hasSession = Boolean(verifyToken);

      if (!hasSession) {
        try {
          const sessionRes = await authClient.getSession();
          hasSession = Boolean(sessionRes?.data?.session);
        } catch {
          hasSession = false;
        }
      }

      if (hasSession) {
        window.location.assign(safeNext);
        return;
      }

      // Only attempt signIn.email if verification did not create a session and we have the password
      if (password.length >= MIN_PASSWORD_LENGTH) {
        const callbackURL = buildAbsoluteCallbackUrl(window.location.origin, safeNext);
        const signInRes = await authClient.signIn.email({
          email: normalizedEmail,
          password,
          callbackURL,
        });

        if (signInRes?.error) {
          const mapped = mapAuthErrorToSpanish(signInRes.error, 'signin');
          setErrorMessage(mapped.message);
          setLoadingAction(null);
          return;
        }

        window.location.assign(safeNext);
        return;
      }

      // Verified email but no active session or password in memory: ask user to sign in
      setMode('signin');
      setShowPassword(false);
      setOtpCode('');
      setStatusMessage('Correo verificado correctamente. Ahora inicia sesión con tu contraseña.');
      setLoadingAction(null);
    } catch (err) {
      const mapped = mapAuthErrorToSpanish(err, 'otp');
      setErrorMessage(mapped.message);
      setLoadingAction(null);
    }
  };

  const isBusy = loadingAction !== null;

  return (
    <div className={compact ? 'paper-auth-card paper-auth-card-compact' : 'paper-auth-card'}>
      {/* Mode selector button group for Sign In vs Create Account */}
      {(mode === 'signin' || mode === 'signup') && (
        <div className="paper-auth-tabs" role="group" aria-label="Modo de acceso">
          <button
            type="button"
            aria-pressed={mode === 'signin'}
            className={mode === 'signin' ? 'paper-auth-tab active' : 'paper-auth-tab'}
            onClick={() => {
              if (mode !== 'signin') switchMode('signin');
            }}
            disabled={isBusy}
          >
            Iniciar sesión
          </button>
          <button
            type="button"
            aria-pressed={mode === 'signup'}
            className={mode === 'signup' ? 'paper-auth-tab active' : 'paper-auth-tab'}
            onClick={() => {
              if (mode !== 'signup') switchMode('signup');
            }}
            disabled={isBusy}
          >
            Crear cuenta
          </button>
        </div>
      )}

      {errorMessage && (
        <div role="alert" className="paper-auth-alert paper-auth-alert-error">
          <p style={{ margin: 0 }}>{errorMessage}</p>
          {suggestRecoveryActions && mode !== 'forgot' && (
            <div className="paper-auth-recovery-hints">
              <button
                type="button"
                className="paper-auth-inline-link"
                onClick={() => switchMode('forgot')}
              >
                ¿Olvidaste o quieres crear tu contraseña?
              </button>
            </div>
          )}
        </div>
      )}

      {statusMessage && (
        <div role="status" className="paper-auth-alert paper-auth-alert-success">
          {statusMessage}
        </div>
      )}

      {/* MODE 1: SIGN IN */}
      {mode === 'signin' && (
        <form onSubmit={handleEmailSignIn} className="paper-auth-form" noValidate>
          <div className="paper-auth-field">
            <label htmlFor={`${formIdPrefix}-signin-email`} className="paper-auth-label">
              Correo electrónico
            </label>
            <input
              id={`${formIdPrefix}-signin-email`}
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              placeholder="tu@correo.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (errorMessage) setErrorMessage(null);
              }}
              disabled={isBusy}
              className="paper-auth-input"
            />
          </div>

          <div className="paper-auth-field">
            <div className="paper-auth-label-row">
              <label htmlFor={`${formIdPrefix}-signin-password`} className="paper-auth-label">
                Contraseña
              </label>
              <button
                type="button"
                className="paper-auth-inline-link"
                onClick={() => switchMode('forgot')}
                disabled={isBusy}
              >
                ¿Olvidaste tu contraseña?
              </button>
            </div>
            <div className="paper-auth-password-wrap">
              <input
                id={`${formIdPrefix}-signin-password`}
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                minLength={MIN_PASSWORD_LENGTH}
                placeholder="Tu contraseña"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (errorMessage) setErrorMessage(null);
                }}
                disabled={isBusy}
                className="paper-auth-input paper-auth-input-password"
              />
              <button
                type="button"
                className="paper-auth-password-toggle"
                aria-pressed={showPassword}
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                onClick={() => setShowPassword((prev) => !prev)}
                disabled={isBusy}
              >
                {showPassword ? 'Ocultar' : 'Mostrar'}
              </button>
            </div>
          </div>

          <button type="submit" disabled={isBusy} className="paper-btn-primary paper-auth-submit">
            {loadingAction === 'email' ? 'Iniciando sesión...' : 'Iniciar sesión con correo'}
          </button>
        </form>
      )}

      {/* MODE 2: SIGN UP */}
      {mode === 'signup' && (
        <form onSubmit={handleEmailSignUp} className="paper-auth-form" noValidate>
          <div className="paper-auth-field">
            <label htmlFor={`${formIdPrefix}-signup-name`} className="paper-auth-label">
              Nombre o alias visible
            </label>
            <input
              id={`${formIdPrefix}-signup-name`}
              name="name"
              type="text"
              autoComplete="name"
              required
              maxLength={60}
              placeholder="Ej. Camila o Cami"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (errorMessage) setErrorMessage(null);
              }}
              disabled={isBusy}
              className="paper-auth-input"
            />
          </div>

          <div className="paper-auth-field">
            <label htmlFor={`${formIdPrefix}-signup-email`} className="paper-auth-label">
              Correo electrónico
            </label>
            <input
              id={`${formIdPrefix}-signup-email`}
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              placeholder="tu@correo.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (errorMessage) setErrorMessage(null);
              }}
              disabled={isBusy}
              className="paper-auth-input"
            />
          </div>

          <div className="paper-auth-field">
            <label htmlFor={`${formIdPrefix}-signup-password`} className="paper-auth-label">
              Contraseña (mínimo {MIN_PASSWORD_LENGTH} caracteres)
            </label>
            <div className="paper-auth-password-wrap">
              <input
                id={`${formIdPrefix}-signup-password`}
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                required
                minLength={MIN_PASSWORD_LENGTH}
                placeholder="Crea una contraseña segura"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (errorMessage) setErrorMessage(null);
                }}
                disabled={isBusy}
                className="paper-auth-input paper-auth-input-password"
              />
              <button
                type="button"
                className="paper-auth-password-toggle"
                aria-pressed={showPassword}
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                onClick={() => setShowPassword((prev) => !prev)}
                disabled={isBusy}
              >
                {showPassword ? 'Ocultar' : 'Mostrar'}
              </button>
            </div>
          </div>

          <button type="submit" disabled={isBusy} className="paper-btn-primary paper-auth-submit">
            {loadingAction === 'email' ? 'Creando cuenta...' : 'Crear cuenta con correo'}
          </button>
        </form>
      )}

      {/* MODE 3: FORGOT PASSWORD */}
      {mode === 'forgot' && (
        <form onSubmit={handleForgotPassword} className="paper-auth-form" noValidate>
          <div className="paper-auth-subview-header">
            <h3 className="paper-auth-subview-title">Recuperar o definir contraseña</h3>
            <p className="paper-auth-subview-desc">
              Ingresa tu correo electrónico y te enviaremos un enlace seguro para establecer una nueva contraseña.
            </p>
          </div>

          <div className="paper-auth-field">
            <label htmlFor={`${formIdPrefix}-forgot-email`} className="paper-auth-label">
              Correo electrónico
            </label>
            <input
              id={`${formIdPrefix}-forgot-email`}
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              placeholder="tu@correo.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (errorMessage) setErrorMessage(null);
              }}
              disabled={isBusy}
              className="paper-auth-input"
            />
          </div>

          <button type="submit" disabled={isBusy} className="paper-btn-primary paper-auth-submit">
            {loadingAction === 'email' ? 'Enviando enlace...' : 'Enviar enlace de recuperación'}
          </button>

          <button
            type="button"
            className="paper-btn-secondary paper-auth-back-btn"
            onClick={() => switchMode('signin')}
            disabled={isBusy}
          >
            ← Volver a iniciar sesión
          </button>
        </form>
      )}

      {/* MODE 4: CONDITIONAL EMAIL OTP VERIFICATION */}
      {mode === 'verify-otp' && (
        <form onSubmit={handleVerifyOtp} className="paper-auth-form" noValidate>
          <div className="paper-auth-subview-header">
            <h3 className="paper-auth-subview-title">Verifica tu correo electrónico</h3>
            <p className="paper-auth-subview-desc">
              Ingresa el código de verificación enviado a <strong>{normalizeEmailInput(email)}</strong>.
            </p>
          </div>

          <div className="paper-auth-field">
            <label htmlFor={`${formIdPrefix}-otp-code`} className="paper-auth-label">
              Código de verificación
            </label>
            <input
              id={`${formIdPrefix}-otp-code`}
              name="otp"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              maxLength={10}
              placeholder="Ej. 123456"
              value={otpCode}
              onChange={(e) => {
                setOtpCode(e.target.value);
                if (errorMessage) setErrorMessage(null);
              }}
              disabled={isBusy}
              className="paper-auth-input paper-auth-input-otp"
            />
          </div>

          <button type="submit" disabled={isBusy} className="paper-btn-primary paper-auth-submit">
            {loadingAction === 'email' ? 'Verificando código...' : 'Confirmar código y entrar'}
          </button>

          <div className="paper-auth-otp-actions">
            <button
              type="button"
              className="paper-auth-inline-link"
              disabled={isBusy || resendCooldown > 0}
              onClick={() => triggerSendOtp(normalizeEmailInput(email))}
            >
              {resendCooldown > 0
                ? `Reenviar código en ${resendCooldown} s`
                : 'Reenviar código al correo'}
            </button>

            <button
              type="button"
              className="paper-auth-inline-link"
              disabled={isBusy}
              onClick={() => switchMode('signin')}
            >
              Volver a iniciar sesión
            </button>
          </div>
        </form>
      )}

      {/* Google OAuth divider & button (available in signin and signup modes) */}
      {(mode === 'signin' || mode === 'signup') && (
        <>
          <div className="paper-auth-divider" role="separator" aria-label="O continúa con Google">
            <span>o también puedes</span>
          </div>

          <button
            type="button"
            onClick={handleGoogleAccess}
            disabled={isBusy}
            className="paper-btn-google"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24z"
              />
              <path
                fill="#FBBC05"
                d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96z"
              />
            </svg>
            {loadingAction === 'google' ? 'Conectando con Google...' : 'Continuar con Google'}
          </button>
        </>
      )}

      {/* Non-blocking legal links footer (consent is requested only once after authentication if missing) */}
      <p className="paper-auth-legal-note">
        Podés consultar nuestros <Link href="/terminos">Términos</Link>,{' '}
        <Link href="/privacidad">Privacidad</Link> y{' '}
        <Link href="/consentimiento">Consentimiento Informado</Link>. Tu aceptación queda guardada en tu cuenta.
      </p>
    </div>
  );
};
