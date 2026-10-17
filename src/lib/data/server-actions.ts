'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { getServerSession } from '@/lib/auth/server';
import { isDatabaseConfigured } from '@/lib/db/client';
import {
  createExchangeWithInvitation,
  regenerateExchangeInvitation,
  getMyExchanges,
  getExchangeDetails,
  manageMemberStatus,
  updateExchangeTheme,
  setExchangeExclusions,
  acceptInvitationAtomic,
  getInvitationPreview,
  type CreateExchangeInput,
} from '@/lib/repositories/exchanges';
import { executeAndCommitDraw } from '@/lib/repositories/draw';
import {
  getMyWishes,
  saveWish,
  deleteWish,
  toggleWishInExchange,
  type SaveWishInput,
} from '@/lib/repositories/wishes';
import {
  getMyAssignment,
  revealAssignment,
  toggleWishPurchase,
} from '@/lib/repositories/assignments';
import {
  getOrCreateProfile,
  updateProfileAlias,
  recordConsent,
  getLatestConsentStatus,
  submitPrivacyRequest,
  exportUserData,
} from '@/lib/repositories/profiles';
import { LEGAL_CONSTANTS } from '@/lib/legal/constants';
import {
  PENDING_CONSENT_COOKIE,
  consumePendingConsentIntent,
  revokeConsentAndClearCookie,
} from '@/lib/legal/consent-flow';

export interface ActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

const VALID_THEMES = new Set(['navidad', 'amistad', 'cumpleanos', 'general']);
const VALID_CURRENCIES = new Set(['CRC', 'USD']);
const VALID_PRIORITIES = new Set(['alta', 'media', 'baja']);
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function sanitizeErrorMessage(err: unknown, fallback: string): string {
  if (!(err instanceof Error)) return fallback;
  const msg = err.message;
  // Filter out raw PostgreSQL / driver internal diagnostics
  if (
    msg.includes('syntax error') ||
    msg.includes('relation "') ||
    msg.includes('violates foreign key') ||
    msg.includes('violates check constraint') ||
    msg.includes('duplicate key value')
  ) {
    return fallback;
  }
  return msg;
}

function validateIsoDate(dateStr: unknown): dateStr is string {
  if (typeof dateStr !== 'string' || !ISO_DATE_REGEX.test(dateStr)) return false;
  const parsed = new Date(`${dateStr}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(dateStr);
}

function validateCreateExchange(input: CreateExchangeInput): string | null {
  if (!input || typeof input !== 'object') return 'Datos de intercambio inválidos.';
  if (typeof input.name !== 'string' || input.name.trim().length < 2 || input.name.trim().length > 100) {
    return 'El nombre del intercambio debe tener entre 2 y 100 caracteres.';
  }
  if (input.description !== undefined && (typeof input.description !== 'string' || input.description.length > 500)) {
    return 'La descripción no puede superar los 500 caracteres.';
  }
  if (!validateIsoDate(input.eventDate)) {
    return 'La fecha del evento no tiene un formato válido (YYYY-MM-DD).';
  }
  if (!validateIsoDate(input.registrationDeadline)) {
    return 'La fecha límite de inscripción no tiene un formato válido (YYYY-MM-DD).';
  }
  if (input.registrationDeadline > input.eventDate) {
    return 'El cierre de inscripción no puede ser posterior a la fecha del intercambio.';
  }
  if (
    typeof input.budgetAmount !== 'number' ||
    !Number.isFinite(input.budgetAmount) ||
    input.budgetAmount <= 0 ||
    input.budgetAmount > 100_000_000
  ) {
    return 'El presupuesto debe ser un monto numérico válido mayor a cero.';
  }
  if (!VALID_CURRENCIES.has(input.currency)) {
    return 'Moneda no admitida (use CRC o USD).';
  }
  if (!VALID_THEMES.has(input.suggestedTheme) || !VALID_THEMES.has(input.selectedTheme)) {
    return 'Tema festivo inválido.';
  }
  if (typeof input.requiresApproval !== 'boolean') {
    return 'El indicador de aprobación es inválido.';
  }
  return null;
}

function validateSaveWish(input: SaveWishInput): string | null {
  if (!input || typeof input !== 'object') return 'Datos de deseo inválidos.';
  if (typeof input.title !== 'string' || input.title.trim().length < 1 || input.title.trim().length > 150) {
    return 'El título del deseo debe tener entre 1 y 150 caracteres.';
  }
  if (input.description !== undefined && (typeof input.description !== 'string' || input.description.length > 500)) {
    return 'La descripción no puede superar los 500 caracteres.';
  }
  if (input.url !== undefined && input.url.trim().length > 0) {
    try {
      const parsed = new URL(input.url.trim());
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return 'El enlace del deseo debe comenzar con http:// o https://.';
      }
    } catch {
      return 'El enlace ingresado no es una URL válida.';
    }
  }
  if (input.approximatePrice !== undefined && input.approximatePrice !== null) {
    if (
      typeof input.approximatePrice !== 'number' ||
      !Number.isFinite(input.approximatePrice) ||
      input.approximatePrice < 0 ||
      input.approximatePrice > 100_000_000
    ) {
      return 'El precio aproximado debe ser un número válido no negativo.';
    }
  }
  if (input.currency !== undefined && !VALID_CURRENCIES.has(input.currency)) {
    return 'Moneda inválida.';
  }
  if (input.priority !== undefined && !VALID_PRIORITIES.has(input.priority)) {
    return 'Prioridad inválida.';
  }
  return null;
}

async function requireAuth() {
  if (!isDatabaseConfigured()) {
    throw new Error('El almacenamiento en la nube no está configurado en este entorno.');
  }

  const session = await getServerSession();
  if (!session || !session.user) {
    throw new Error('Debes iniciar sesión para realizar esta acción.');
  }

  // Ensure user profile exists idempotently
  await getOrCreateProfile(session.user.id, session.user.email, session.user.name, session.user.avatarColor);

  return session.user;
}

async function requireConsentedUser() {
  const user = await requireAuth();
  const cookieStore = await cookies();
  const status = await consumePendingConsentIntent(user.id, cookieStore);
  if (status.hasCurrentConsent) {
    return user;
  }

  throw new Error('Debes confirmar el consentimiento informado vigente para realizar esta acción.');
}

export async function createExchangeAction(
  formData: CreateExchangeInput
): Promise<ActionResult<{ exchangeId: string; inviteToken: string }>> {
  try {
    const validationErr = validateCreateExchange(formData);
    if (validationErr) return { success: false, error: validationErr };

    const user = await requireConsentedUser();
    const result = await createExchangeWithInvitation(user.id, formData);
    revalidatePath('/');
    return { success: true, data: result };
  } catch (err: unknown) {
    return { success: false, error: sanitizeErrorMessage(err, 'Error al crear el intercambio.') };
  }
}

export async function regenerateInvitationAction(
  exchangeId: string
): Promise<ActionResult<{ inviteToken: string }>> {
  try {
    if (!exchangeId || typeof exchangeId !== 'string') {
      return { success: false, error: 'Identificador de intercambio inválido.' };
    }
    const user = await requireConsentedUser();
    const result = await regenerateExchangeInvitation(exchangeId, user.id);
    revalidatePath('/');
    return { success: true, data: result };
  } catch (err: unknown) {
    return { success: false, error: sanitizeErrorMessage(err, 'Error al renovar el enlace de invitación.') };
  }
}

export async function getMyExchangesAction(): Promise<ActionResult<Awaited<ReturnType<typeof getMyExchanges>>>> {
  try {
    const user = await requireAuth();
    const exchanges = await getMyExchanges(user.id);
    return { success: true, data: exchanges };
  } catch (err: unknown) {
    return { success: false, error: sanitizeErrorMessage(err, 'Error al obtener tus intercambios.') };
  }
}

export async function getExchangeDetailsAction(
  exchangeId: string
): Promise<ActionResult<Awaited<ReturnType<typeof getExchangeDetails>>>> {
  try {
    if (!exchangeId || typeof exchangeId !== 'string') {
      return { success: false, error: 'Identificador de intercambio inválido.' };
    }
    const user = await requireAuth();
    const details = await getExchangeDetails(exchangeId, user.id);
    return { success: true, data: details };
  } catch (err: unknown) {
    return { success: false, error: sanitizeErrorMessage(err, 'Error al consultar el intercambio.') };
  }
}

export async function manageMemberStatusAction(
  exchangeId: string,
  targetUserId: string,
  newStatus: 'approved' | 'rejected'
): Promise<ActionResult> {
  try {
    if (newStatus !== 'approved' && newStatus !== 'rejected') {
      return { success: false, error: 'Estado de participante inválido.' };
    }
    const user = await requireConsentedUser();
    await manageMemberStatus(exchangeId, targetUserId, newStatus, user.id);
    revalidatePath('/');
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: sanitizeErrorMessage(err, 'Error al gestionar el estado del participante.') };
  }
}

export async function updateExchangeThemeAction(
  exchangeId: string,
  newTheme: 'navidad' | 'amistad' | 'cumpleanos' | 'general'
): Promise<ActionResult> {
  try {
    if (!exchangeId || typeof exchangeId !== 'string') {
      return { success: false, error: 'Identificador de intercambio inválido.' };
    }
    if (!VALID_THEMES.has(newTheme)) {
      return { success: false, error: 'Tema festivo inválido.' };
    }
    const user = await requireConsentedUser();
    await updateExchangeTheme(exchangeId, user.id, newTheme);
    revalidatePath('/');
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: sanitizeErrorMessage(err, 'Error al cambiar el tema del intercambio.') };
  }
}

export async function setExchangeExclusionsAction(
  exchangeId: string,
  rules: Array<{ giverUserId: string; excludedReceiverUserId: string }>
): Promise<ActionResult> {
  try {
    if (!exchangeId || typeof exchangeId !== 'string' || !Array.isArray(rules)) {
      return { success: false, error: 'Datos de restricciones inválidos.' };
    }
    for (const r of rules) {
      if (!r || typeof r.giverUserId !== 'string' || typeof r.excludedReceiverUserId !== 'string') {
        return { success: false, error: 'Formato de restricción inválido.' };
      }
    }
    const user = await requireConsentedUser();
    await setExchangeExclusions(exchangeId, user.id, rules);
    revalidatePath('/');
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: sanitizeErrorMessage(err, 'Error al guardar las restricciones del sorteo.') };
  }
}

export async function triggerDrawAction(
  exchangeId: string,
  expectedVersion: number,
  invalidationReason?: string
): Promise<ActionResult<{ version: number; count: number }>> {
  try {
    if (typeof expectedVersion !== 'number' || !Number.isInteger(expectedVersion) || expectedVersion < 0) {
      return { success: false, error: 'Versión esperada del sorteo inválida.' };
    }
    const user = await requireConsentedUser();
    const result = await executeAndCommitDraw(exchangeId, user.id, expectedVersion, invalidationReason);
    revalidatePath('/');
    return { success: true, data: { version: result.version, count: result.count } };
  } catch (err: unknown) {
    return { success: false, error: sanitizeErrorMessage(err, 'Error al realizar el sorteo.') };
  }
}

export async function getMyAssignmentAction(
  exchangeId: string
): Promise<ActionResult<Awaited<ReturnType<typeof getMyAssignment>>>> {
  try {
    const user = await requireAuth();
    const assignment = await getMyAssignment(exchangeId, user.id);
    return { success: true, data: assignment };
  } catch (err: unknown) {
    return { success: false, error: sanitizeErrorMessage(err, 'Error al consultar tu asignación.') };
  }
}

export async function revealAssignmentAction(exchangeId: string): Promise<ActionResult> {
  try {
    const user = await requireConsentedUser();
    await revealAssignment(exchangeId, user.id);
    revalidatePath('/');
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: sanitizeErrorMessage(err, 'Error al revelar tu asignación.') };
  }
}

export async function toggleWishPurchaseAction(
  exchangeId: string,
  wishId: string,
  purchased: boolean
): Promise<ActionResult> {
  try {
    if (typeof purchased !== 'boolean') {
      return { success: false, error: 'Indicador de compra inválido.' };
    }
    const user = await requireConsentedUser();
    await toggleWishPurchase(exchangeId, user.id, wishId, purchased);
    revalidatePath('/');
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: sanitizeErrorMessage(err, 'Error al actualizar el estado de compra.') };
  }
}

export async function getMyWishesAction(): Promise<ActionResult<Awaited<ReturnType<typeof getMyWishes>>>> {
  try {
    const user = await requireAuth();
    const wishes = await getMyWishes(user.id);
    return { success: true, data: wishes };
  } catch (err: unknown) {
    return { success: false, error: sanitizeErrorMessage(err, 'Error al obtener tus deseos.') };
  }
}

export async function saveWishAction(input: SaveWishInput): Promise<ActionResult<{ wishId: string }>> {
  try {
    const validationErr = validateSaveWish(input);
    if (validationErr) return { success: false, error: validationErr };

    const user = await requireConsentedUser();
    const result = await saveWish(user.id, input);
    revalidatePath('/');
    return { success: true, data: result };
  } catch (err: unknown) {
    return { success: false, error: sanitizeErrorMessage(err, 'Error al guardar el deseo.') };
  }
}

export async function deleteWishAction(wishId: string): Promise<ActionResult> {
  try {
    const user = await requireConsentedUser();
    await deleteWish(user.id, wishId);
    revalidatePath('/');
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: sanitizeErrorMessage(err, 'Error al eliminar el deseo.') };
  }
}

export async function toggleWishInExchangeAction(
  exchangeId: string,
  wishId: string,
  selected: boolean
): Promise<ActionResult> {
  try {
    if (typeof selected !== 'boolean') {
      return { success: false, error: 'Indicador de selección inválido.' };
    }
    const user = await requireConsentedUser();
    await toggleWishInExchange(user.id, exchangeId, wishId, selected);
    revalidatePath('/');
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: sanitizeErrorMessage(err, 'Error al actualizar la selección del deseo.') };
  }
}

export async function updateProfileAliasAction(newAlias: string): Promise<ActionResult> {
  try {
    if (typeof newAlias !== 'string' || newAlias.trim().length < 2 || newAlias.trim().length > 40) {
      return { success: false, error: 'El alias debe tener entre 2 y 40 caracteres.' };
    }
    const user = await requireConsentedUser();
    await updateProfileAlias(user.id, newAlias);
    revalidatePath('/');
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: sanitizeErrorMessage(err, 'Error al actualizar tu alias.') };
  }
}

export async function getConsentStatusAction(): Promise<
  ActionResult<Awaited<ReturnType<typeof getLatestConsentStatus>>>
> {
  try {
    const user = await requireAuth();
    const cookieStore = await cookies();
    await consumePendingConsentIntent(user.id, cookieStore);
    const status = await getLatestConsentStatus(user.id);
    return { success: true, data: status };
  } catch (err: unknown) {
    return { success: false, error: sanitizeErrorMessage(err, 'Error al consultar el estado de consentimiento.') };
  }
}

export async function recordConsentAction(input: {
  termsAccepted: boolean;
  privacyAccepted: boolean;
  version: string;
}): Promise<ActionResult> {
  try {
    if (!input || input.termsAccepted !== true || input.privacyAccepted !== true) {
      return { success: false, error: 'Debes aceptar explícitamente tanto los términos como el consentimiento de datos.' };
    }
    if (input.version !== LEGAL_CONSTANTS.VERSION) {
      return { success: false, error: `Versión legal desactualizada. Versión requerida: ${LEGAL_CONSTANTS.VERSION}.` };
    }
    const user = await requireAuth();
    await recordConsent(user.id, input.version, input.version);
    try {
      const cookieStore = await cookies();
      cookieStore.delete(PENDING_CONSENT_COOKIE);
    } catch {
      // Ignore if cookies cannot be mutated
    }
    revalidatePath('/');
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: sanitizeErrorMessage(err, 'Error al registrar el consentimiento.') };
  }
}

export async function revokeConsentAction(): Promise<ActionResult> {
  try {
    const user = await requireAuth();
    const cookieStore = await cookies();
    await revokeConsentAndClearCookie(user.id, cookieStore);
    revalidatePath('/');
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: sanitizeErrorMessage(err, 'Error al revocar el consentimiento.') };
  }
}

export async function submitPrivacyRequestAction(
  requestType: 'export' | 'delete',
  notes?: string
): Promise<ActionResult<{ requestId: string }>> {
  try {
    if (requestType !== 'export' && requestType !== 'delete') {
      return { success: false, error: 'Tipo de solicitud inválido.' };
    }
    if (notes !== undefined && (typeof notes !== 'string' || notes.length > 500)) {
      return { success: false, error: 'Las notas no pueden exceder 500 caracteres.' };
    }
    const user = await requireAuth();
    const id = await submitPrivacyRequest(user.id, requestType, notes);
    return { success: true, data: { requestId: id } };
  } catch (err: unknown) {
    return { success: false, error: sanitizeErrorMessage(err, 'Error al enviar la solicitud.') };
  }
}

export async function exportUserDataAction(): Promise<ActionResult<Awaited<ReturnType<typeof exportUserData>>>> {
  try {
    const user = await requireAuth();
    const data = await exportUserData(user.id);
    return { success: true, data };
  } catch (err: unknown) {
    return { success: false, error: sanitizeErrorMessage(err, 'Error al exportar los datos.') };
  }
}

export async function acceptInvitationAction(
  token: string
): Promise<ActionResult<{ exchangeId: string; status: 'approved' | 'pending' | 'rejected'; alreadyMember: boolean }>> {
  try {
    if (!token || typeof token !== 'string' || token.trim().length < 8) {
      return { success: false, error: 'Token de invitación inválido.' };
    }
    const user = await requireConsentedUser();
    const result = await acceptInvitationAtomic(token.trim(), user.id);
    revalidatePath('/');
    return { success: true, data: result };
  } catch (err: unknown) {
    return { success: false, error: sanitizeErrorMessage(err, 'Error al unirse al intercambio.') };
  }
}

export async function getInvitationPreviewAction(
  token: string
): Promise<ActionResult<Awaited<ReturnType<typeof getInvitationPreview>>>> {
  try {
    if (!isDatabaseConfigured()) {
      return {
        success: false,
        error: 'El servicio de base de datos no está configurado en este entorno.',
      };
    }
    if (!token || typeof token !== 'string') {
      return { success: false, error: 'Token de invitación inválido.' };
    }
    const preview = await getInvitationPreview(token.trim());
    return { success: true, data: preview };
  } catch (err: unknown) {
    return { success: false, error: sanitizeErrorMessage(err, 'Error al previsualizar la invitación.') };
  }
}
