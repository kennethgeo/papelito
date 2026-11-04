import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
import { mock } from 'node:test';
import { register } from 'node:module';

register('./ts-loader.mjs', import.meta.url);
const requests = new AsyncLocalStorage();
const pools = [];
const httpCalls = [];
let rejectConnect = false;
let failRollback = false;
let failEnd = false;

// Simulate Workers' I/O ownership: sockets belong to their creating request.
class RequestPool {
  constructor() {
    this.owner = requests.getStore();
    this.statements = [];
    this.closed = false;
    this.released = false;
    pools.push(this);
  }
  async connect() {
    assert.equal(requests.getStore(), this.owner, 'A socket crossed request contexts');
    if (rejectConnect) throw new Error('Connect failed');
    return {
      query: async (sql, params) => {
        assert.equal(requests.getStore(), this.owner);
        assert.equal(this.closed, false);
        this.statements.push(sql);
        await Promise.resolve();
        if (sql === 'ROLLBACK' && failRollback) throw new Error('Rollback failed on a broken socket');
        return { rows: [{ value: params?.[0] ?? 1 }], rowCount: 1 };
      },
      release: (error) => { this.released = true; this.releasedWithError = !!error; },
    };
  }
  async end() {
    assert.equal(requests.getStore(), this.owner, 'Close the connection before the request ends');
    this.closed = true;
    if (failEnd) throw new Error('Socket close failed');
  }
}

mock.module('@neondatabase/serverless', {
  namedExports: {
    Pool: RequestPool,
    neon: (_url, options) => ({
      query: async (sql, params) => {
        assert.equal(options.fullResults, true);
        httpCalls.push({ owner: requests.getStore(), sql, params });
        return { rows: [{ value: params[0] }], rowCount: 1 };
      },
    }),
  },
});
const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
const originalUrl = process.env.DATABASE_URL;
const originalMode = process.env.NODE_ENV;
try {
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { userAgent: 'Cloudflare-Workers' } });
  process.env.DATABASE_URL = 'postgresql://test:test@invalid.example/test';
  process.env.NODE_ENV = 'production';
  const { dbQuery, dbTransaction } = await import('../src/lib/db/client.ts');

  const reads = await Promise.all(['read-a', 'read-b'].map(owner => requests.run(owner, () => dbQuery('SELECT $1 AS value', [owner]))));
  assert.deepEqual(reads.map(x => x.rows[0].value), ['read-a', 'read-b']);
  assert.equal(httpCalls.length, 2);
  assert.equal(pools.length, 0, 'Single queries must use HTTP without retaining a socket');

  const results = await Promise.all(['tx-a', 'tx-b'].map(owner => requests.run(owner, () => dbTransaction(async client => {
    const result = await client.query('SELECT $1 AS value', [owner]);
    return result.rows[0].value;
  }))));
  assert.deepEqual(results, ['tx-a', 'tx-b']);
  assert.equal(pools.length, 2, 'Concurrent requests must own separate connections');
  for (const pool of pools) {
    assert.deepEqual(pool.statements, ['BEGIN', 'SELECT $1 AS value', 'COMMIT']);
    assert.ok(pool.closed && pool.released);
  }

  await requests.run('rollback', async () => {
    await assert.rejects(dbTransaction(async () => { throw new Error('Abort transaction'); }), /Abort transaction/);
  });
  assert.deepEqual(pools.at(-1).statements, ['BEGIN', 'ROLLBACK']);
  assert.ok(pools.at(-1).closed && pools.at(-1).released);

  rejectConnect = true;
  await requests.run('failed-connect', async () => {
    await assert.rejects(dbTransaction(async () => assert.fail('Callback must not run')), /Connect failed/);
  });
  assert.ok(pools.at(-1).closed, 'A failed connection attempt must also dispose its pool');
  rejectConnect = false;
  failRollback = true;
  const logged = [];
  const originalError = console.error;
  console.error = (line) => logged.push(String(line));
  try {
    await requests.run('rollback-fails', async () => {
      await assert.rejects(dbTransaction(async () => { throw new Error('Original business error'); }), /Original business error/,
        'a failed ROLLBACK must not replace the original error');
    });
    assert.ok(pools.at(-1).releasedWithError, 'a connection whose ROLLBACK failed is destroyed, not reused');
    failRollback = false;
    failEnd = true;
    const committed = await requests.run('end-fails', () => dbTransaction(async (client) => (await client.query('SELECT $1 AS value', ['ok'])).rows[0].value));
    assert.equal(committed, 'ok', 'a committed transaction is not reported as failed because closing the socket failed');
    failEnd = false;
  } finally {
    console.error = originalError;
  }
  assert.ok(logged.some((line) => line.includes('db.rollback_failed')) && logged.some((line) => line.includes('db.pool_end_failed')), 'cleanup failures are logged, not hidden');
  assert.ok(logged.every((line) => !line.includes('broken socket') && !line.includes('Socket close failed')), 'logs carry the error class, not its message');
  console.log('PASS Workers DB: concurrent HTTP reads, request-owned transactions, commit, rollback, cleanup on connect failure and failed ROLLBACK/close');
} finally {
  if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
  else delete globalThis.navigator;
  if (originalUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalUrl;
  if (originalMode === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalMode;
  mock.restoreAll();
}
