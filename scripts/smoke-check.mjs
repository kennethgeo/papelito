// Post-deployment and workerd checks: expected status, headers and content per
// route. Not every route must answer 200: an invalid invitation must keep its
// own page, a missing route must stay 404 and private APIs must reject guests.
//
// Verdicts (exit code / GitHub output `verdict`):
//   0 ok         every route matched its expectation
//   1 defective  the expected version answered, but a route had the wrong
//                status, headers or content (deterministic: safe to roll back)
//   2 transient  network errors, timeouts or edge/platform errors persisted
//                after retries (do not roll back automatically)
//   3 stale      the site kept answering with another version after waiting
import { appendFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i].replace(/^--/, ""), process.argv[i + 1]);
const base = (args.get("base") || "").replace(/\/+$/, "");
const profile = args.get("profile") || "production";
const expectVersion = args.get("expect-version") || "";
const waitForVersion = Number(args.get("wait-for-version") || 0) * 1000;
if (!/^https?:\/\//.test(base) || !["production", "unconfigured"].includes(profile)) {
  console.error("Usage: smoke-check.mjs --base URL --profile production|unconfigured [--expect-version SHA --wait-for-version SECONDS]");
  process.exit(64);
}

const TRANSIENT_STATUS = new Set([408, 429, 502, 504, 520, 521, 522, 523, 524, 525, 526, 527, 530]);
const ENGLISH_DEFAULT_ERROR = /This page couldn.t load|Application error: a client-side exception/i;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const randomToken = randomBytes(24).toString("base64url");

const html = (extra = {}) => ({ type: /text\/html/, mustNot: [ENGLISH_DEFAULT_ERROR], ...extra });
const routes = [
  { path: "/", status: 200, ...html({ must: [/<html[^>]+lang="es/, /papelito/i] }), headers: { "x-frame-options": /DENY/i, "x-content-type-options": /nosniff/i, "referrer-policy": /strict-origin-when-cross-origin/i } },
  { path: "/?mode=demo", status: 200, ...html({ must: [/<html[^>]+lang="es/] }) },
  { path: `/unirse/${randomToken}`, status: 200, ...html({ must: [/Invitación no disponible/] }), headers: { "cache-control": /no-store/ }, transientMarker: /No pudimos revisar esta invitación/ },
  { path: "/ayuda", status: 200, ...html({ must: [/papelito/i] }) },
  { path: "/privacidad", status: 200, ...html() },
  { path: "/terminos", status: 200, ...html() },
  { path: `/esta-ruta-no-existe-${randomToken.slice(0, 8)}`, status: 404, ...html({ must: [/No encontramos esta página/] }) },
  { path: "/api/auth/get-session", status: profile === "production" ? 200 : 503, type: /json/, headers: { "cache-control": /no-store/ } },
  { path: "/api/wishes/00000000-0000-4000-8000-000000000000/image", status: 401, headers: { "cache-control": /no-store/ } },
  { path: "/sw.js", status: 200, type: /javascript/, must: [/papelito-public-/] },
  { path: "/manifest.webmanifest", status: 200, must: [/Papelito/] },
];

async function request(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`${base}${path}`, { redirect: "manual", signal: controller.signal, headers: { "user-agent": "PapelitoSmokeCheck/1.0", "cache-control": "no-cache" } });
    const body = await response.text();
    return { response, body };
  } catch (error) {
    return { error };
  } finally {
    clearTimeout(timer);
  }
}

function evaluate(route, { response, body, error }) {
  if (error) return { kind: "transient", detail: `network: ${error.name}` };
  const problems = [];
  if (response.status !== route.status) {
    if (TRANSIENT_STATUS.has(response.status)) return { kind: "transient", detail: `status ${response.status}` };
    problems.push(`status ${response.status} (expected ${route.status})`);
  }
  if (route.transientMarker?.test(body)) return { kind: "transient", detail: "dependency temporarily unavailable" };
  const type = response.headers.get("content-type") || "";
  if (route.type && !route.type.test(type)) problems.push(`content-type ${type || "none"}`);
  for (const [name, pattern] of Object.entries(route.headers || {})) {
    if (!pattern.test(response.headers.get(name) || "")) problems.push(`header ${name}`);
  }
  for (const pattern of route.must || []) if (!pattern.test(body)) problems.push(`missing ${pattern}`);
  for (const pattern of route.mustNot || []) if (pattern.test(body)) problems.push(`unexpected ${pattern}`);
  if (route.json) {
    try {
      if (!route.json(JSON.parse(body))) problems.push("unexpected JSON");
    } catch {
      problems.push("invalid JSON");
    }
  }
  return problems.length ? { kind: "defective", detail: problems.join("; ") } : { kind: "ok" };
}

async function checkRoute(route) {
  let result;
  for (let attempt = 1; attempt <= 3; attempt++) {
    result = evaluate(route, await request(route.path));
    if (result.kind !== "transient") return result;
    await sleep(attempt * 5_000);
  }
  return result;
}

async function waitForExpectedVersion() {
  const deadline = Date.now() + Math.max(waitForVersion, 0);
  let lastSeen = "";
  let answered = false;
  do {
    const { response, body, error } = await request("/api/version");
    if (!error && response.status === 200) {
      answered = true;
      try {
        lastSeen = JSON.parse(body).version || "";
      } catch {
        lastSeen = "";
      }
      if (lastSeen === expectVersion) return { kind: "ok" };
    }
    await sleep(10_000);
  } while (Date.now() < deadline);
  return answered
    ? { kind: "stale", detail: `version ${lastSeen || "unknown"} instead of ${expectVersion}` }
    : { kind: "transient", detail: "version endpoint unreachable" };
}

const failures = [];
let verdict = "ok";
if (expectVersion) {
  const version = await waitForExpectedVersion();
  if (version.kind !== "ok") {
    verdict = version.kind;
    failures.push(`/api/version: ${version.detail}`);
  }
}
if (verdict === "ok") {
  for (const route of routes) {
    const result = await checkRoute(route);
    console.log(`${result.kind === "ok" ? "PASS" : "FAIL"} ${route.path.replace(randomToken, "<token>")} ${result.detail || ""}`.trim());
    if (result.kind !== "ok") {
      failures.push(`${route.path.replace(randomToken, "<token>")}: ${result.detail}`);
      // A deterministic defect outranks transient noise on other routes.
      if (result.kind === "defective" || verdict === "ok") verdict = result.kind;
    }
  }
}

if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `verdict=${verdict}\n`);
if (verdict !== "ok") {
  console.error(`Smoke check verdict: ${verdict}\n- ${failures.join("\n- ")}`);
  process.exit({ defective: 1, transient: 2, stale: 3 }[verdict]);
}
console.log(`Smoke check passed for ${base} (${profile}).`);
