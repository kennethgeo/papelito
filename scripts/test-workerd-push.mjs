// Runs Papelito's push delivery code (src/lib/notifications/delivery.ts with
// web-push) inside workerd, the Workers runtime, with nodejs_compat as in
// cloudflare/scheduler.wrangler.jsonc. Nothing real is contacted: the device is
// fictitious and its endpoint is an unreachable loopback port, so the check
// proves that encryption, VAPID and the node:https transport run in Workers and
// reach the network layer, without sending a notification.
import { spawn } from "node:child_process";
import { createECDH, randomBytes } from "node:crypto";
import fs from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import webpush from "web-push";

const root = fileURLToPath(new URL("../", import.meta.url));
const dir = path.join(root, "node_modules/.cache/papelito-workerd-push");
fs.mkdirSync(dir, { recursive: true });

const receiver = createECDH("prime256v1"); receiver.generateKeys();
const fixture = {
  id: "00000000-0000-4000-8000-000000000001",
  endpoint: "https://127.0.0.1:9/push/ficticio",
  p256dh: receiver.getPublicKey().toString("base64url"),
  auth: randomBytes(16).toString("base64url"),
};
const vapid = webpush.generateVAPIDKeys();
const delivery = path.join(root, "src/lib/notifications/delivery.ts").replaceAll("\\", "/");
fs.writeFileSync(path.join(dir, "worker.ts"), `
import webpush from "web-push";
import { createPushService } from ${JSON.stringify(delivery)};
const fixture = ${JSON.stringify(fixture)};
export default {
  async fetch() {
    const queries: string[] = [];
    const query = async (sql: string) => {
      queries.push(sql.trim().split(/\\s+/)[0]);
      if (sql.includes("FROM push_subscriptions s")) return { rows: [fixture], rowCount: 1 };
      if (sql.startsWith("INSERT INTO notification_deliveries")) return { rows: [{ subscription_id: fixture.id }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    };
    let request: { headers: Record<string, unknown>; body?: { length: number } } | null = null;
    let transportError = "";
    const send = async (sub: any, payload: string, options: any) => {
      request = webpush.generateRequestDetails(sub, payload, options) as any;
      try { return await webpush.sendNotification(sub, payload, options); }
      catch (error) { transportError = String((error as Error)?.message ?? error).slice(0, 200); throw error; }
    };
    const result = await createPushService(query as any).notifyUser("persona-ficticia", "prueba-workerd", { body: "Prueba" }, send);
    return Response.json({
      result, transportError, queries,
      headers: Object.keys(request?.headers ?? {}),
      authorization: String(request?.headers?.Authorization ?? "").slice(0, 8),
      encoding: request?.headers?.["Content-Encoding"],
      bodyLength: request?.body?.length ?? 0,
    });
  },
};
`);
fs.writeFileSync(path.join(dir, "wrangler.jsonc"), JSON.stringify({
  name: "papelito-push-probe",
  main: "./worker.ts",
  compatibility_date: JSON.parse(fs.readFileSync(path.join(root, "cloudflare/scheduler.wrangler.jsonc"), "utf8").replace(/^\s*\/\/.*$/gm, "")).compatibility_date,
  compatibility_flags: ["nodejs_compat"],
}));

const port = await new Promise((resolve, reject) => {
  const server = createServer();
  server.listen(0, "127.0.0.1", () => { const { port } = server.address(); server.close(() => resolve(port)); });
  server.on("error", reject);
});
const child = spawn(process.execPath, [
  path.join(root, "node_modules/wrangler/bin/wrangler.js"), "dev", "--config", path.join(dir, "wrangler.jsonc"),
  "--ip", "127.0.0.1", "--port", String(port), "--log-level", "error", "--show-interactive-dev-session=false",
  "--var", `PUSH_VAPID_PUBLIC_KEY:${vapid.publicKey}`, "--var", `PUSH_VAPID_PRIVATE_KEY:${vapid.privateKey}`,
], { cwd: dir, env: { ...process.env, WRANGLER_SEND_METRICS: "false", CI: "true" }, stdio: ["ignore", "pipe", "pipe"] });
let output = "";
child.stdout.on("data", (chunk) => { output += chunk; });
child.stderr.on("data", (chunk) => { output += chunk; });

function check(condition, message) {
  if (!condition) throw new Error(message);
}

try {
  let body = null;
  for (let i = 0; i < 120 && !body; i++) {
    if (child.exitCode !== null) throw new Error(`workerd exited early:\n${output}`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`);
      body = await response.json();
    } catch { await new Promise((resolve) => setTimeout(resolve, 500)); }
  }
  check(body, `workerd did not answer:\n${output}`);
  check(body.result.delivered === 0 && body.result.failed === 1, `unexpected result ${JSON.stringify(body.result)}`);
  check(body.authorization === "vapid t=", "the request must carry the cached VAPID Authorization header");
  check(body.encoding === "aes128gcm" && body.bodyLength > 0, "the payload must be encrypted with aes128gcm");
  check(["TTL", "Content-Encoding", "Content-Type", "Authorization"].every((h) => body.headers.includes(h)), `missing headers: ${body.headers}`);
  // Reaching the network layer is the expected failure; a missing Node API would fail differently.
  check(!/not implemented|is not a function|is not defined|Cannot find|unsupported/i.test(body.transportError), `push transport is not compatible with workerd: ${body.transportError}`);
  check(/network|connect|refused|lost|socket|ECONN/i.test(body.transportError), `unexpected transport error: ${body.transportError}`);
  check(body.queries.join(",") === "SELECT,INSERT", `a failed send must not be marked delivered (${body.queries})`);
  console.log(`PASS workerd: cifrado, VAPID y transporte push (node:https) funcionan en Workers; envío a destino ficticio falló en la red como se esperaba (${body.transportError}).`);
} catch (error) {
  console.error(`FAIL workerd push: ${error.message}\n${output.slice(-3000)}`);
  process.exitCode = 1;
} finally {
  child.kill("SIGTERM");
}
