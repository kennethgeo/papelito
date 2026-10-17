import 'server-only';
import { dbQuery } from '@/lib/db/client';
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
