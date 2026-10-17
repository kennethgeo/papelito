import { getSafeInternalRedirect } from '@/lib/security/urls';

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;
export const OTP_RESEND_COOLDOWN_SECONDS = 60;

export type AuthFlowContext = 'signin' | 'signup' | 'forgot' | 'reset' | 'otp' | 'google';

export interface NormalizedAuthError {
  code: string;
  message: string;
  requiresEmailVerification: boolean;
  isInvalidToken: boolean;
  suggestGoogleOrReset: boolean;
}

/**
 * Normalizes an email address for authentication requests.
 */
export function normalizeEmailInput(email: string): string {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

/**
 * Validates an email address and returns a Spanish error message or null if valid.
 */
export function validateEmailInput(email: string): string | null {
  const normalized = normalizeEmailInput(email);
  if (!normalized) {
    return 'Ingresa tu correo electrónico.';
  }
  if (normalized.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    return 'Ingresa un correo electrónico válido (ejemplo: nombre@dominio.com).';
  }
  return null;
}

/**
 * Validates a password without trimming or mutating its characters.
 * Enforces the Neon Auth / Better Auth minimum of 8 characters.
 */
export function validatePasswordInput(
  password: string,
  mode: 'signin' | 'signup' | 'reset' = 'signin'
): string | null {
  if (typeof password !== 'string' || password.length === 0) {
    return mode === 'reset' ? 'Ingresa tu nueva contraseña.' : 'Ingresa tu contraseña.';
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`;
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return `La contraseña no puede superar los ${MAX_PASSWORD_LENGTH} caracteres.`;
  }
  return null;
}

/**
 * Validates a user's visible name / alias for account creation.
 */
export function validateNameOrAliasInput(name: string): string | null {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (trimmed.length < 2 || trimmed.length > 60) {
    return 'Ingresa tu nombre o alias visible (entre 2 y 60 caracteres).';
  }
  return null;
}

/**
 * Returns a strictly validated internal path (e.g. "/" or "/unirse/abc").
 */
export function buildSafeAuthDestination(nextUrl: unknown): string {
  return getSafeInternalRedirect(nextUrl, '/');
}

/**
 * Builds an absolute callback URL on the current origin for OAuth / Neon Auth redirects.
 */
export function buildAbsoluteCallbackUrl(origin: string, nextUrl?: unknown): string {
  const cleanOrigin = origin.replace(/\/+$/, '');
  const safeNext = buildSafeAuthDestination(nextUrl);
  return `${cleanOrigin}${safeNext}`;
}

/**
 * Builds the absolute redirectTo URL for password recovery emails,
 * preserving a safe internal destination if different from "/".
 */
export function buildPasswordResetRedirectTo(origin: string, nextUrl?: unknown): string {
  const cleanOrigin = origin.replace(/\/+$/, '');
  const safeNext = buildSafeAuthDestination(nextUrl);
  if (safeNext && safeNext !== '/') {
    return `${cleanOrigin}/auth/recuperar?next=${encodeURIComponent(safeNext)}`;
  }
  return `${cleanOrigin}/auth/recuperar`;
}

/**
 * Determines whether the password reset page received an invalid/expired token state.
 */
export function isInvalidRecoveryTokenState(params: {
  token?: string | null;
  error?: string | null;
}): boolean {
  const errorVal = typeof params.error === 'string' ? params.error.trim() : '';
  const tokenVal = typeof params.token === 'string' ? params.token.trim() : '';
  if (errorVal.toUpperCase() === 'INVALID_TOKEN') {
    return true;
  }
  if (!tokenVal || tokenVal.toUpperCase() === 'INVALID_TOKEN') {
    return true;
  }
  return false;
}

function extractRawErrorFields(raw: unknown): {
  code: string;
  message: string;
  status: number;
} {
  if (!raw) {
    return { code: '', message: '', status: 0 };
  }

  if (typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    const nested =
      obj.error && typeof obj.error === 'object'
        ? (obj.error as Record<string, unknown>)
        : obj;

    const code = typeof nested.code === 'string' ? nested.code : '';
    const message =
      typeof nested.message === 'string'
        ? nested.message
        : typeof obj.message === 'string'
          ? obj.message
          : '';
    const status =
      typeof nested.status === 'number'
        ? nested.status
        : typeof obj.status === 'number'
          ? obj.status
          : 0;
    return { code, message, status };
  }

  if (typeof raw === 'string') {
    return { code: '', message: raw, status: 0 };
  }

  return { code: '', message: String(raw), status: 0 };
}

/**
 * Normalizes Neon Auth / Better Auth errors into clear Spanish messages and actionable UI flags.
 */
export function mapAuthErrorToSpanish(
  rawError: unknown,
  context: AuthFlowContext = 'signin'
): NormalizedAuthError {
  const { code, message, status } = extractRawErrorFields(rawError);
  const upperCode = code.toUpperCase();
  const lowerCode = code.toLowerCase();
  const lowerMessage = message.toLowerCase();

  // 1. Rate limiting (prioritized before OTP or other checks so HTTP 429 is never masked)
  if (
    status === 429 ||
    upperCode === 'TOO_MANY_ATTEMPTS' ||
    lowerCode.includes('rate_limit') ||
    lowerMessage.includes('rate limit') ||
    lowerMessage.includes('too many requests') ||
    lowerMessage.includes('too many attempts')
  ) {
    return {
      code: code || 'RATE_LIMIT',
      message: 'Has realizado demasiados intentos seguidos. Espera un momento antes de volver a intentarlo.',
      requiresEmailVerification: false,
      isInvalidToken: false,
      suggestGoogleOrReset: false,
    };
  }

  // 2. Email verification required (OTP flow)
  if (
    upperCode === 'EMAIL_NOT_VERIFIED' ||
    lowerCode === 'email_not_confirmed' ||
    (lowerMessage.includes('email') &&
      (lowerMessage.includes('not verified') ||
        lowerMessage.includes('not confirmed') ||
        lowerMessage.includes('verification required')))
  ) {
    return {
      code: code || 'EMAIL_NOT_VERIFIED',
      message:
        'Tu correo electrónico aún no está verificado. Ingresa el código enviado a tu correo para activar el acceso.',
      requiresEmailVerification: true,
      isInvalidToken: false,
      suggestGoogleOrReset: false,
    };
  }

  // 3. Invalid or expired recovery/session token
  if (
    upperCode === 'INVALID_TOKEN' ||
    lowerCode === 'bad_jwt' ||
    lowerMessage.includes('invalid token') ||
    lowerMessage.includes('expired token') ||
    lowerMessage.includes('invalid or expired')
  ) {
    return {
      code: code || 'INVALID_TOKEN',
      message:
        'El enlace de recuperación no es válido o ya expiró. Solicita un nuevo enlace para establecer tu contraseña.',
      requiresEmailVerification: false,
      isInvalidToken: true,
      suggestGoogleOrReset: false,
    };
  }

  // 4. Invalid credentials or Google-only account without password
  if (
    upperCode === 'INVALID_EMAIL_OR_PASSWORD' ||
    upperCode === 'INVALID_PASSWORD' ||
    lowerCode === 'invalid_credentials' ||
    upperCode === 'CREDENTIAL_ACCOUNT_NOT_FOUND' ||
    upperCode === 'ACCOUNT_NOT_FOUND' ||
    lowerCode === 'identity_not_found' ||
    lowerMessage.includes('invalid email or password') ||
    lowerMessage.includes('invalid password') ||
    lowerMessage.includes('credential account not found')
  ) {
    return {
      code: code || 'INVALID_CREDENTIALS',
      message:
        'Correo o contraseña incorrectos. Si entraste antes con Google, usa «Continuar con Google» o selecciona «¿Olvidaste tu contraseña?» para crear una clave.',
      requiresEmailVerification: false,
      isInvalidToken: false,
      suggestGoogleOrReset: true,
    };
  }

  // 5. Existing user during sign up
  if (
    upperCode === 'USER_ALREADY_EXISTS' ||
    lowerCode === 'user_already_exists' ||
    lowerCode === 'email_exists' ||
    lowerMessage.includes('user already exists') ||
    lowerMessage.includes('already registered')
  ) {
    return {
      code: code || 'USER_ALREADY_EXISTS',
      message:
        'Ya existe una cuenta con este correo electrónico. Inicia sesión con tu contraseña o usa «Continuar con Google».',
      requiresEmailVerification: false,
      isInvalidToken: false,
      suggestGoogleOrReset: true,
    };
  }

  // 6. Password too long (checked before generic weak_password)
  if (
    upperCode === 'PASSWORD_TOO_LONG' ||
    lowerMessage.includes('password too long') ||
    lowerMessage.includes('password is too long')
  ) {
    return {
      code: code || 'PASSWORD_TOO_LONG',
      message: `La contraseña no puede superar los ${MAX_PASSWORD_LENGTH} caracteres.`,
      requiresEmailVerification: false,
      isInvalidToken: false,
      suggestGoogleOrReset: false,
    };
  }

  // 7. Password too short / weak password
  if (
    upperCode === 'PASSWORD_TOO_SHORT' ||
    lowerCode === 'weak_password' ||
    lowerMessage.includes('password too short') ||
    lowerMessage.includes('password is too short')
  ) {
    return {
      code: code || 'WEAK_PASSWORD',
      message: `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`,
      requiresEmailVerification: false,
      isInvalidToken: false,
      suggestGoogleOrReset: false,
    };
  }

  // 8. OTP invalid or expired
  if (
    upperCode === 'INVALID_OTP' ||
    upperCode === 'OTP_EXPIRED' ||
    lowerMessage.includes('invalid otp') ||
    lowerMessage.includes('otp expired') ||
    lowerMessage.includes('verification code')
  ) {
    return {
      code: code || 'INVALID_OTP',
      message:
        'El código de verificación no es válido o ya expiró. Revisa tu correo o solicita un código nuevo.',
      requiresEmailVerification: true,
      isInvalidToken: false,
      suggestGoogleOrReset: false,
    };
  }

  // 8. Network / fetch errors
  if (
    lowerMessage.includes('failed to fetch') ||
    lowerMessage.includes('networkerror') ||
    lowerMessage.includes('network request failed')
  ) {
    return {
      code: 'NETWORK_ERROR',
      message: 'No pudimos conectar con el servidor. Revisa tu conexión a internet e inténtalo de nuevo.',
      requiresEmailVerification: false,
      isInvalidToken: false,
      suggestGoogleOrReset: false,
    };
  }

  // Context-specific fallback
  const fallbackByContext: Record<AuthFlowContext, string> = {
    signin: 'No se pudo iniciar sesión. Verifica tus datos e inténtalo nuevamente.',
    signup: 'No se pudo crear la cuenta. Verifica tus datos e inténtalo nuevamente.',
    forgot: 'No pudimos procesar la solicitud de recuperación en este momento. Inténtalo de nuevo.',
    reset: 'No se pudo actualizar la contraseña. Solicita un nuevo enlace e inténtalo nuevamente.',
    otp: 'No se pudo verificar el código. Inténtalo nuevamente.',
    google: 'No se pudo conectar con Google. Inténtalo nuevamente.',
  };

  return {
    code: code || 'UNKNOWN_AUTH_ERROR',
    message: fallbackByContext[context],
    requiresEmailVerification: false,
    isInvalidToken: false,
    suggestGoogleOrReset: false,
  };
}
