import 'server-only';
import { neon, Pool } from '@neondatabase/serverless';

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
      await activeTestAdapter.query('ROLLBACK');
      throw err;
    }
  }

  // Interactive transactions need one connection, owned by this invocation.
  // A module-level WebSocket pool cannot survive between Worker requests.
  const requestScoped = isWorkersRuntime();
  const pool = requestScoped
    ? new Pool({ connectionString: connectionString(), max: 1 })
    : getPool();
  try {
    const client = await pool.connect();
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
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } finally {
    if (requestScoped) await pool.end();
  }
}

export async function closeDbPool(): Promise<void> {
  if (poolInstance) {
    const currentPool = poolInstance;
    poolInstance = null;
    await currentPool.end();
  }
}
