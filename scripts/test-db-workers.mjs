import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
import { mock } from 'node:test';
import { register } from 'node:module';

register('./ts-loader.mjs', import.meta.url);
const requests = new AsyncLocalStorage();
const pools = [];
const httpCalls = [];
let rejectConnect = false;

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
        return { rows: [{ value: params?.[0] ?? 1 }], rowCount: 1 };
      },
      release: () => { this.released = true; },
    };
  }
  async end() {
    assert.equal(requests.getStore(), this.owner, 'Close the connection before the request ends');
    this.closed = true;
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
  console.log('PASS Workers DB: concurrent HTTP reads, request-owned transactions, commit, rollback and cleanup on connect failure');
} finally {
  if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
  else delete globalThis.navigator;
  if (originalUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalUrl;
  if (originalMode === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalMode;
  mock.restoreAll();
}
