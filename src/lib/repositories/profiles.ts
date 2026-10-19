import 'server-only';
import { dbQuery, dbTransaction, type TransactionClient } from '@/lib/db/client';
import { LEGAL_CONSTANTS } from '@/lib/legal/constants';

export interface UserProfileRow {
  user_id: string;
  alias: string;
  full_name: string;
  avatar_color: string;
  created_at: string;
  updated_at: string;
}

export async function getOrCreateProfile(
  userId: string,
  email: string,
  fullName?: string,
  avatarColor: string = '#46245D'
): Promise<UserProfileRow> {
  const name = fullName && fullName.trim().length > 0 ? fullName.trim() : email.split('@')[0] || 'Participante';
  const alias = name;

  const existing = await dbQuery<UserProfileRow>(
    `SELECT user_id, alias, full_name, avatar_color, created_at::text, updated_at::text
     FROM profiles
     WHERE user_id = $1`,
    [userId]
  );

  if (existing.rowCount > 0) {
    return existing.rows[0];
  }

  const inserted = await dbQuery<UserProfileRow>(
    `INSERT INTO profiles (user_id, alias, full_name, avatar_color)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id) DO UPDATE SET updated_at = profiles.updated_at
     RETURNING user_id, alias, full_name, avatar_color, created_at::text, updated_at::text`,
    [userId, alias, name, avatarColor]
  );

  return inserted.rows[0];
}

export async function updateProfileAlias(userId: string, newAlias: string): Promise<boolean> {
  const trimmed = newAlias.trim();
  if (trimmed.length < 2 || trimmed.length > 40) {
    throw new Error('El alias debe tener entre 2 y 40 caracteres.');
  }

  const res = await dbQuery(
    `UPDATE profiles
     SET alias = $1, updated_at = now()
     WHERE user_id = $2`,
    [trimmed, userId]
  );
  return res.rowCount > 0;
}

export async function recordConsent(
  userId: string,
  termsVersion: string,
  privacyVersion: string,
  ipAddress?: string,
  userAgent?: string
): Promise<string> {
  if (termsVersion !== LEGAL_CONSTANTS.VERSION || privacyVersion !== LEGAL_CONSTANTS.VERSION) {
    throw new Error(`Versión legal inválida. La versión vigente requerida es ${LEGAL_CONSTANTS.VERSION}.`);
  }

  const res = await dbQuery<{ id: string }>(
    `INSERT INTO consent_records (user_id, terms_version, privacy_version, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [userId, termsVersion, privacyVersion, ipAddress || null, userAgent || null]
  );
  return res.rows[0].id;
}

export async function getLatestConsentStatus(userId: string): Promise<{
  hasCurrentConsent: boolean;
  latestVersion: string | null;
  acceptedAt: string | null;
  revokedAt: string | null;
}> {
  const res = await dbQuery<{
    terms_version: string;
    privacy_version: string;
    accepted_at: string;
    revoked_at: string | null;
    latest_revoked_at: string | null;
  }>(
    `SELECT
       terms_version,
       privacy_version,
       accepted_at::text,
       revoked_at::text,
       (SELECT MAX(revoked_at)::text FROM consent_records WHERE user_id = $1) as latest_revoked_at
     FROM consent_records
     WHERE user_id = $1
     ORDER BY accepted_at DESC
     LIMIT 1`,
    [userId]
  );

  if (res.rowCount === 0) {
    return { hasCurrentConsent: false, latestVersion: null, acceptedAt: null, revokedAt: null };
  }

  const latest = res.rows[0];
  const isCurrent =
    latest.revoked_at === null &&
    latest.terms_version === LEGAL_CONSTANTS.VERSION &&
    latest.privacy_version === LEGAL_CONSTANTS.VERSION;

  return {
    hasCurrentConsent: isCurrent,
    latestVersion: latest.revoked_at === null ? latest.terms_version : null,
    acceptedAt: latest.revoked_at === null ? latest.accepted_at : null,
    revokedAt: latest.latest_revoked_at ?? latest.revoked_at,
  };
}

export async function revokeConsent(userId: string): Promise<boolean> {
  const res = await dbQuery(
    `UPDATE consent_records
     SET revoked_at = now()
     WHERE user_id = $1 AND revoked_at IS NULL`,
    [userId]
  );
  return res.rowCount > 0;
}

export async function submitPrivacyRequest(
  userId: string,
  requestType: 'export' | 'delete',
  notes?: string
): Promise<string> {
  if (requestType !== 'export' && requestType !== 'delete') {
    throw new Error('Tipo de solicitud inválido.');
  }

  const res = await dbQuery<{ id: string }>(
    `INSERT INTO privacy_requests (user_id, request_type, notes)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [userId, requestType, notes?.trim() || null]
  );
  return res.rows[0].id;
}

export async function exportUserData(userId: string) {
  const [reports, votes, passkeys, sessions, represented, photos] = await Promise.all([
    dbQuery('SELECT id, description, area, created_at::text FROM support_reports WHERE user_id = $1 ORDER BY created_at', [userId]),
    dbQuery('SELECT exchange_id, amount::text FROM budget_votes WHERE user_id = $1', [userId]),
    dbQuery('SELECT label, rp_id, created_at::text, last_used_at::text FROM app_passkeys WHERE user_id = $1', [userId]),
    dbQuery('SELECT browser, created_at::text, expires_at::text FROM app_passkey_sessions WHERE user_id = $1', [userId]),
    dbQuery(`SELECT p.user_id, p.alias, p.represented_exchange_id, p.representation_authorized_at::text,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('title', w.title, 'description', w.description, 'url', w.url)) FROM wishes w WHERE w.user_id = p.user_id), '[]'::jsonb) AS wishes
      FROM profiles p WHERE p.guardian_user_id = $1`, [userId]),
    dbQuery<{ wish_id: string; image: Uint8Array }>('SELECT f.wish_id, f.image FROM wish_photos f JOIN wishes w ON w.id = f.wish_id JOIN profiles p ON p.user_id = w.user_id WHERE w.user_id = $1 OR p.guardian_user_id = $1', [userId]),
  ]);
  const tastesRes = await dbQuery('SELECT gift_preferences FROM profiles WHERE user_id = $1', [userId]);
  const messagesRes = await dbQuery(`SELECT msg.id, a.exchange_id, msg.body, msg.created_at::text
    FROM anonymous_messages msg JOIN assignments a ON a.id = msg.assignment_id
    WHERE (msg.from_giver = true AND a.giver_id = $1) OR (msg.from_giver = false AND a.receiver_id = $1)
    ORDER BY msg.created_at`, [userId]);
  const notificationsRes = await dbQuery('SELECT id, created_at::text FROM push_subscriptions WHERE user_id = $1', [userId]);
  // Complete authorized server export of user's own data
  const profileRes = await dbQuery<UserProfileRow>(
    `SELECT user_id, alias, full_name, avatar_color, created_at::text, updated_at::text
     FROM profiles WHERE user_id = $1`,
    [userId]
  );

  const consentsRes = await dbQuery(
    `SELECT id, terms_version, privacy_version, accepted_at::text, revoked_at::text
     FROM consent_records WHERE user_id = $1 ORDER BY accepted_at DESC`,
    [userId]
  );

  const membershipsRes = await dbQuery(
    `SELECT m.exchange_id, e.name as exchange_name, m.is_organizer, m.status, m.joined_at::text
     FROM memberships m
     JOIN exchanges e ON e.id = m.exchange_id
     WHERE m.user_id = $1`,
    [userId]
  );

  const wishesRes = await dbQuery(
    `SELECT id, title, description, url, approximate_price::text, currency, priority, created_at::text
     FROM wishes WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId]
  );

  const selectionsRes = await dbQuery(
    `SELECT ws.exchange_id, e.name as exchange_name, ws.wish_id, ws.created_at::text
     FROM wish_selections ws
     JOIN exchanges e ON e.id = ws.exchange_id
     WHERE ws.user_id = $1`,
    [userId]
  );

  const purchasesRes = await dbQuery(
    `SELECT gp.exchange_id, e.name as exchange_name, gp.wish_id, w.title as wish_title, gp.purchased_at::text
     FROM gift_purchases gp
     JOIN exchanges e ON e.id = gp.exchange_id
     JOIN wishes w ON w.id = gp.wish_id
     WHERE gp.buyer_id = $1
     ORDER BY gp.purchased_at DESC`,
    [userId]
  );

  const assignmentsAsGiverRes = await dbQuery(
    `SELECT a.exchange_id, e.name as exchange_name, dv.version_number, p.alias as receiver_alias, a.revealed_at::text, a.created_at::text
     FROM assignments a
     JOIN draw_versions dv ON dv.id = a.draw_version_id
     JOIN exchanges e ON e.id = a.exchange_id
     JOIN memberships m ON m.exchange_id = a.exchange_id AND m.user_id = a.giver_id
     JOIN profiles p ON p.user_id = a.receiver_id
     WHERE a.giver_id = $1
       AND m.status = 'approved'
       AND e.status = 'sorteado'
       AND dv.version_number = e.current_draw_version
     ORDER BY a.created_at DESC`,
    [userId]
  );

  const privacyReqsRes = await dbQuery(
    `SELECT id, request_type, status, notes, created_at::text, processed_at::text
     FROM privacy_requests WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId]
  );

  return {
    exportedAt: new Date().toISOString(),
    supportReports: reports.rows,
    myBudgetVotes: votes.rows,
    passkeys: passkeys.rows,
    passkeySessions: sessions.rows,
    peopleIRepresent: represented.rows,
    myPhotos: photos.rows.map(p => ({ wishId: p.wish_id, contentType: 'image/jpeg', base64: Buffer.from(p.image).toString('base64') })),
    giftPreferences: tastesRes.rows[0] || {},
    mySentMessages: messagesRes.rows,
    notificationDevices: notificationsRes.rows,
    confidentialityNotice:
      'Por diseño de confidencialidad de Papelito, esta exportación incluye tus datos, deseos, selecciones, compras propias y personas a quienes regalas. La identidad de quien te regala y los datos privados de terceros permanecen reservados.',
    profile: profileRes.rows[0] || null,
    consents: consentsRes.rows,
    memberships: membershipsRes.rows,
    wishes: wishesRes.rows,
    wishSelections: selectionsRes.rows,
    myGiftPurchases: purchasesRes.rows,
    myGiverAssignments: assignmentsAsGiverRes.rows,
    privacyRequests: privacyReqsRes.rows,
  };
}

export interface OrganizedExchangeImpact {
  id: string;
  name: string;
  status: string;
  otherApprovedMembers: Array<{ userId: string; alias: string }>;
  otherPendingCount: number;
}

export interface AccountDeletionImpact {
  activeOrganizedWithOthers: OrganizedExchangeImpact[];
  soloOrganizedExchanges: Array<{ id: string; name: string; status: string }>;
  participatingDrawnExchanges: Array<{ id: string; name: string; isOrganizer: boolean }>;
  activeDeleteRequest: {
    id: string;
    status: string;
    notes: string | null;
    createdAt: string;
    processedAt: string | null;
  } | null;
}

const ACTIVE_EXCHANGE_STATUSES = new Set([
  'borrador',
  'inscripcion_abierta',
  'inscripcion_cerrada',
  'sorteado',
]);

export const RECENT_AUTH_MAX_AGE_SECONDS = 15 * 60; // 15 minutes

export async function getAccountDeletionImpactWithClient(
  client: TransactionClient,
  userId: string
): Promise<AccountDeletionImpact> {
  const orgExRes = await client.query<{
    id: string;
    name: string;
    status: string;
  }>(
    `SELECT id::text AS id, name, status
     FROM exchanges
     WHERE organizer_id = $1
     ORDER BY created_at DESC, id ASC`,
    [userId]
  );

  const activeOrganizedWithOthers: OrganizedExchangeImpact[] = [];
  const soloOrganizedExchanges: Array<{ id: string; name: string; status: string }> = [];

  for (const ex of orgExRes.rows) {
    const othersRes = await client.query<{
      user_id: string;
      status: string;
      alias: string;
    }>(
      `SELECT m.user_id, m.status, p.alias
       FROM memberships m
       JOIN profiles p ON p.user_id = m.user_id
       WHERE m.exchange_id = $1
         AND m.user_id <> $2
         AND m.status IN ('approved', 'pending')
       ORDER BY m.joined_at ASC, m.user_id ASC`,
      [ex.id, userId]
    );

    const otherApprovedMembers = othersRes.rows
      .filter((r) => r.status === 'approved')
      .map((r) => ({ userId: r.user_id, alias: r.alias }));
    const otherPendingCount = othersRes.rows.filter((r) => r.status === 'pending').length;

    if (otherApprovedMembers.length === 0 && otherPendingCount === 0) {
      soloOrganizedExchanges.push({
        id: ex.id,
        name: ex.name,
        status: ex.status,
      });
    } else if (ACTIVE_EXCHANGE_STATUSES.has(ex.status)) {
      activeOrganizedWithOthers.push({
        id: ex.id,
        name: ex.name,
        status: ex.status,
        otherApprovedMembers,
        otherPendingCount,
      });
    }
  }

  const drawnRes = await client.query<{
    id: string;
    name: string;
    is_organizer: boolean;
  }>(
    `SELECT DISTINCT
       e.id::text AS id,
       e.name,
       (e.organizer_id = $1) AS is_organizer
     FROM exchanges e
     LEFT JOIN memberships m ON m.exchange_id = e.id AND m.user_id = $1
     LEFT JOIN draw_versions dv ON dv.exchange_id = e.id AND dv.version_number = e.current_draw_version
     LEFT JOIN assignments a ON a.draw_version_id = dv.id AND (a.giver_id = $1 OR a.receiver_id = $1)
     WHERE e.status = 'sorteado'
       AND ((m.user_id = $1 AND m.status = 'approved') OR a.id IS NOT NULL)
     ORDER BY e.name ASC`,
    [userId]
  );

  const reqRes = await client.query<{
    id: string;
    status: string;
    notes: string | null;
    created_at: string;
    processed_at: string | null;
  }>(
    `SELECT id::text AS id, status, notes, created_at::text AS created_at, processed_at::text AS processed_at
     FROM privacy_requests
     WHERE user_id = $1 AND request_type = 'delete'
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId]
  );

  const latestReq = reqRes.rows[0];

  return {
    activeOrganizedWithOthers,
    soloOrganizedExchanges,
    participatingDrawnExchanges: drawnRes.rows.map((r) => ({
      id: r.id,
      name: r.name,
      isOrganizer: r.is_organizer,
    })),
    activeDeleteRequest: latestReq
      ? {
          id: latestReq.id,
          status: latestReq.status,
          notes: latestReq.notes,
          createdAt: latestReq.created_at,
          processedAt: latestReq.processed_at,
        }
      : null,
  };
}

export async function getAccountDeletionImpact(userId: string): Promise<AccountDeletionImpact> {
  return await dbTransaction(async (client) => {
    return await getAccountDeletionImpactWithClient(client, userId);
  });
}

export interface RequestAccountDeletionInput {
  confirmPhrase: string;
  confirmIrreversible: boolean;
  confirmOrganizerImpact?: boolean;
  notes?: string;
  sessionAuthenticatedAt?: Date | string | null;
  referenceNow?: Date;
  maxSessionAgeSeconds?: number;
}

export interface RequestAccountDeletionResult {
  requestId: string;
  status: 'received';
  createdAt: string;
  transferredExchanges: Array<{ id: string; name: string; newOrganizerUserId: string; newOrganizerAlias: string }>;
  canceledExchanges: Array<{ id: string; name: string }>;
}

/**
 * Validates recent authentication, explicit confirmation, and active organizer constraints
 * before registering a formal account deletion request (`privacy_requests` with `request_type = 'delete'`).
 * Never silently deletes active third-party exchanges: if the user organizes active exchanges with
 * other participants, requires transferring/closing them first OR explicit `confirmOrganizerImpact: true`
 * (which immediately transfers organizer role to the earliest approved member or cancels if only pending).
 */
export async function requestAccountDeletion(
  userId: string,
  input: RequestAccountDeletionInput
): Promise<RequestAccountDeletionResult> {
  if (!input.confirmIrreversible) {
    throw new Error('Debes confirmar expresamente que comprendes el alcance de la solicitud de baja.');
  }

  const normalizedPhrase = (input.confirmPhrase || '').trim().toUpperCase();
  if (
    normalizedPhrase !== 'SOLICITAR ELIMINACION' &&
    normalizedPhrase !== 'SOLICITAR ELIMINACIÓN' &&
    normalizedPhrase !== 'ELIMINAR MI CUENTA'
  ) {
    throw new Error(
      'Debes escribir exactamente SOLICITAR ELIMINACION (o ELIMINAR MI CUENTA) para confirmar la solicitud.'
    );
  }

  const referenceNow = input.referenceNow ?? new Date();
  const maxAgeSec = input.maxSessionAgeSeconds ?? RECENT_AUTH_MAX_AGE_SECONDS;
  if (!input.sessionAuthenticatedAt) {
    throw new Error(
      'Por seguridad, esta operación requiere una sesión autenticada recientemente. Cierra sesión y vuelve a ingresar antes de continuar.'
    );
  }

  const sessionAuthMs = new Date(input.sessionAuthenticatedAt).getTime();
  if (
    Number.isNaN(sessionAuthMs) ||
    sessionAuthMs > referenceNow.getTime() ||
    referenceNow.getTime() - sessionAuthMs > maxAgeSec * 1000
  ) {
    throw new Error(
      `Por seguridad, para solicitar la eliminación de tu cuenta debes haber iniciado sesión en los últimos ${Math.floor(maxAgeSec / 60)} minutos. Cierra sesión y vuelve a entrar para renovar tu autenticación.`
    );
  }

  return await dbTransaction(async (client) => {
    const profLock = await client.query<{ user_id: string }>(
      `SELECT user_id FROM profiles WHERE user_id = $1 FOR UPDATE`,
      [userId]
    );
    if (profLock.rowCount === 0) {
      throw new Error('Perfil de usuario no encontrado.');
    }

    // Lock all exchanges organized by this user
    await client.query(
      `SELECT id FROM exchanges WHERE organizer_id = $1 ORDER BY id ASC FOR UPDATE`,
      [userId]
    );

    const impact = await getAccountDeletionImpactWithClient(client, userId);

    const transferredExchanges: Array<{
      id: string;
      name: string;
      newOrganizerUserId: string;
      newOrganizerAlias: string;
    }> = [];
    const canceledExchanges: Array<{ id: string; name: string }> = [];

    if (impact.activeOrganizedWithOthers.length > 0) {
      if (!input.confirmOrganizerImpact) {
        const names = impact.activeOrganizedWithOthers.map((e) => `«${e.name}»`).join(', ');
        throw new Error(
          `Organizas intercambios activos con otras personas (${names}). Transfiere la organización o finaliza/cancela esos intercambios desde su detalle, o marca la confirmación adicional para transferir automáticamente la organización al participante aprobado más antiguo.`
        );
      }

      const nowIso = referenceNow.toISOString();
      for (const activeEx of impact.activeOrganizedWithOthers) {
        if (activeEx.otherApprovedMembers.length > 0) {
          const nextOrg = activeEx.otherApprovedMembers[0];
          await client.query(
            `UPDATE exchanges SET organizer_id = $1, updated_at = $2::timestamptz WHERE id = $3`,
            [nextOrg.userId, nowIso, activeEx.id]
          );
          await client.query(
            `UPDATE memberships SET is_organizer = (user_id = $1) WHERE exchange_id = $2`,
            [nextOrg.userId, activeEx.id]
          );
          await client.query(
            `UPDATE invitations SET created_by = $1 WHERE exchange_id = $2 AND created_by = $3`,
            [nextOrg.userId, activeEx.id, userId]
          );
          transferredExchanges.push({
            id: activeEx.id,
            name: activeEx.name,
            newOrganizerUserId: nextOrg.userId,
            newOrganizerAlias: nextOrg.alias,
          });
        } else {
          // Only pending members exist (no approved member to transfer to): cancel cleanly
          await client.query(
            `UPDATE invitations SET revoked_at = $1::timestamptz WHERE exchange_id = $2 AND revoked_at IS NULL`,
            [nowIso, activeEx.id]
          );
          await client.query(
            `UPDATE exchanges
             SET status = 'cancelado',
                 closed_at = COALESCE(closed_at, $1::timestamptz),
                 updated_at = $1::timestamptz
             WHERE id = $2`,
            [nowIso, activeEx.id]
          );
          canceledExchanges.push({ id: activeEx.id, name: activeEx.name });
        }
      }
    }

    const existingPending = await client.query<{ id: string; created_at: string }>(
      `SELECT id::text AS id, created_at::text AS created_at
       FROM privacy_requests
       WHERE user_id = $1 AND request_type = 'delete' AND status IN ('received', 'processing')
       ORDER BY created_at DESC
       LIMIT 1
       FOR UPDATE`,
      [userId]
    );

    const resolutionNoteParts: string[] = [];
    if (input.notes?.trim()) {
      resolutionNoteParts.push(input.notes.trim());
    }
    if (transferredExchanges.length > 0) {
      resolutionNoteParts.push(
        `Organización transferida en: ${transferredExchanges.map((t) => `${t.name} -> ${t.newOrganizerAlias}`).join('; ')}`
      );
    }
    if (canceledExchanges.length > 0) {
      resolutionNoteParts.push(
        `Intercambios sin aprobados cancelados: ${canceledExchanges.map((c) => c.name).join('; ')}`
      );
    }
    const combinedNotes = resolutionNoteParts.length > 0 ? resolutionNoteParts.join(' | ') : null;

    if (existingPending.rowCount > 0) {
      const upd = await client.query<{ id: string; created_at: string }>(
        `UPDATE privacy_requests
         SET notes = COALESCE($1, notes)
         WHERE id = $2
         RETURNING id::text AS id, created_at::text AS created_at`,
        [combinedNotes, existingPending.rows[0].id]
      );
      return {
        requestId: upd.rows[0].id,
        status: 'received',
        createdAt: upd.rows[0].created_at,
        transferredExchanges,
        canceledExchanges,
      };
    }

    const inserted = await client.query<{ id: string; created_at: string }>(
      `INSERT INTO privacy_requests (user_id, request_type, notes, status)
       VALUES ($1, 'delete', $2, 'received')
       RETURNING id::text AS id, created_at::text AS created_at`,
      [userId, combinedNotes]
    );

    return {
      requestId: inserted.rows[0].id,
      status: 'received',
      createdAt: inserted.rows[0].created_at,
      transferredExchanges,
      canceledExchanges,
    };
  });
}

export interface PurgeUserAppDataOptions {
  confirmOrganizerImpact?: boolean;
  referenceNow?: Date;
}

export interface PurgeUserAppDataResult {
  userId: string;
  deletedProfile: boolean;
  deletedSoloExchangeIds: string[];
  transferredExchangeIds: Array<{ exchangeId: string; newOrganizerUserId: string }>;
  invalidatedDrawnExchangeIds: string[];
}

/**
 * Executes the atomic, transactional removal of all user data in `public`:
 * 1) Never silently deletes exchanges containing other approved/pending members:
 *    - Solo exchanges (where user is the only member) are deleted.
 *    - Active multi-member exchanges organized by the user require `confirmOrganizerImpact: true`
 *      (or prior manual transfer/closure) and transfer `organizer_id` to the earliest approved member.
 *    - Closed multi-member exchanges organized by the user transfer `organizer_id` to an approved member
 *      so historical records remain intact until the 12-month retention window expires.
 * 2) Preserves draw secrecy and prevents broken assignments:
 *    - Any remaining `sorteado` exchange where the user was an approved member or in the current draw
 *      has its current `draw_versions` row marked with `invalidation_reason`, its `assignments` cleared
 *      for that invalidated version, and its status reverted to `'inscripcion_abierta'` so the organizer
 *      can repeat the draw with active members.
 * 3) Deletes `public.profiles` (cascading `consent_records`, `wishes`, `wish_selections`,
 *    `gift_purchases`, `privacy_requests`, `memberships`, `exclusions`, and `assignments`).
 */
export async function purgeUserAppDataWithClient(
  client: TransactionClient,
  userId: string,
  options: PurgeUserAppDataOptions = {}
): Promise<PurgeUserAppDataResult> {
  const referenceNow = options.referenceNow ?? new Date();
  const nowIso = referenceNow.toISOString();

  const profRes = await client.query<{ user_id: string }>(
    `SELECT user_id FROM profiles WHERE user_id = $1 FOR UPDATE`,
    [userId]
  );

  if (profRes.rowCount === 0) {
    return {
      userId,
      deletedProfile: false,
      deletedSoloExchangeIds: [],
      transferredExchangeIds: [],
      invalidatedDrawnExchangeIds: [],
    };
  }

  // Lock all exchanges where user is organizer or member in deterministic order
  const lockedExchangesRes = await client.query<{
    id: string;
    organizer_id: string;
    name: string;
    status: string;
    current_draw_version: number;
  }>(
    `SELECT id::text AS id, organizer_id, name, status, current_draw_version
     FROM exchanges
     WHERE organizer_id = $1
        OR id IN (SELECT exchange_id FROM memberships WHERE user_id = $1)
     ORDER BY id ASC
     FOR UPDATE`,
    [userId]
  );

  const deletedSoloExchangeIds: string[] = [];
  const transferredExchangeIds: Array<{ exchangeId: string; newOrganizerUserId: string }> = [];
  const invalidatedDrawnExchangeIds: string[] = [];
  const deletedExchangeIdSet = new Set<string>();

  // Step 1: Resolve exchanges where user is organizer (exchanges.organizer_id has ON DELETE RESTRICT)
  for (const ex of lockedExchangesRes.rows) {
    if (ex.organizer_id !== userId) continue;

    const othersRes = await client.query<{
      user_id: string;
      status: string;
      alias: string;
    }>(
      `SELECT m.user_id, m.status, p.alias
       FROM memberships m
       JOIN profiles p ON p.user_id = m.user_id
       WHERE m.exchange_id = $1
         AND m.user_id <> $2
         AND m.status IN ('approved', 'pending')
       ORDER BY m.joined_at ASC, m.user_id ASC
       FOR UPDATE`,
      [ex.id, userId]
    );

    const otherApproved = othersRes.rows.filter((r) => r.status === 'approved');
    const otherPending = othersRes.rows.filter((r) => r.status === 'pending');

    if (otherApproved.length === 0 && otherPending.length === 0) {
      await client.query(`DELETE FROM exchanges WHERE id = $1`, [ex.id]);
      deletedSoloExchangeIds.push(ex.id);
      deletedExchangeIdSet.add(ex.id);
      continue;
    }

    const isActive = ACTIVE_EXCHANGE_STATUSES.has(ex.status);
    if (isActive && !options.confirmOrganizerImpact) {
      throw new Error(
        `No se puede eliminar la cuenta mientras organiza el intercambio activo «${ex.name}» con terceros sin transferir la organización o confirmar explícitamente el impacto.`
      );
    }

    if (otherApproved.length > 0) {
      const nextOrganizerId = otherApproved[0].user_id;
      await client.query(
        `UPDATE exchanges SET organizer_id = $1, updated_at = $2::timestamptz WHERE id = $3`,
        [nextOrganizerId, nowIso, ex.id]
      );
      await client.query(
        `UPDATE memberships SET is_organizer = (user_id = $1) WHERE exchange_id = $2`,
        [nextOrganizerId, ex.id]
      );
      await client.query(
        `UPDATE invitations SET created_by = $1 WHERE exchange_id = $2 AND created_by = $3`,
        [nextOrganizerId, ex.id, userId]
      );
      transferredExchangeIds.push({
        exchangeId: ex.id,
        newOrganizerUserId: nextOrganizerId,
      });
    } else {
      // No approved members exist (only pending requests): cancel and remove exchange cleanly
      await client.query(`DELETE FROM exchanges WHERE id = $1`, [ex.id]);
      deletedSoloExchangeIds.push(ex.id);
      deletedExchangeIdSet.add(ex.id);
    }
  }

  // Step 2: Handle any remaining active 'sorteado' exchange where user was an approved participant or in current draw
  for (const ex of lockedExchangesRes.rows) {
    if (deletedExchangeIdSet.has(ex.id)) continue;
    if (ex.status !== 'sorteado' || ex.current_draw_version <= 0) continue;

    const dvRes = await client.query<{ id: string }>(
      `SELECT id::text AS id
       FROM draw_versions
       WHERE exchange_id = $1 AND version_number = $2
       FOR UPDATE`,
      [ex.id, ex.current_draw_version]
    );

    if (dvRes.rowCount === 0) continue;
    const drawVersionId = dvRes.rows[0].id;

    const inDrawRes = await client.query<{ id: string }>(
      `SELECT id::text AS id
       FROM assignments
       WHERE draw_version_id = $1 AND (giver_id = $2 OR receiver_id = $2)
       LIMIT 1`,
      [drawVersionId, userId]
    );

    const approvedMemberRes = await client.query<{ id: string }>(
      `SELECT id::text AS id
       FROM memberships
       WHERE exchange_id = $1 AND user_id = $2 AND status = 'approved'
       LIMIT 1`,
      [ex.id, userId]
    );

    if (inDrawRes.rowCount > 0 || approvedMemberRes.rowCount > 0) {
      await client.query(
        `UPDATE draw_versions
         SET invalidation_reason = COALESCE(
           invalidation_reason,
           'Un participante eliminó su cuenta; el sorteo anterior quedó invalidado y debe repetirse con los participantes activos.'
         )
         WHERE id = $1`,
        [drawVersionId]
      );

      await client.query(`DELETE FROM assignments WHERE draw_version_id = $1`, [drawVersionId]);

      await client.query(
        `UPDATE exchanges
         SET status = 'inscripcion_abierta',
             updated_at = $1::timestamptz
         WHERE id = $2`,
        [nowIso, ex.id]
      );

      invalidatedDrawnExchangeIds.push(ex.id);
    }
  }

  // Step 3: Delete profile row (cascades consent_records, wishes, wish_selections, gift_purchases, privacy_requests, memberships, exclusions, assignments)
  const delProf = await client.query(`DELETE FROM profiles WHERE user_id = $1`, [userId]);

  return {
    userId,
    deletedProfile: delProf.rowCount > 0,
    deletedSoloExchangeIds,
    transferredExchangeIds,
    invalidatedDrawnExchangeIds,
  };
}

export async function purgeUserAppDataTransactional(
  userId: string,
  options: PurgeUserAppDataOptions = {}
): Promise<PurgeUserAppDataResult> {
  return await dbTransaction(async (client) => {
    return await purgeUserAppDataWithClient(client, userId, options);
  });
}
