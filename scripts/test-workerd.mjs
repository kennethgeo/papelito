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
  ], { cwd: root, env: { ...process.env, WRANGLER_SEND_METRICS: "false", CI: "true" }, stdio: ["ignore", "pipe", "pipe"] });
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

const scenarios = [
  {
    name: "sin servicios configurados (equivalente al modo demo)",
    vars: {},
    run: async (base) => smoke(base, "unconfigured"),
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
