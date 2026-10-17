import 'server-only';
import { dbTransaction } from '@/lib/db/client';
import { computeSecretSantaDraw, type ExclusionRule } from '@/lib/draw/algorithm';

export async function executeAndCommitDraw(
  exchangeId: string,
  actorUserId: string,
  expectedVersion: number,
  invalidationReason?: string
): Promise<{ success: boolean; version: number; count: number }> {
  if (typeof expectedVersion !== 'number' || !Number.isInteger(expectedVersion) || expectedVersion < 0) {
    throw new Error('Se requiere la versión esperada del sorteo (expectedVersion >= 0) para garantizar idempotencia.');
  }

  return await dbTransaction(async (client) => {
    // 1. Lock exchange row and verify authorization
    const exRes = await client.query<{
      organizer_id: string;
      status: string;
      current_draw_version: number;
      min_participants: number;
    }>(
      `SELECT organizer_id, status, current_draw_version, min_participants
       FROM exchanges
       WHERE id = $1 FOR UPDATE`,
      [exchangeId]
    );

    if (exRes.rowCount === 0) {
      throw new Error('Intercambio no encontrado.');
    }

    const ex = exRes.rows[0];
    if (ex.organizer_id !== actorUserId) {
      throw new Error('Solo el organizador puede realizar el sorteo.');
    }

    // Strict expected version check for idempotency / concurrency conflict prevention
    if (ex.current_draw_version !== expectedVersion) {
      throw new Error(
        `Conflicto de versión: el sorteo ya fue modificado (versión actual: ${ex.current_draw_version}, esperada: ${expectedVersion}). Actualiza la página.`
      );
    }

    if (ex.status !== 'inscripcion_abierta' && ex.status !== 'sorteado') {
      throw new Error('El estado del intercambio no permite realizar un sorteo.');
    }

    if (
      (ex.status === 'sorteado' || ex.current_draw_version > 0) &&
      (!invalidationReason || invalidationReason.trim().length < 6)
    ) {
      throw new Error('Para repetir un sorteo existente se debe ingresar un motivo válido (mínimo 6 caracteres).');
    }

    // 2. Fetch approved participants under transaction
    const membersRes = await client.query<{ user_id: string }>(
      `SELECT user_id
       FROM memberships
       WHERE exchange_id = $1 AND status = 'approved'`,
      [exchangeId]
    );

    const minRequired = Math.max(3, ex.min_participants || 3);
    if (membersRes.rowCount < minRequired) {
      throw new Error(
        `Se requieren al menos ${minRequired} participantes aprobados para sortear (actuales: ${membersRes.rowCount}).`
      );
    }

    const participantIds: string[] = membersRes.rows.map((m) => m.user_id);

    // 3. Fetch exclusions
    const exclRes = await client.query<{ giver_user_id: string; receiver_user_id: string }>(
      `SELECT giver_user_id, receiver_user_id
       FROM exclusions
       WHERE exchange_id = $1`,
      [exchangeId]
    );

    const exclusions: ExclusionRule[] = exclRes.rows.map((e) => ({
      giverId: e.giver_user_id,
      excludedReceiverId: e.receiver_user_id,
    }));

    // 4. Calculate secret santa matching via polynomial Kuhn algorithm & Hall theorem
    const drawResult = computeSecretSantaDraw(participantIds, exclusions);
    if (!drawResult.success) {
      throw new Error(drawResult.reason || 'No fue posible encontrar una combinación válida con las restricciones.');
    }

    // 5. Invariants verification: bijection and no self-assignments
    const givers = new Set<string>();
    const receivers = new Set<string>();
    for (const pair of drawResult.pairs) {
      if (pair.giverId === pair.receiverId) {
        throw new Error('Invariante violada: autoasignación detectada.');
      }
      givers.add(pair.giverId);
      receivers.add(pair.receiverId);
    }
    if (givers.size !== participantIds.length || receivers.size !== participantIds.length) {
      throw new Error('Invariante violada: el sorteo no es una biyección completa.');
    }

    // 6. Record new draw version
    const newVersion = ex.current_draw_version + 1;
    const versionRes = await client.query<{ id: string }>(
      `INSERT INTO draw_versions (exchange_id, version_number, invalidation_reason)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [exchangeId, newVersion, invalidationReason?.trim() || null]
    );
    const versionId = versionRes.rows[0].id;

    // 7. Insert assignments for this version
    for (const pair of drawResult.pairs) {
      await client.query(
        `INSERT INTO assignments (exchange_id, draw_version_id, giver_id, receiver_id)
         VALUES ($1, $2, $3, $4)`,
        [exchangeId, versionId, pair.giverId, pair.receiverId]
      );
    }

    // 8. Update exchange status and current version
    await client.query(
      `UPDATE exchanges
       SET status = 'sorteado', current_draw_version = $1, updated_at = now()
       WHERE id = $2`,
      [newVersion, exchangeId]
    );

    return { success: true, version: newVersion, count: drawResult.pairs.length };
  });
}
