import 'server-only';
import { neon, Pool } from '@neondatabase/serverless';
import { logError } from '@/lib/observability/log';

export interface QueryResult<T = unknown> {
  rows: T[];
  rowCount: number;
}

export interface DbClient {
  query<T = unknown>(text: string, params?: unknown[]): Promise<QueryResult<T>>;
}

export type TransactionClient = DbClient;

let poolInstance: Pool | null = null;
let testDbAdapter: DbClient | null = null;

function getActiveTestAdapter(): DbClient | null {
  return process.env.NODE_ENV === 'test' ? testDbAdapter : null;
}

export function isDatabaseConfigured(): boolean {
  if (getActiveTestAdapter()) return true;
  const url = process.env.DATABASE_URL;
  return Boolean(url && (url.startsWith('postgres://') || url.startsWith('postgresql://')));
}

export function setTestDbAdapter(adapter: DbClient | null) {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('setTestDbAdapter solo está permitido cuando NODE_ENV === "test".');
  }
  testDbAdapter = adapter;
}

function isWorkersRuntime(): boolean {
  return typeof navigator !== 'undefined' && navigator.userAgent === 'Cloudflare-Workers';
}

function connectionString(): string {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL no está configurada.');
  }
  return connectionString;
}

function getPool(): Pool {
  if (poolInstance) return poolInstance;
  poolInstance = new Pool({
    connectionString: connectionString(),
    max: 10,
    idleTimeoutMillis: 30000,
  });
  return poolInstance;
}

export async function dbQuery<T = unknown>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  const activeTestAdapter = getActiveTestAdapter();
  if (activeTestAdapter) {
    return activeTestAdapter.query<T>(text, params);
  }

  // HTTP has no socket to reuse across Worker request contexts.
  if (isWorkersRuntime()) {
    const sql = neon(connectionString(), { fullResults: true });
    const res = await sql.query(text, params);
    return { rows: res.rows as T[], rowCount: res.rowCount ?? res.rows.length };
  }

  const pool = getPool();
  const res = await pool.query(text, params);
  return {
    rows: res.rows as T[],
    rowCount: res.rowCount ?? res.rows.length,
  };
}

export async function dbTransaction<T = unknown>(
  callback: (client: TransactionClient) => Promise<T>
): Promise<T> {
  const activeTestAdapter = getActiveTestAdapter();
  if (activeTestAdapter) {
    // For test adapter, run within BEGIN/COMMIT/ROLLBACK
    await activeTestAdapter.query('BEGIN');
    try {
      const result = await callback(activeTestAdapter);
      await activeTestAdapter.query('COMMIT');
      return result;
    } catch (err) {
      try {
        await activeTestAdapter.query('ROLLBACK');
      } catch (rollbackError) {
        logError('db.rollback_failed', rollbackError);
      }
      throw err;
    }
  }

  // Interactive transactions need one connection, owned by this invocation.
  // A module-level WebSocket pool cannot survive between Worker requests.
  const requestScoped = isWorkersRuntime();
  const pool = requestScoped
    ? new Pool({ connectionString: connectionString(), max: 1 })
    : getPool();
  let outcome: { ok: true; value: T } | { ok: false; error: unknown };
  try {
    const client = await pool.connect();
    let broken: unknown = undefined;
    try {
      await client.query('BEGIN');
      const txClient: TransactionClient = {
        async query<R = unknown>(text: string, params?: unknown[]) {
          const res = await client.query(text, params);
          return {
            rows: res.rows as R[],
            rowCount: res.rowCount ?? res.rows.length,
          };
        },
      };
      const result = await callback(txClient);
      await client.query('COMMIT');
      outcome = { ok: true, value: result };
    } catch (err) {
      outcome = { ok: false, error: err };
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        // Keep the original error; a failed ROLLBACK means the socket is unusable.
        broken = rollbackError;
        logError('db.rollback_failed', rollbackError);
      }
    } finally {
      try {
        // Passing the error destroys the connection instead of reusing it.
        client.release(broken instanceof Error ? broken : undefined);
      } catch (releaseError) {
        logError('db.release_failed', releaseError);
      }
    }
  } catch (connectError) {
    outcome = { ok: false, error: connectError };
  } finally {
    if (requestScoped) {
      try {
        await pool.end();
      } catch (endError) {
        // The transaction already finished: report the cleanup failure without
        // turning a committed change into an apparent error (or vice versa).
        logError('db.pool_end_failed', endError);
      }
    }
  }
  if (!outcome.ok) throw outcome.error;
  return outcome.value;
}

export async function closeDbPool(): Promise<void> {
  if (poolInstance) {
    const currentPool = poolInstance;
    poolInstance = null;
    await currentPool.end();
  }
}
