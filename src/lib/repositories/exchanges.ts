import 'server-only';
import crypto from 'node:crypto';
import { dbQuery, dbTransaction } from '@/lib/db/client';
import { getCostaRicaTodayDate } from '@/lib/date/costa-rica';
import {
  purgeExpiredClosedExchangesWithClient,
  type PurgeExpiredExchangesOptions,
  type PurgeExpiredExchangesResult,
} from '@/lib/retention/cleanup';

export interface CreateExchangeInput {
  name: string;
  description?: string;
  eventDate: string; // YYYY-MM-DD
  registrationDeadline: string; // YYYY-MM-DD
  budgetAmount: number;
  currency: 'CRC' | 'USD';
  suggestedTheme: 'navidad' | 'amistad' | 'cumpleanos' | 'general';
  selectedTheme: 'navidad' | 'amistad' | 'cumpleanos' | 'general';
  requiresApproval: boolean;
  previousExchangeId?: string;
}

function hashInviteToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken.trim()).digest('hex');
}

function getInviteCipherKey(): Buffer {
  const dedicatedSecret = process.env.INVITATION_TOKEN_SECRET?.trim();
  const authSecret = process.env.NEON_AUTH_COOKIE_SECRET?.trim();
  const secret =
    dedicatedSecret && dedicatedSecret.length >= 32
      ? dedicatedSecret
      : authSecret && authSecret.length >= 32
        ? authSecret
        : null;

  if (!secret) {
    throw new Error(
      'Falta configurar INVITATION_TOKEN_SECRET o NEON_AUTH_COOKIE_SECRET (mínimo 32 caracteres) en el servidor para cifrar tokens de invitación.'
    );
  }

  return Buffer.from(
    crypto.hkdfSync(
      'sha256',
      Buffer.from(secret, 'utf8'),
      Buffer.from('papelito-invite-token-salt-v1', 'utf8'),
      Buffer.from('papelito-aes-256-gcm-invite-token-key-v1', 'utf8'),
      32
    )
  );
}

function encryptInviteToken(rawToken: string): string {
  const key = getInviteCipherKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(rawToken, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decryptInviteToken(payload: string): string | null {
  try {
    const parts = payload.split(':');
    if (parts.length !== 3) return null;
    const [ivHex, tagHex, dataHex] = parts;
    const key = getInviteCipherKey();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    const decrypted = Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]);
    return decrypted.toString('utf8');
  } catch {
    return null;
  }
}

export async function createExchangeWithInvitation(
  organizerId: string,
  input: CreateExchangeInput
): Promise<{ exchangeId: string; inviteToken: string }> {
  if (!input.name || input.name.trim().length === 0) {
    throw new Error('El nombre del intercambio es obligatorio.');
  }
  if (input.budgetAmount <= 0) {
    throw new Error('El presupuesto debe ser mayor a cero.');
  }
  if (!input.eventDate || !input.registrationDeadline) {
    throw new Error('Las fechas del evento y cierre de inscripción son obligatorias.');
  }

  return await dbTransaction(async (client) => {
    if (input.previousExchangeId) {
      const source = await client.query<{ organizer_id: string }>(
        'SELECT organizer_id FROM exchanges WHERE id = $1 FOR SHARE', [input.previousExchangeId]);
      if (source.rows[0]?.organizer_id !== organizerId) throw new Error('Solo podés repetir un intercambio que organizás.');
    }
    // 1. Insert exchange
    const exRes = await client.query<{ id: string }>(
      `INSERT INTO exchanges (
        organizer_id, name, description, event_date, registration_deadline,
        budget_amount, currency, suggested_theme, selected_theme, requires_approval, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'inscripcion_abierta')
      RETURNING id`,
      [
        organizerId,
        input.name.trim(),
        input.description?.trim() || '',
        input.eventDate,
        input.registrationDeadline,
        input.budgetAmount,
        input.currency,
        input.suggestedTheme,
        input.selectedTheme,
        input.requiresApproval,
      ]
    );

    const exchangeId = exRes.rows[0].id;
    if (input.previousExchangeId) await client.query('UPDATE exchanges SET previous_exchange_id = $2 WHERE id = $1', [exchangeId, input.previousExchangeId]);

    // 2. Insert organizer membership (automatically approved)
    await client.query(
      `INSERT INTO memberships (exchange_id, user_id, is_organizer, status, approved_at, approved_by)
       VALUES ($1, $2, true, 'approved', now(), $2)
       ON CONFLICT (exchange_id, user_id) DO NOTHING`,
      [exchangeId, organizerId]
    );

    // 3. Generate cryptographic invitation token; store SHA-256 hash + AES-256-GCM ciphertext (never plaintext)
    const inviteToken = crypto.randomBytes(24).toString('base64url');
    const tokenHash = hashInviteToken(inviteToken);
    const encryptedToken = encryptInviteToken(inviteToken);
    const deadlineEndMs = new Date(`${input.registrationDeadline}T23:59:59.999-06:00`).getTime();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    const minExpiryMs = Date.now() + thirtyDaysMs;
    const expiresAt = new Date(
      Number.isFinite(deadlineEndMs) ? Math.max(minExpiryMs, deadlineEndMs + thirtyDaysMs) : minExpiryMs
    ).toISOString();

    await client.query(
      `INSERT INTO invitations (exchange_id, token_hash, encrypted_token, max_uses, expires_at, created_by)
       VALUES ($1, $2, $3, 100, $4, $5)`,
      [exchangeId, tokenHash, encryptedToken, expiresAt, organizerId]
    );

    return { exchangeId, inviteToken };
  });
}

export async function regenerateExchangeInvitation(
  exchangeId: string,
  actorUserId: string
): Promise<{ inviteToken: string }> {
  return await dbTransaction(async (client) => {
    const exRes = await client.query<{ organizer_id: string; status: string; registration_deadline: string }>(
      `SELECT organizer_id, status, registration_deadline::text FROM exchanges WHERE id = $1 FOR UPDATE`,
      [exchangeId]
    );
    if (exRes.rowCount === 0) {
      throw new Error('Intercambio no encontrado.');
    }
    const ex = exRes.rows[0];
    if (ex.organizer_id !== actorUserId) {
      throw new Error('Solo la persona organizadora puede renovar el enlace de invitación.');
    }
    if (ex.status !== 'inscripcion_abierta') {
      throw new Error('Solo se puede renovar el enlace mientras la inscripción está abierta.');
    }

    // Revoke previous active invitations
    await client.query(
      `UPDATE invitations SET revoked_at = now() WHERE exchange_id = $1 AND revoked_at IS NULL`,
      [exchangeId]
    );

    const inviteToken = crypto.randomBytes(24).toString('base64url');
    const tokenHash = hashInviteToken(inviteToken);
    const encryptedToken = encryptInviteToken(inviteToken);
    const deadlineEndMs = new Date(`${ex.registration_deadline}T23:59:59.999-06:00`).getTime();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    const minExpiryMs = Date.now() + thirtyDaysMs;
    const expiresAt = new Date(
      Number.isFinite(deadlineEndMs) ? Math.max(minExpiryMs, deadlineEndMs + thirtyDaysMs) : minExpiryMs
    ).toISOString();

    await client.query(
      `INSERT INTO invitations (exchange_id, token_hash, encrypted_token, max_uses, expires_at, created_by)
       VALUES ($1, $2, $3, 100, $4, $5)`,
      [exchangeId, tokenHash, encryptedToken, expiresAt, actorUserId]
    );

    return { inviteToken };
  });
}

export async function getMyExchanges(userId: string) {
  const res = await dbQuery<{
    id: string;
    name: string;
    description: string;
    event_date: string;
    registration_deadline: string;
    budget_amount: string;
    currency: string;
    status: string;
    selected_theme: string;
    suggested_theme: string;
    requires_approval: boolean;
    min_participants: number;
    current_draw_version: number;
    closed_at: string | null;
    is_organizer: boolean;
    member_status: string;
    organizer_alias: string;
    participant_count: number;
  }>(
    `SELECT
       e.id,
       e.name,
       e.description,
       e.event_date::text as event_date,
       e.registration_deadline::text as registration_deadline,
       e.budget_amount::text as budget_amount,
       e.currency,
       e.status,
       e.selected_theme,
       e.suggested_theme,
       e.requires_approval,
       e.min_participants,
       e.current_draw_version,
       e.closed_at::text as closed_at,
       m.is_organizer,
       m.status as member_status,
       p.alias as organizer_alias,
       (SELECT count(*)::int FROM memberships m2 WHERE m2.exchange_id = e.id AND m2.status = 'approved') as participant_count
     FROM memberships m
     JOIN exchanges e ON e.id = m.exchange_id
     JOIN profiles p ON p.user_id = e.organizer_id
     WHERE m.user_id = $1
     ORDER BY e.event_date ASC, e.created_at DESC`,
    [userId]
  );

  return res.rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    eventDate: row.event_date,
    registrationDeadline: row.registration_deadline,
    budgetAmount: Number(row.budget_amount),
    currency: row.currency,
    status: row.status,
    theme: row.selected_theme,
    suggestedTheme: row.suggested_theme,
    requiresApproval: row.requires_approval,
    minParticipants: row.min_participants,
    currentDrawVersion: row.current_draw_version,
    closedAt: row.closed_at,
    isOrganizer: row.is_organizer,
    memberStatus: row.member_status as 'approved' | 'pending' | 'rejected',
    organizerAlias: row.organizer_alias,
    participantCount: row.participant_count,
  }));
}

export async function getExchangeDetails(exchangeId: string, userId: string) {
  // 1. Verify user membership
  const memberRes = await dbQuery<{
    id: string;
    is_organizer: boolean;
    status: 'approved' | 'pending' | 'rejected';
  }>(
    `SELECT id, is_organizer, status
     FROM memberships
     WHERE exchange_id = $1 AND user_id = $2`,
    [exchangeId, userId]
  );

  if (memberRes.rowCount === 0) {
    throw new Error('No tienes acceso a este intercambio.');
  }

  const userMembership = memberRes.rows[0];
  const isApproved = userMembership.status === 'approved';
  const isOrganizer = userMembership.is_organizer;

  // 2. Fetch exchange details
  const exRes = await dbQuery<{
    id: string;
    organizer_id: string;
    name: string;
    description: string;
    event_date: string;
    registration_deadline: string;
    budget_amount: string;
    currency: string;
    suggested_theme: string;
    selected_theme: string;
    manual_theme_override: string | null;
    requires_approval: boolean;
    min_participants: number;
    status: string;
    current_draw_version: number;
    closed_at: string | null;
    organizer_alias: string;
    organizer_avatar: string;
    draw_notice: string | null;
  }>(
    `SELECT
       e.id,
       e.organizer_id,
       e.name,
       e.description,
       e.event_date::text as event_date,
       e.registration_deadline::text as registration_deadline,
       e.budget_amount::text as budget_amount,
       e.currency,
       e.suggested_theme,
       e.selected_theme,
       e.manual_theme_override,
       e.requires_approval,
       e.min_participants,
       e.status,
       e.current_draw_version,
       e.closed_at::text as closed_at,
       p.alias as organizer_alias,
       p.avatar_color as organizer_avatar,
       (SELECT dv.invalidation_reason FROM draw_versions dv
        WHERE dv.exchange_id = e.id AND dv.version_number = e.current_draw_version) AS draw_notice
     FROM exchanges e
     JOIN profiles p ON p.user_id = e.organizer_id
     WHERE e.id = $1`,
    [exchangeId]
  );

  if (exRes.rowCount === 0) {
    throw new Error('Intercambio no encontrado.');
  }

  const ex = exRes.rows[0];

  // If pending or rejected, return restricted view without participant details, exclusions, or invite token
  if (!isApproved) {
    return {
      exchange: {
        id: ex.id,
        name: ex.name,
        description: ex.description,
        eventDate: ex.event_date,
        registrationDeadline: ex.registration_deadline,
        budgetAmount: Number(ex.budget_amount),
        currency: ex.currency,
        suggestedTheme: ex.suggested_theme,
        selectedTheme: ex.selected_theme,
        manualThemeOverride: ex.manual_theme_override,
        requiresApproval: ex.requires_approval,
        minParticipants: ex.min_participants,
        status: ex.status,
        currentDrawVersion: ex.current_draw_version,
        closedAt: ex.closed_at,
        organizerAlias: ex.organizer_alias,
        isCurrentUserOrganizer: false,
        currentUserMemberStatus: userMembership.status,
      },
      participants: [],
      exclusions: [],
      invitationToken: null,
    };
  }

  // 3. For approved members, fetch approved participants (or all for organizer so they can manage pending/rejected)
  const partQuery = isOrganizer
    ? `SELECT
         m.id as membership_id,
         m.user_id,
         m.is_organizer,
         m.status,
         m.joined_at::text,
         p.alias,
         p.avatar_color,
         (SELECT count(*)::int FROM wish_selections ws WHERE ws.exchange_id = m.exchange_id AND ws.user_id = m.user_id) as wish_count
       FROM memberships m
       JOIN profiles p ON p.user_id = m.user_id
       WHERE m.exchange_id = $1
       ORDER BY m.is_organizer DESC, p.alias ASC`
    : `SELECT
         m.id as membership_id,
         m.user_id,
         m.is_organizer,
         m.status,
         m.joined_at::text,
         p.alias,
         p.avatar_color,
         (SELECT count(*)::int FROM wish_selections ws WHERE ws.exchange_id = m.exchange_id AND ws.user_id = m.user_id) as wish_count
       FROM memberships m
       JOIN profiles p ON p.user_id = m.user_id
       WHERE m.exchange_id = $1 AND m.status = 'approved'
       ORDER BY m.is_organizer DESC, p.alias ASC`;

  const partRes = await dbQuery<{
    membership_id: string;
    user_id: string;
    is_organizer: boolean;
    status: 'approved' | 'pending' | 'rejected';
    joined_at: string;
    alias: string;
    avatar_color: string;
    wish_count: number;
  }>(partQuery, [exchangeId]);

  // 4. Fetch exclusions if organizer
  let exclusions: Array<{ id: string; giverId: string; receiverId: string }> = [];
  if (isOrganizer) {
    const exclRes = await dbQuery<{ id: string; giver_user_id: string; receiver_user_id: string }>(
      `SELECT id, giver_user_id, receiver_user_id FROM exclusions WHERE exchange_id = $1`,
      [exchangeId]
    );
    exclusions = exclRes.rows.map((r) => ({
      id: r.id,
      giverId: r.giver_user_id,
      receiverId: r.receiver_user_id,
    }));
  }

  // 5. Decrypt active invitation token ONLY for the organizer
  let inviteToken: string | null = null;
  if (isOrganizer) {
    const invRes = await dbQuery<{ encrypted_token: string }>(
      `SELECT encrypted_token FROM invitations
       WHERE exchange_id = $1 AND revoked_at IS NULL AND expires_at > now() AND use_count < max_uses
       ORDER BY created_at DESC LIMIT 1`,
      [exchangeId]
    );
    if (invRes.rowCount > 0) {
      inviteToken = decryptInviteToken(invRes.rows[0].encrypted_token);
    }
  }

  return {
    exchange: {
      id: ex.id,
      name: ex.name,
      description: ex.description,
      eventDate: ex.event_date,
      registrationDeadline: ex.registration_deadline,
      budgetAmount: Number(ex.budget_amount),
      currency: ex.currency,
      suggestedTheme: ex.suggested_theme,
      selectedTheme: ex.selected_theme,
      manualThemeOverride: ex.manual_theme_override,
      requiresApproval: ex.requires_approval,
      minParticipants: ex.min_participants,
      status: ex.status,
      currentDrawVersion: ex.current_draw_version,
      closedAt: ex.closed_at,
      drawNotice: ex.draw_notice,
      organizerAlias: ex.organizer_alias,
      isCurrentUserOrganizer: isOrganizer,
      currentUserMemberStatus: userMembership.status,
    },
    participants: partRes.rows.map((p) => ({
      membershipId: p.membership_id,
      userId: p.user_id,
      alias: p.alias,
      avatarColor: p.avatar_color,
      isOrganizer: p.is_organizer,
      status: p.status,
      joinedAt: p.joined_at,
      wishCount: p.wish_count,
    })),
    exclusions,
    invitationToken: inviteToken,
  };
}

export async function manageMemberStatus(
  exchangeId: string,
  targetUserId: string,
  newStatus: 'approved' | 'rejected',
  actorUserId: string
): Promise<boolean> {
  return await dbTransaction(async (client) => {
    // 1. Lock exchange row first (consistent lock order across all exchange mutations)
    const exRes = await client.query<{ organizer_id: string; status: string }>(
      `SELECT organizer_id, status FROM exchanges WHERE id = $1 FOR UPDATE`,
      [exchangeId]
    );
    if (exRes.rowCount === 0) {
      throw new Error('Intercambio no encontrado.');
    }
    const ex = exRes.rows[0];
    if (ex.organizer_id !== actorUserId) {
      throw new Error('Solo el organizador puede gestionar a los participantes.');
    }
    if (ex.status === 'sorteado' || ex.status === 'finalizado' || ex.status === 'cancelado') {
      throw new Error('No se pueden modificar participantes una vez realizado el sorteo.');
    }

    // 2. Prevent modifying the organizer's own status
    if (targetUserId === ex.organizer_id) {
      throw new Error('No se puede modificar el estado del organizador del intercambio.');
    }

    // 3. Verify target membership exists
    const memRes = await client.query<{ id: string }>(
      `SELECT id FROM memberships WHERE exchange_id = $1 AND user_id = $2 FOR UPDATE`,
      [exchangeId, targetUserId]
    );
    if (memRes.rowCount === 0) {
      throw new Error('El participante especificado no pertenece a este intercambio.');
    }

    const res = await client.query(
      `UPDATE memberships
       SET status = $1, approved_at = now(), approved_by = $2
       WHERE exchange_id = $3 AND user_id = $4`,
      [newStatus, actorUserId, exchangeId, targetUserId]
    );
    return res.rowCount > 0;
  });
}

export async function updateExchangeTheme(
  exchangeId: string,
  actorUserId: string,
  newTheme: 'navidad' | 'amistad' | 'cumpleanos' | 'general'
): Promise<boolean> {
  if (!['navidad', 'amistad', 'cumpleanos', 'general'].includes(newTheme)) {
    throw new Error('Tema visual inválido.');
  }

  return await dbTransaction(async (client) => {
    const exRes = await client.query<{ organizer_id: string; status: string }>(
      `SELECT organizer_id, status FROM exchanges WHERE id = $1 FOR UPDATE`,
      [exchangeId]
    );
    if (exRes.rowCount === 0) {
      throw new Error('Intercambio no encontrado.');
    }
    const ex = exRes.rows[0];
    if (ex.organizer_id !== actorUserId) {
      throw new Error('Solo el organizador puede cambiar el tema del intercambio.');
    }
    if (ex.status === 'sorteado' || ex.status === 'finalizado' || ex.status === 'cancelado') {
      throw new Error('No se puede cambiar el tema después de realizar el sorteo.');
    }

    const res = await client.query(
      `UPDATE exchanges
       SET selected_theme = $1, manual_theme_override = $1, updated_at = now()
       WHERE id = $2`,
      [newTheme, exchangeId]
    );
    return res.rowCount > 0;
  });
}

export async function getInvitationPreview(token: string, referenceNow: Date = new Date()) {
  if (!token || typeof token !== 'string' || token.trim().length < 8) {
    return { valid: false, reason: 'Enlace de invitación no válido o inexistente.' };
  }

  const tokenHash = hashInviteToken(token);
  const res = await dbQuery<{
    exchange_id: string;
    max_uses: number;
    use_count: number;
    expires_at: string;
    revoked_at: string | null;
    name: string;
    description: string;
    event_date: string;
    registration_deadline: string;
    budget_amount: string;
    currency: string;
    requires_approval: boolean;
    status: string;
    organizer_alias: string;
  }>(
    `SELECT
       i.exchange_id,
       i.max_uses,
       i.use_count,
       i.expires_at::text,
       i.revoked_at::text,
       e.name,
       e.description,
       e.event_date::text,
       e.registration_deadline::text,
       e.budget_amount::text,
       e.currency,
       e.requires_approval,
       e.status,
       p.alias as organizer_alias
     FROM invitations i
     JOIN exchanges e ON e.id = i.exchange_id
     JOIN profiles p ON p.user_id = e.organizer_id
     WHERE i.token_hash = $1`,
    [tokenHash]
  );

  if (res.rowCount === 0) {
    return { valid: false, reason: 'Enlace de invitación no válido o inexistente.' };
  }

  const row = res.rows[0];
  if (row.revoked_at !== null) {
    return { valid: false, reason: 'Este enlace de invitación fue revocado por el organizador.' };
  }
  const isExpired = new Date(row.expires_at) < referenceNow;
  if (isExpired) {
    return { valid: false, reason: 'Este enlace de invitación ha caducado.' };
  }
  if (row.use_count >= row.max_uses) {
    return { valid: false, reason: 'Este enlace de invitación alcanzó el límite de usos permitidos.' };
  }
  if (row.status !== 'inscripcion_abierta') {
    return { valid: false, reason: 'La inscripción para este intercambio ya está cerrada o el sorteo ya se realizó.' };
  }

  // Evaluate registration deadline in America/Costa_Rica timezone (UTC-6)
  const todayCR = getCostaRicaTodayDate(referenceNow);
  if (todayCR > row.registration_deadline) {
    return { valid: false, reason: `El periodo de inscripción cerró el ${row.registration_deadline}.` };
  }

  return {
    valid: true,
    exchangeId: row.exchange_id,
    name: row.name,
    description: row.description,
    eventDate: row.event_date,
    budgetAmount: Number(row.budget_amount),
    currency: row.currency,
    requiresApproval: row.requires_approval,
    organizerAlias: row.organizer_alias,
  };
}

export async function acceptInvitationAtomic(
  token: string,
  userId: string,
  referenceNow: Date = new Date()
): Promise<{ exchangeId: string; status: 'approved' | 'pending' | 'rejected'; alreadyMember: boolean }> {
  if (!token || typeof token !== 'string' || token.trim().length < 8) {
    throw new Error('Invitación no válida.');
  }

  const tokenHash = hashInviteToken(token);

  return await dbTransaction(async (client) => {
    // 1. Resolve exchange_id by token_hash first
    const lookupRes = await client.query<{ id: string; exchange_id: string }>(
      `SELECT id, exchange_id FROM invitations WHERE token_hash = $1`,
      [tokenHash]
    );

    if (lookupRes.rowCount === 0) {
      throw new Error('Invitación no válida.');
    }

    const { id: invitationId, exchange_id: exchangeId } = lookupRes.rows[0];

    // 2. Lock exchange row FIRST (consistent lock order with manageMemberStatus, setExchangeExclusions, executeAndCommitDraw)
    const exRes = await client.query<{
      status: string;
      requires_approval: boolean;
      registration_deadline: string;
    }>(
      `SELECT status, requires_approval, registration_deadline::text
       FROM exchanges
       WHERE id = $1 FOR UPDATE`,
      [exchangeId]
    );

    if (exRes.rowCount === 0) {
      throw new Error('Intercambio no encontrado.');
    }

    const ex = exRes.rows[0];

    // 3. Lock invitation row SECOND
    const invRes = await client.query<{
      id: string;
      exchange_id: string;
      max_uses: number;
      use_count: number;
      expires_at: string;
      revoked_at: string | null;
    }>(
      `SELECT id, exchange_id, max_uses, use_count, expires_at::text, revoked_at::text
       FROM invitations
       WHERE id = $1 FOR UPDATE`,
      [invitationId]
    );

    const inv = invRes.rows[0];
    if (inv.revoked_at !== null) {
      throw new Error('La invitación fue revocada.');
    }
    if (new Date(inv.expires_at) < referenceNow) {
      throw new Error('La invitación ha expirado.');
    }

    // 4. Check if user is already a member under lock (idempotent: does NOT consume another use, preserves rejected/approved/pending status)
    const existingMember = await client.query<{ status: 'approved' | 'pending' | 'rejected' }>(
      `SELECT status FROM memberships WHERE exchange_id = $1 AND user_id = $2 FOR UPDATE`,
      [exchangeId, userId]
    );

    if (existingMember.rowCount > 0) {
      return {
        exchangeId,
        status: existingMember.rows[0].status,
        alreadyMember: true,
      };
    }

    // 5. For new members, enforce max_uses, exchange status, and America/Costa_Rica registration_deadline
    if (inv.use_count >= inv.max_uses) {
      throw new Error('La invitación ha alcanzado el límite de usos permitidos.');
    }

    if (ex.status !== 'inscripcion_abierta') {
      throw new Error('El intercambio no está abierto para nuevas inscripciones.');
    }

    const todayCR = getCostaRicaTodayDate(referenceNow);
    if (todayCR > ex.registration_deadline) {
      throw new Error(`El plazo de inscripción para este evento venció el ${ex.registration_deadline}.`);
    }

    // 6. Increment invitation use count only once per new member
    await client.query(
      `UPDATE invitations SET use_count = use_count + 1 WHERE id = $1`,
      [inv.id]
    );

    // 7. Insert new membership
    const memberStatus = ex.requires_approval ? 'pending' : 'approved';
    await client.query(
      `INSERT INTO memberships (exchange_id, user_id, is_organizer, status, approved_at)
       VALUES ($1, $2, false, $3, $4)`,
      [
        exchangeId,
        userId,
        memberStatus,
        memberStatus === 'approved' ? referenceNow.toISOString() : null,
      ]
    );

    return { exchangeId, status: memberStatus, alreadyMember: false };
  });
}

export async function setExchangeExclusions(
  exchangeId: string,
  actorUserId: string,
  rules: Array<{ giverUserId: string; excludedReceiverUserId: string }>
): Promise<boolean> {
  return await dbTransaction(async (client) => {
    const exRes = await client.query<{ organizer_id: string; status: string }>(
      `SELECT organizer_id, status FROM exchanges WHERE id = $1 FOR UPDATE`,
      [exchangeId]
    );
    if (exRes.rowCount === 0) {
      throw new Error('Intercambio no encontrado.');
    }
    const ex = exRes.rows[0];
    if (ex.organizer_id !== actorUserId) {
      throw new Error('Solo el organizador puede configurar restricciones del sorteo.');
    }
    if (ex.status !== 'inscripcion_abierta') {
      throw new Error('No se pueden modificar restricciones cuando la inscripción no está abierta.');
    }

    // Verify all referenced users are approved members of the exchange
    const approvedRes = await client.query<{ user_id: string }>(
      `SELECT user_id FROM memberships WHERE exchange_id = $1 AND status = 'approved'`,
      [exchangeId]
    );
    const approvedIds = new Set(approvedRes.rows.map((r) => r.user_id));

    for (const rule of rules) {
      if (rule.giverUserId === rule.excludedReceiverUserId) {
        throw new Error('Una persona ya está excluida de regalarse a sí misma.');
      }
      if (!approvedIds.has(rule.giverUserId) || !approvedIds.has(rule.excludedReceiverUserId)) {
        throw new Error('Las exclusiones solo pueden configurarse entre participantes aprobados del intercambio.');
      }
    }

    await client.query(`DELETE FROM exclusions WHERE exchange_id = $1`, [exchangeId]);

    for (const rule of rules) {
      await client.query(
        `INSERT INTO exclusions (exchange_id, giver_user_id, receiver_user_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (exchange_id, giver_user_id, receiver_user_id) DO NOTHING`,
        [exchangeId, rule.giverUserId, rule.excludedReceiverUserId]
      );
    }

    return true;
  });
}

/**
 * Transitions an exchange to a terminal state ('finalizado' or 'cancelado'),
 * recording `closed_at` for 12-month automatic retention and revoking open invitations.
 */
export async function updateExchangeLifecycleStatus(
  exchangeId: string,
  actorUserId: string,
  nextStatus: 'finalizado' | 'cancelado',
  referenceNow: Date = new Date()
): Promise<{ status: 'finalizado' | 'cancelado'; closedAt: string }> {
  if (nextStatus !== 'finalizado' && nextStatus !== 'cancelado') {
    throw new Error('El estado de cierre debe ser finalizado o cancelado.');
  }

  return await dbTransaction(async (client) => {
    const exRes = await client.query<{
      organizer_id: string;
      status: string;
      closed_at: string | null;
    }>(
      `SELECT organizer_id, status, closed_at::text
       FROM exchanges
       WHERE id = $1
       FOR UPDATE`,
      [exchangeId]
    );

    if (exRes.rowCount === 0) {
      throw new Error('Intercambio no encontrado.');
    }

    const ex = exRes.rows[0];
    if (ex.organizer_id !== actorUserId) {
      throw new Error('Solo la persona organizadora puede finalizar o cancelar el intercambio.');
    }

    if (ex.status === 'finalizado' || ex.status === 'cancelado') {
      if (ex.status === nextStatus && ex.closed_at) {
        return { status: nextStatus, closedAt: ex.closed_at };
      }
      throw new Error('Este intercambio ya fue cerrado anteriormente.');
    }

    if (nextStatus === 'finalizado' && ex.status !== 'sorteado') {
      throw new Error('Solo se puede finalizar un intercambio que ya tiene sorteo. Para abandonarlo antes, elegí cancelar.');
    }

    const nowIso = referenceNow.toISOString();

    await client.query(
      `UPDATE invitations
       SET revoked_at = $1::timestamptz
       WHERE exchange_id = $2 AND revoked_at IS NULL`,
      [nowIso, exchangeId]
    );

    const updRes = await client.query<{ status: 'finalizado' | 'cancelado'; closed_at: string }>(
      `UPDATE exchanges
       SET status = $1,
           closed_at = COALESCE(closed_at, $2::timestamptz),
           updated_at = $2::timestamptz
       WHERE id = $3
       RETURNING status, closed_at::text AS closed_at`,
      [nextStatus, nowIso, exchangeId]
    );

    return {
      status: updRes.rows[0].status,
      closedAt: updRes.rows[0].closed_at,
    };
  });
}

/**
 * Transfers the organizer role of an exchange to another approved member.
 */
export async function transferExchangeOrganizer(
  exchangeId: string,
  actorUserId: string,
  newOrganizerUserId: string
): Promise<boolean> {
  if (!newOrganizerUserId || newOrganizerUserId.trim().length === 0) {
    throw new Error('Debes seleccionar un participante aprobado como nuevo organizador.');
  }

  return await dbTransaction(async (client) => {
    const exRes = await client.query<{ organizer_id: string; status: string }>(
      `SELECT organizer_id, status FROM exchanges WHERE id = $1 FOR UPDATE`,
      [exchangeId]
    );

    if (exRes.rowCount === 0) {
      throw new Error('Intercambio no encontrado.');
    }

    const ex = exRes.rows[0];
    if (ex.organizer_id !== actorUserId) {
      throw new Error('Solo la persona organizadora actual puede transferir la organización.');
    }

    if (newOrganizerUserId === actorUserId) {
      throw new Error('Ya eres la persona organizadora de este intercambio.');
    }

    const memRes = await client.query<{ user_id: string; status: string }>(
      `SELECT user_id, status
       FROM memberships
       WHERE exchange_id = $1 AND user_id IN ($2, $3)
       FOR UPDATE`,
      [exchangeId, actorUserId, newOrganizerUserId]
    );

    const targetMember = memRes.rows.find((m) => m.user_id === newOrganizerUserId);
    if (!targetMember || targetMember.status !== 'approved') {
      throw new Error(
        'Solo puedes transferir la organización a un participante aprobado de este intercambio.'
      );
    }

    await client.query(
      `UPDATE exchanges
       SET organizer_id = $1, updated_at = now()
       WHERE id = $2`,
      [newOrganizerUserId, exchangeId]
    );

    await client.query(
      `UPDATE memberships
       SET is_organizer = (user_id = $1)
       WHERE exchange_id = $2 AND user_id IN ($1, $3)`,
      [newOrganizerUserId, exchangeId, actorUserId]
    );

    await client.query(
      `UPDATE invitations
       SET created_by = $1
       WHERE exchange_id = $2 AND created_by = $3`,
      [newOrganizerUserId, exchangeId, actorUserId]
    );

    return true;
  });
}

/**
 * Purges closed ('finalizado' / 'cancelado') exchanges whose closed_at timestamp is
 * at least 12 real calendar months in the past, inside a PostgreSQL transaction.
 */
export async function purgeExpiredClosedExchanges(
  options: PurgeExpiredExchangesOptions = {}
): Promise<PurgeExpiredExchangesResult> {
  return await dbTransaction(async (client) => {
    return await purgeExpiredClosedExchangesWithClient(client, options);
  });
}
