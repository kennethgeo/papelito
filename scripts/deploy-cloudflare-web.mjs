import { spawnSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readBuildOutput } from "@cloudflare/build-output-utils";
import { convertToWranglerConfig, InputConfigSchema } from "@cloudflare/config";

// Deploy Vinext's existing bundle with stable Wrangler. Keep the source config
// authoritative by using Cloudflare's converter instead of duplicating bindings.
const root = fileURLToPath(new URL("../", import.meta.url));
const output = await readBuildOutput(root);
const worker = output.workers.default;
if (Object.keys(output.workers).length !== 1 || output.containers.length) {
  throw new Error("This deploy script supports one web Worker and no containers.");
}
if (!worker.bundleDir || !worker.assetsDir) {
  throw new Error("Run npm run build:vinext before deploying the web Worker.");
}
if (Object.values(worker.config.manifest.modules).some(({ type }) => !["esm", "sourcemap"].includes(type))) {
  throw new Error("Review Wrangler module rules before deploying new module types.");
}
const { manifest, ...workerConfig } = worker.config;
const config = convertToWranglerConfig(InputConfigSchema.parse({ worker: workerConfig }));
Object.assign(config, {
  main: path.join(worker.bundleDir, manifest.mainModule),
  base_dir: worker.bundleDir,
  no_bundle: true,
  find_additional_modules: true,
  rules: [{ type: "ESModule", globs: ["**/*.js"], fallthrough: true }],
});
config.assets.directory = worker.assetsDir;
const configPath = path.join(root, ".cloudflare/output/v0/wrangler-web.json");
await writeFile(configPath, JSON.stringify(config, null, 2) + "\n");
const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--dry-run")) {
  throw new Error("Only --dry-run is supported as an additional deploy argument.");
}
const result = spawnSync(process.execPath, [
  path.join(root, "node_modules/wrangler/bin/wrangler.js"),
  "deploy", "--config", configPath, ...args,
], { cwd: root, stdio: "inherit" });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
