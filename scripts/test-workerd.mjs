// Serves the built Workers bundle with workerd (`wrangler dev`, local mode) and
// checks routes, headers and failure states. Requires `npm run build:vinext`.
// No Cloudflare credentials, Neon database or Neon Auth service are contacted:
// scenarios use either no configuration or unreachable loopback addresses.
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const configResult = spawnSync(process.execPath, ["scripts/deploy-cloudflare-web.mjs", "--config-only"], { cwd: root, encoding: "utf8" });
if (configResult.status !== 0) {
  console.error(configResult.stderr || configResult.stdout);
  throw new Error("Run npm run build:vinext before test:workerd.");
}
const configPath = configResult.stdout.trim().split("\n").at(-1);

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
    server.on("error", reject);
  });
}

async function startWorker(vars = {}) {
  const port = await freePort();
  const varArgs = Object.entries(vars).flatMap(([key, value]) => ["--var", `${key}:${value}`]);
  const child = spawn(process.execPath, [
    path.join(root, "node_modules/wrangler/bin/wrangler.js"), "dev", "--config", configPath,
    "--ip", "127.0.0.1", "--port", String(port), "--log-level", "error", "--show-interactive-dev-session=false", ...varArgs,
  ], { cwd: root, env: { ...process.env, CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "false", CLOUDFLARE_INCLUDE_PROCESS_ENV: "false", WRANGLER_SEND_METRICS: "false", CI: "true" }, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 120; i++) {
    if (child.exitCode !== null) throw new Error(`workerd exited early:\n${output}`);
    try {
      const response = await fetch(`${base}/manifest.webmanifest`);
      if (response.ok) return { base, stop: () => child.kill("SIGTERM"), output: () => output };
    } catch { /* not ready yet */ }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  child.kill("SIGTERM");
  throw new Error(`workerd did not start:\n${output}`);
}

function smoke(base, profile) {
  const result = spawnSync(process.execPath, ["scripts/smoke-check.mjs", "--base", base, "--profile", profile], { cwd: root, encoding: "utf8" });
  process.stdout.write(result.stdout);
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    throw new Error(`Smoke check failed against workerd (${profile}).`);
  }
}

function check(condition, message) {
  if (!condition) throw new Error(message);
}

// Fake credentials only: every address is an unreachable loopback port.
const UNREACHABLE = {
  DATABASE_URL: "postgresql://papelito:ficticia@127.0.0.1:9/neondb",
  NEON_AUTH_BASE_URL: "http://127.0.0.1:9/neondb/auth",
  NEON_AUTH_COOKIE_SECRET: "0123456789abcdef0123456789abcdef-prueba",
};
const PASSKEY_COOKIE = `__Host-papelito_passkey=${"a".repeat(43)}`;
const NEON_COOKIE = "__Secure-neon-auth.session_token=sesion-ficticia";

async function page(base, path, cookie) {
  const response = await fetch(`${base}${path}`, { headers: cookie ? { cookie } : {}, redirect: "manual" });
  return { response, body: await response.text() };
}

function assertNoMaskedFailure(body, label) {
  check(!/data-dgst=/.test(body), `${label}: server render error streamed to the client`);
  check(!/This page couldn.t load/.test(body), `${label}: English default error page`);
  check(!/Error connecting|NeonDbError|fetch failed|TypeError/.test(body), `${label}: internal error text exposed`);
  check(!/La mitad del regalo/.test(body), `${label}: outage presented as signed out (welcome page)`);
  check(!/Confirmá tu consentimiento|consentimiento vigente/.test(body), `${label}: outage presented as pending consent`);
}

const scenarios = [
  {
    name: "sin servicios configurados (equivalente al modo demo)",
    vars: {},
    run: async (base) => {
      smoke(base, "unconfigured");
      // CI builds with PAPELITO_BUILD_ID: the bundle must report that same build.
      if (process.env.PAPELITO_BUILD_ID) {
        const { version } = await (await fetch(`${base}/api/version`)).json();
        check(version === process.env.PAPELITO_BUILD_ID, `/api/version reports ${version}, expected ${process.env.PAPELITO_BUILD_ID}`);
      }
    },
  },
  {
    name: "base de datos y Neon Auth caídos: estado desconocido explícito",
    vars: UNREACHABLE,
    run: async (base) => {
      for (const [cookie, label] of [[PASSKEY_COOKIE, "passkey"], [NEON_COOKIE, "Neon Auth"]]) {
        const home = await page(base, "/", cookie);
        check(home.response.status === 200, `/ (${label}) status ${home.response.status}`);
        check(/No pudimos confirmar tu sesión/.test(home.body), `/ (${label}) must explain the unknown session`);
        assertNoMaskedFailure(home.body, `/ (${label})`);
      }
      const guest = await page(base, "/");
      check(/La mitad del regalo/.test(guest.body), "guests still see the welcome page without touching services");
      const join = await page(base, "/unirse/token-ficticio-0123456789");
      check(/No pudimos revisar esta invitación/.test(join.body), "/unirse must report the outage, not an invalid invitation");
      assertNoMaskedFailure(join.body, "/unirse");
      check(!/Invitación no disponible/.test(join.body), "/unirse outage must not claim the invitation is invalid");
      // The personal papelito page holds no data and needs no service to load:
      // the link's secret stays in the browser (URL fragment) until it is posted.
      const personal = await page(base, "/papelito");
      check(personal.response.status === 200 && /Tu papelito/.test(personal.body), `/papelito status ${personal.response.status}`);
      assertNoMaskedFailure(personal.body, "/papelito");
      const photo = await fetch(`${base}/api/papelito/fotos`, { method: "POST", headers: { "content-type": "application/json", origin: base }, body: JSON.stringify({ token: "a".repeat(64), wishId: "00000000-0000-4000-8000-000000000000" }) });
      check(photo.status === 503, `/api/papelito/fotos must report the outage (status ${photo.status})`);
      const guarded = await fetch(`${base}/api/auth/update-user`, { method: "POST", headers: { cookie: NEON_COOKIE, "content-type": "application/json", origin: base }, body: "{}" });
      check(guarded.status === 503 && (await guarded.json()).code === "SESSION_CHECK_UNAVAILABLE", `/api/auth/update-user must fail closed (status ${guarded.status})`);
      const logout = await fetch(`${base}/auth/logout`, { method: "POST", headers: { cookie: `${NEON_COOKIE}; ${PASSKEY_COOKIE}`, origin: base }, redirect: "manual" });
      check(logout.status === 303, `/auth/logout status ${logout.status}`);
      check(logout.headers.getSetCookie().some((c) => c.startsWith("__Secure-neon-auth.session_token=;") && /Max-Age=0/i.test(c)), "logout must clear the session cookie during an outage");
    },
  },
];

let failed = false;
for (const scenario of scenarios) {
  const worker = await startWorker(scenario.vars);
  try {
    await scenario.run(worker.base);
    console.log(`PASS workerd: ${scenario.name}`);
  } catch (error) {
    failed = true;
    console.error(`FAIL workerd: ${scenario.name}\n${error.message}\n${worker.output().slice(-4000)}`);
  } finally {
    worker.stop();
  }
}
if (failed) process.exit(1);
