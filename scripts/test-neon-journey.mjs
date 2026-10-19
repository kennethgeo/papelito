import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { Pool } from "@neondatabase/serverless";
import {
  EXPECTED_PAPELITO_SCHEMA,
  ALL_PAPELITO_SCHEMA,
  EXPECTED_NEON_CONFIG,
} from "./db-migrate.mjs";

// Opt-in remote verification: a new child is completely sanitized before use, with fictional identities and finally-delete.
const project = "spring-frog-51248337";
const production = "br-royal-tooth-b4ru7kif";
const origin = "http://127.0.0.2:3042";
const fixturePath = path.resolve(".env.e2e-pilot.json");
const branchName = `codex-e2e-${randomUUID()}`;
const sanitizedClone = process.argv.includes("--sanitized-clone");
if (!sanitizedClone) {
  console.error(
    "Usá --sanitized-clone para autorizar una nueva rama descartable codex-e2e-* de Papelito: vacía sus 12 tablas y cuentas copiadas antes de probar y se elimina al terminar. No se creó ningún recurso.",
  );
  process.exit(1);
}
let branchId;
let server;
let pool;
let failed = false;
const logPath = path.resolve(".netlify/e2e-server.log");
fs.mkdirSync(".netlify", { recursive: true });
const cli =
  process.platform === "win32"
    ? (process.env.PATH || "")
        .split(path.delimiter)
        .map((dir) => path.join(dir, "node_modules/neon/dist/cli.js"))
        .find((candidate) => fs.existsSync(candidate))
    : null;
if (process.platform === "win32" && !cli)
  throw new Error(
    "Instalá la CLI Neon y completá neon login antes de esta prueba.",
  );
function neon(args, json = true) {
  let output;
  try {
    output = execFileSync(
      cli ? process.execPath : "neon",
      cli ? [cli, ...args] : args,
      { encoding: "utf8", stdio: "pipe", windowsHide: true, timeout: 90_000 },
    );
  } catch (err) {
    fs.writeFileSync(
      ".netlify/e2e-cli-error.log",
      String(err.stderr ?? "").replace(
        /postgres(?:ql)?:\/\/\S+/gi,
        "[conexión omitida]",
      ),
    );
    throw new Error(
      `Neon no pudo completar ${args[0]} ${args[1] ?? ""}. Revisá .netlify/e2e-cli-error.log.`,
    );
  }
  return json ? (output.trim() ? JSON.parse(output) : {}) : output.trim();
}
function isolated() {
  assert.ok(branchId?.startsWith("br-") && branchId !== production);
}
function api(suffix, method = "GET", fields = []) {
  isolated();
  return neon([
    "api",
    `/projects/${project}/branches/${branchId}${suffix}`,
    "-X",
    method,
    ...fields.flatMap(([key, value]) => ["-F", `${key}=${value}`]),
    "-o",
    "json",
  ]);
}
async function waitForServer() {
  for (let i = 0; i < 90; i++) {
    if (server.exitCode !== null)
      throw new Error(
        "El servidor de pruebas no pudo iniciar. Revisá .netlify/e2e-server.log.",
      );
    try {
      const r = await fetch(`${origin}/?mode=demo`, {
        signal: AbortSignal.timeout(2000),
      });
      if (r.ok) return;
    } catch {
      /* retry startup only */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("El servidor aislado no respondió.");
}
try {
  neon(["--version"], false);
  const branches = neon([
    "branches",
    "list",
    "--project-id",
    project,
    "--no-secrets",
    "-o",
    "json",
  ]);
  assert.ok(
    branches.some(
      (branch) => branch.id === production && branch.name === "production",
    ),
  );
  const created = neon([
    "branches",
    "create",
    "--project-id",
    project,
    "--name",
    branchName,
    "--parent",
    production,
    "--expires-at",
    new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    "--no-secrets",
    "-o",
    "json",
  ]);
  const branch = created.branch ?? created[0] ?? created;
  branchId = branch.id;
  isolated();
  assert.equal(branch.name, branchName);
  assert.equal(branch.project_id, project);
  assert.equal(branch.default, false);
  assert.equal(branch.primary, false);
  if (sanitizedClone) assert.equal(branch.parent_id, production);
  console.log("PASS rama temporal aislada creada:", branchId);
  const url = neon(
    ["connection-string", branchId, "--project-id", project],
    false,
  );
  const parsedDbUrl = new URL(url);
  assert.ok(parsedDbUrl.hostname.endsWith(".neon.tech"));
  assert.notEqual(
    parsedDbUrl.hostname.replace("-pooler.", "."),
    EXPECTED_NEON_CONFIG.directHost,
    "La conexión no puede apuntar al endpoint de producción",
  );
  assert.equal(parsedDbUrl.pathname, "/neondb");
  pool = new Pool({ connectionString: url, max: 1 });
  pool.on("error", () => {
    /* The disposable compute may restart during Auth provisioning. Never log the client. */
  });
  if (sanitizedClone) {
    // Only the newly created child is addressed. Never start the app with copied personal records.
    assert.equal(branch.parent_id, production);
    const copied = await pool.query('SELECT id FROM neon_auth."user"');
    for (const row of copied.rows) {
      assert.match(row.id, /^[0-9a-f-]{36}$/i);
      api(`/auth/users/${row.id}`, "DELETE");
    }
    const tables = Object.keys(ALL_PAPELITO_SCHEMA);
    const actual = await pool.query(
      "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
    );
    const actualTables = actual.rows.map(r => r.tablename);
    assert(actualTables.every(t => tables.includes(t)), 'La copia debe contener solo tablas de Papelito');
    assert(Object.keys(EXPECTED_PAPELITO_SCHEMA).every(t => actualTables.includes(t)), 'Debe existir el esquema base completo');
    await pool.query(
      `TRUNCATE TABLE ${actualTables.map((table) => `public."${table}"`).join(", ")} CASCADE`,
    );
    // Additive migration only after all copied application rows are removed.
    await pool.query(fs.readFileSync(path.resolve('neon/migrations/20261018_social_and_reminders.sql'), 'utf8'));
    for (const table of tables) {
      assert.equal(
        Number(
          (await pool.query(`SELECT count(*) AS n FROM public."${table}"`))
            .rows[0].n,
        ),
        0,
        `Quedan datos copiados en ${table}`,
      );
    }
    assert.equal(
      Number(
        (await pool.query('SELECT count(*) AS n FROM neon_auth."user"')).rows[0]
          .n,
      ),
      0,
    );
    assert.equal(
      Number(
        (await pool.query('SELECT count(*) AS n FROM neon_auth."session"'))
          .rows[0].n,
      ),
      0,
    );
    assert.equal(
      Number(
        (await pool.query('SELECT count(*) AS n FROM neon_auth."account"'))
          .rows[0].n,
      ),
      0,
    );
    console.log(
      "PASS copia temporal vaciada: cero cuentas y datos personales antes de iniciar la app.",
    );
  }
  assert.equal(
    Number((await pool.query("SELECT count(*) AS n FROM profiles")).rows[0].n),
    0,
    "La rama debe empezar sin perfiles de producción",
  );
  // The normal child inherits working Managed Auth; do not reprovision it or grant database privileges.
  const auth = api("/auth");
  assert.equal(auth.branch_id, branchId);
  const authUrl = auth.base_url;
  assert.equal(typeof authUrl, "string", "Auth no devolvió base_url");
  const parsedAuthUrl = new URL(authUrl);
  assert.ok(
    parsedAuthUrl.protocol === "https:" &&
      parsedAuthUrl.hostname.endsWith(".neon.tech") &&
      parsedAuthUrl.hostname.includes(".neonauth.") &&
      parsedAuthUrl.pathname === "/neondb/auth",
  );
  api("/auth/email_and_password", "PATCH", [
    ["enabled", true],
    ["require_email_verification", false],
    ["send_verification_email_on_sign_up", false],
    ["send_verification_email_on_sign_in", false],
    ["disable_sign_up", false],
  ]);
  api("/auth/allow_localhost", "PATCH", [["allow_localhost", true]]);
  api("/auth/domains", "POST", [
    ["domain", origin],
    ["auth_provider", "better_auth"],
  ]);
  if (!pool) {
    pool = new Pool({ connectionString: url, max: 1 });
    pool.on("error", () => {});
  }
  const out = fs.openSync(logPath, "w");
  server = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "127.0.0.2",
      "--port",
      "3042",
    ],
    {
      windowsHide: true,
      stdio: ["ignore", out, out],
      env: {
        ...process.env,
        DATABASE_URL: url,
        DATABASE_URL_UNPOOLED: url,
        NEON_AUTH_BASE_URL: authUrl,
        NEON_AUTH_COOKIE_SECRET: randomBytes(32).toString("hex"),
        INVITATION_TOKEN_SECRET: randomBytes(32).toString("hex"),
        NEXT_PUBLIC_APP_URL: origin,
      },
    },
  );
  fs.closeSync(out);
  await waitForServer();
  const fixtures = [];
  for (let i = 0; i < 4; i++) {
    const email = `papelito-e2e-${randomUUID()}@example.com`,
      password = randomBytes(24).toString("base64url");
    const response = await fetch(`${origin}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({ email, password, name: `Prueba ${i + 1}` }),
    });
    const data = await response.json();
    assert.equal(
      response.status,
      200,
      `Registro ficticio ${i + 1}: ${response.status}`,
    );
    assert.ok(data.user?.id);
    fixtures.push({
      email,
      password,
      id: data.user.id,
      name: `Prueba ${i + 1}`,
    });
    await pool.query(
      "INSERT INTO profiles(user_id,alias,full_name) VALUES($1,$2,$2)",
      [data.user.id, `Prueba ${i + 1}`],
    );
    const constants = fs.readFileSync("src/lib/legal/constants.ts", "utf8");
    const version = constants.match(/VERSION:\s*['"]([^'"]+)['"]/)?.[1];
    assert.ok(version);
    await pool.query(
      "INSERT INTO consent_records(user_id,terms_version,privacy_version) VALUES($1,$2,$2)",
      [data.user.id, version],
    );
  }
  fs.writeFileSync(
    fixturePath,
    JSON.stringify({ project, branchId, branchName, origin, fixtures }),
  );
  console.log(
    "PASS cuatro identidades ficticias creadas; sin correos ni cuentas reales.",
  );
  await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        "node_modules/@playwright/test/cli.js",
        "test",
        "--project=neon-aislado",
      ],
      {
        windowsHide: true,
        stdio: "inherit",
        env: { ...process.env, PAPELITO_E2E_REMOTE: "1" },
      },
    );
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error("Falló el recorrido de navegador con Neon real.")),
    );
  });
} catch (err) {
  failed = true;
  console.error(
    "FAIL",
    err instanceof Error ? err.message : "Prueba interrumpida",
  );
} finally {
  if (server) {
    server.kill();
    await Promise.race([
      new Promise((resolve) => server.once("exit", resolve)),
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]);
  }
  if (pool) await pool.end();
  if (fs.existsSync(fixturePath)) fs.unlinkSync(fixturePath);
  if (branchId) {
    try {
      isolated();
      const info = api("");
      const branch = info.branch ?? info;
      assert.equal(branch.name, branchName);
      assert.equal(branch.project_id, project);
      assert.equal(branch.init_source, "parent-data");
      if (sanitizedClone) assert.equal(branch.parent_id, production);
      assert.equal(branch.default, false);
      assert.equal(branch.primary, false);
      neon(
        ["branches", "delete", branchId, "--project-id", project, "-y"],
        false,
      );
      console.log(
        "PASS rama temporal y sus cuentas/datos eliminados:",
        branchId,
      );
    } catch {
      failed = true;
      console.error(
        `No se pudo limpiar ${branchId}. La rama tiene caducidad de 2 horas; revisá su eliminación en Neon.`,
      );
    }
  }
}
process.exitCode = failed ? 1 : 0;
