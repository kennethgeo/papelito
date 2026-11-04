// Prints the Worker version that currently receives the most traffic, from
// `wrangler deployments status --json`. Empty output means "unknown".
import { readFileSync } from "node:fs";

try {
  const deployment = JSON.parse(readFileSync(process.argv[2], "utf8"));
  const versions = Array.isArray(deployment?.versions) ? deployment.versions : [];
  const active = [...versions].sort((a, b) => (b.percentage ?? 0) - (a.percentage ?? 0))[0];
  const id = typeof active?.version_id === "string" && /^[0-9a-f-]{36}$/i.test(active.version_id) ? active.version_id : "";
  process.stdout.write(id);
} catch {
  process.stdout.write("");
}
