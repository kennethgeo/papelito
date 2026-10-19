import { Pool } from '@neondatabase/serverless';
import { LEGAL_CONSTANTS } from '../legal/constants';

export const RETENTION_ELIGIBLE_STATUSES = ['finalizado', 'cancelado'] as const;
export const MIN_RETENTION_MONTHS = LEGAL_CONSTANTS.RETENTION_MONTHS_AFTER_CLOSE;

export interface RetentionQueryClient {
  query<T = unknown>(
    text: string,
    params?: unknown[]
  ): Promise<{ rows: T[]; rowCount: number }>;
}

export interface PurgeExpiredExchangesOptions {
  referenceNow?: Date;
  dryRun?: boolean;
  retentionMonths?: number;
}

export interface PurgeExpiredExchangesResult {
  dryRun: boolean;
  referenceNow: string;
  cutoffIso: string;
  retentionMonths: number;
  eligibleCount: number;
  deletedCount: number;
  exchangeIds: string[];
}

/**
 * Purges exchanges in terminal state ('finalizado' or 'cancelado') whose closed_at
 * timestamp is at least `retentionMonths` (minimum 12 real calendar months) in the past.
 * Never selects or deletes active exchanges ('borrador', 'inscripcion_abierta',
 * 'inscripcion_cerrada', 'sorteado') or rows with closed_at IS NULL.
 */
export async function purgeExpiredClosedExchangesWithClient(
  client: RetentionQueryClient,
  options: PurgeExpiredExchangesOptions = {}
): Promise<PurgeExpiredExchangesResult> {
  const referenceNow = options.referenceNow ?? new Date();
  if (!(referenceNow instanceof Date) || Number.isNaN(referenceNow.getTime())) {
    throw new Error('referenceNow debe ser una fecha válida.');
  }

  const retentionMonths = options.retentionMonths ?? MIN_RETENTION_MONTHS;
  if (
    !Number.isInteger(retentionMonths) ||
    retentionMonths < MIN_RETENTION_MONTHS ||
    retentionMonths > 120
  ) {
    throw new Error(
      `El periodo de retención debe ser un entero de al menos ${MIN_RETENTION_MONTHS} meses.`
    );
  }

  const dryRun = Boolean(options.dryRun);
  const referenceIso = referenceNow.toISOString();
  if (!dryRun) {
    for (const table of ['webauthn_challenges', 'app_passkey_sessions', 'app_session_revocations']) {
      await client.query(`DELETE FROM ${table} WHERE expires_at <= $1::timestamptz`, [referenceIso]);
    }
  }

  const cutoffRes = await client.query<{ cutoff_iso: string }>(
    `SELECT ($1::timestamptz - make_interval(months => $2))::text AS cutoff_iso`,
    [referenceIso, retentionMonths]
  );
  const cutoffIso = cutoffRes.rows[0]?.cutoff_iso ?? '';

  const candidatesRes = await client.query<{
    id: string;
    name: string;
    status: string;
    closed_at: string;
  }>(
    `SELECT
       id::text AS id,
       name,
       status,
       closed_at::text AS closed_at
     FROM public.exchanges
     WHERE status IN ('finalizado', 'cancelado')
       AND closed_at IS NOT NULL
       AND closed_at <= ($1::timestamptz - make_interval(months => $2))
     ORDER BY closed_at ASC, id ASC
     FOR UPDATE`,
    [referenceIso, retentionMonths]
  );

  const candidateIds = candidatesRes.rows.map((r) => r.id);

  if (dryRun || candidateIds.length === 0) {
    return {
      dryRun,
      referenceNow: referenceIso,
      cutoffIso,
      retentionMonths,
      eligibleCount: candidateIds.length,
      deletedCount: 0,
      exchangeIds: candidateIds,
    };
  }

  const deleteRes = await client.query<{ id: string }>(
    `DELETE FROM public.exchanges
     WHERE id = ANY($1::uuid[])
       AND status IN ('finalizado', 'cancelado')
       AND closed_at IS NOT NULL
       AND closed_at <= ($2::timestamptz - make_interval(months => $3))
     RETURNING id::text AS id`,
    [candidateIds, referenceIso, retentionMonths]
  );

  return {
    dryRun: false,
    referenceNow: referenceIso,
    cutoffIso,
    retentionMonths,
    eligibleCount: candidateIds.length,
    deletedCount: deleteRes.rowCount,
    exchangeIds: deleteRes.rows.map((r) => r.id),
  };
}

export async function runStandaloneRetentionTransaction(
  options: PurgeExpiredExchangesOptions = {},
  connectionString = process.env.DATABASE_URL
): Promise<PurgeExpiredExchangesResult> {
  if (!connectionString) {
    throw new Error('DATABASE_URL no está configurada para ejecutar la retención programada.');
  }

  const pool = new Pool({
    connectionString,
    max: 1,
    idleTimeoutMillis: 5000,
  });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const txClient: RetentionQueryClient = {
      async query<R = unknown>(text: string, params?: unknown[]) {
        const res = await client.query(text, params);
        return {
          rows: res.rows as R[],
          rowCount: res.rowCount ?? res.rows.length,
        };
      },
    };
    const result = await purgeExpiredClosedExchangesWithClient(txClient, options);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

/**
 * Handler for the Netlify Scheduled Function (`netlify/functions/retention-cleanup.mts`).
 * Per Netlify Scheduled Functions specification, scheduled functions cannot be invoked via
 * public HTTP routes in production; Netlify's platform scheduler invokes them via POST
 * with `{ "next_run": "<ISO-8601 timestamp>" }`. Does not trust spoofable HTTP headers.
 */
export async function runNetlifyScheduledRetentionEvent(
  req: Request,
  deps: {
    env?: Record<string, string | undefined>;
    referenceNow?: Date;
    runCleanup?: (options: PurgeExpiredExchangesOptions) => Promise<PurgeExpiredExchangesResult>;
  } = {}
): Promise<Response> {
  if (req.method !== 'POST') {
    return Response.json(
      { ok: false, error: 'Método no permitido. Solo ejecución programada POST.' },
      { status: 405 }
    );
  }

  let parsedBody: Record<string, unknown> = {};
  try {
    const rawText = await req.text();
    if (rawText.trim().length > 0) {
      const json = JSON.parse(rawText);
      if (json && typeof json === 'object' && !Array.isArray(json)) {
        parsedBody = json as Record<string, unknown>;
      }
    }
  } catch {
    return Response.json(
      { ok: false, error: 'Evento programado inválido (JSON malformado).' },
      { status: 400 }
    );
  }

  const nextRun = typeof parsedBody.next_run === 'string' ? parsedBody.next_run.trim() : '';
  if (!nextRun || Number.isNaN(new Date(nextRun).getTime())) {
    return Response.json(
      { ok: false, error: 'Evento programado inválido: falta next_run válido del scheduler.' },
      { status: 400 }
    );
  }

  const env = deps.env ?? process.env;
  const dryRun = env.RETENTION_DRY_RUN === 'true';
  const runner = deps.runCleanup ?? ((opts) => runStandaloneRetentionTransaction(opts));

  try {
    const result = await runner({
      dryRun,
      referenceNow: deps.referenceNow ?? new Date(),
      retentionMonths: MIN_RETENTION_MONTHS,
    });
    return Response.json(
      {
        ok: true,
        nextRun,
        ...result,
      },
      { status: 200 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error interno en retención.';
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
