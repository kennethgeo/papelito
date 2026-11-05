// Serves the production build against a throwaway local PostgreSQL, so the
// browser suite can use real sessions, server actions and database writes with
// fictional people. No remote database or auth provider is involved: the auth
// base URL points at a closed local port, and tests sign in with the app's own
// session table.
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import pg from "pg";

const PORT = 3044;
const PG_PORT = 54329;
const PG_PASSWORD = "solo-para-esta-prueba-local";
const exe = process.platform === "win32" ? ".exe" : "";

function postgresBin() {
  const fromConfig = spawnSync("pg_config", ["--bindir"], { encoding: "utf8" });
  const candidates = [
    process.env.PAPELITO_PG_BIN,
    fromConfig.status === 0 ? fromConfig.stdout.trim() : "",
    "/usr/lib/postgresql/18/bin",
    "/usr/lib/postgresql/17/bin",
    "/usr/lib/postgresql/16/bin",
    "C:/Program Files/PostgreSQL/18/bin",
    "C:/Program Files/PostgreSQL/17/bin",
    "C:/Program Files/PostgreSQL/16/bin",
  ];
  return candidates.find((dir) => dir && fs.existsSync(path.join(dir, `initdb${exe}`)));
}

const bin = postgresBin();
if (!bin) throw new Error("PostgreSQL binaries not found (initdb). Set PAPELITO_PG_BIN.");

// A fixed folder, because Playwright ends this process abruptly: the next run clears it.
const dir = path.join(os.tmpdir(), "papelito-session-pg");
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
const passwordFile = path.join(dir, "password");
fs.writeFileSync(passwordFile, PG_PASSWORD);
const data = path.join(dir, "data");
const init = spawnSync(
  path.join(bin, `initdb${exe}`),
  ["-D", data, "-A", "password", "-U", "papelito", "--pwfile", passwordFile, "--no-sync"],
  { encoding: "utf8" },
);
if (init.status !== 0) throw new Error(`initdb failed: ${init.stderr}`);

const database = spawn(
  path.join(bin, `postgres${exe}`),
  ["-D", data, "-p", String(PG_PORT), "-h", "127.0.0.1", "-k", "", "-c", "fsync=off"],
  { stdio: "ignore" },
);

const pool = new pg.Pool({ host: "127.0.0.1", port: PG_PORT, user: "papelito", password: PG_PASSWORD, database: "postgres" });
pool.on("error", () => {});
let ready = false;
for (let i = 0; i < 100 && !ready && database.exitCode === null; i++) {
  try {
    await pool.query("SELECT 1");
    ready = true;
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
if (!ready) throw new Error("The temporary PostgreSQL server did not start.");

for (const file of fs.readdirSync("neon/migrations").sort()) {
  await pool.query(fs.readFileSync(`neon/migrations/${file}`, "utf8"));
}
// Neon Auth owns this table in production; own sessions only read these columns.
await pool.query(`
  CREATE SCHEMA IF NOT EXISTS neon_auth;
  CREATE TABLE IF NOT EXISTS neon_auth."user" (
    id uuid PRIMARY KEY,
    email text NOT NULL,
    name text NOT NULL,
    banned boolean NOT NULL DEFAULT false
  );
`);
await pool.end();

const preload = pathToFileURL(path.resolve("scripts/session-preload.mjs")).href;
const server = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(PORT)],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      NODE_OPTIONS: `--import=${preload}`,
      PAPELITO_SESSION_PG_PORT: String(PG_PORT),
      DATABASE_URL: `postgresql://papelito:${PG_PASSWORD}@papelito-session.test:${PG_PORT}/postgres`,
      DATABASE_URL_UNPOOLED: `postgresql://papelito:${PG_PASSWORD}@papelito-session.test:${PG_PORT}/postgres`,
      NEON_AUTH_BASE_URL: "http://127.0.0.1:9/neondb/auth",
      NEON_AUTH_COOKIE_SECRET: randomBytes(32).toString("hex"),
      INVITATION_TOKEN_SECRET: randomBytes(32).toString("hex"),
      PAPELITO_APP_URL: `http://127.0.0.1:${PORT}`,
    },
  },
);

function stop() {
  server.kill();
  database.kill();
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
server.on("exit", (code) => {
  database.kill();
  process.exit(code ?? 0);
});
