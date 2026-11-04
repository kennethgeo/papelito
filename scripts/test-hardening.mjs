// Regression tests for the 2026-11 audit fixes. PostgreSQL in memory (PGlite)
// and a fictitious auth provider served through a mocked fetch: no real
// accounts, sessions or services are used.
import fs from 'node:fs';
import { register } from 'node:module';
import { randomBytes } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

register('./ts-loader.mjs', import.meta.url);
process.env.NODE_ENV = 'test';
process.env.INVITATION_TOKEN_SECRET = randomBytes(32).toString('hex');
process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3042';

const { setTestDbAdapter } = await import('../src/lib/db/client.ts');
const pg = new PGlite();
for (const file of fs.readdirSync('neon/migrations').sort()) await pg.exec(fs.readFileSync(`neon/migrations/${file}`, 'utf8'));
await pg.exec(`CREATE SCHEMA neon_auth;
CREATE TABLE neon_auth."user" (id uuid PRIMARY KEY, email text, name text, banned boolean DEFAULT false);
CREATE TABLE neon_auth.account (id uuid PRIMARY KEY, "userId" uuid, "providerId" text);
CREATE TABLE neon_auth.session (id uuid PRIMARY KEY, "userId" uuid, token text, "userAgent" text, "createdAt" timestamptz DEFAULT now(), "expiresAt" timestamptz DEFAULT now()+interval '1 day');`);
let databaseDown = false;
const query = async (sql, params = []) => {
  if (databaseDown) throw Object.assign(new Error('connection terminated for fictitious@example.com'), { code: '57P01' });
  const r = await pg.query(sql, params);
  return { rows: r.rows, rowCount: r.rows.length || r.affectedRows || 0 };
};
setTestDbAdapter({ query });
const shared = { query, pg, setDatabaseDown: (value) => { databaseDown = value; } };
globalThis.__papelitoHardening = shared;

const tests = [];
// Each file in scripts/hardening registers its groups with this function.
globalThis.__papelitoTest = (name, fn) => tests.push({ name, fn });
for (const file of fs.readdirSync('scripts/hardening').filter((f) => f.endsWith('.mjs')).sort()) {
  await import(`./hardening/${file}`);
}

let failed = 0;
for (const { name, fn } of tests) {
  try {
    databaseDown = false;
    await fn(shared);
    console.log(`PASS ${name}`);
  } catch (error) {
    failed++;
    console.error(`FAIL ${name}\n${error?.stack || error}`);
  }
}
if (failed) process.exit(1);
console.log(`PASS hardening: ${tests.length} grupos`);
