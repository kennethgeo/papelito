// Serves the built Workers bundle with workerd (wrangler dev, local mode) on
// 127.0.0.1:3043 for browser tests. No services configured: demo and public
// pages only. Requires `npm run build:vinext`.
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const config = spawnSync(process.execPath, ["scripts/deploy-cloudflare-web.mjs", "--config-only"], { cwd: root, encoding: "utf8" });
if (config.status !== 0) {
  process.stderr.write(config.stderr || config.stdout);
  process.exit(1);
}
const child = spawn(process.execPath, [
  path.join(root, "node_modules/wrangler/bin/wrangler.js"), "dev", "--config", config.stdout.trim().split("\n").at(-1),
  "--ip", "127.0.0.1", "--port", "3043", "--log-level", "error", "--show-interactive-dev-session=false",
], { cwd: root, stdio: "inherit", env: { ...process.env, WRANGLER_SEND_METRICS: "false", CI: "true" } });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 1));
