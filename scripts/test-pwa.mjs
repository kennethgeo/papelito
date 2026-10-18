import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const handlers = new Map();
const cached = [],
  deleted = [];
let claimed = 0,
  skipped = 0,
  networkFails = false;
const offline = { publicOffline: true },
  network = { privateServerResponse: true };
const context = {
  URL,
  self: {
    location: { origin: "https://paper.example" },
    addEventListener: (name, handler) => handlers.set(name, handler),
    skipWaiting: async () => {
      skipped++;
    },
    clients: {
      claim: async () => {
        claimed++;
      },
    },
  },
  caches: {
    open: async () => ({ addAll: async (assets) => cached.push(...assets) }),
    keys: async () => [
      "papelito-public-v2",
      "papelito-public-v3",
      "another-application",
    ],
    delete: async (key) => {
      deleted.push(key);
    },
    match: async (key) => (key === "/offline.html" ? offline : undefined),
  },
  fetch: async () => {
    if (networkFails) throw new Error("Offline");
    return network;
  },
};
vm.runInNewContext(
  fs.readFileSync(new URL("../public/sw.js", import.meta.url), "utf8"),
  context,
);
let waiting;
handlers.get("install")({
  waitUntil: (promise) => {
    waiting = promise;
  },
});
await waiting;
assert.ok(cached.includes("/offline.html"));
assert.ok(
  cached.every(
    (url) =>
      url === "/offline.html" ||
      url === "/manifest.webmanifest" ||
      url.startsWith("/fonts/") ||
      /^\/icon-/.test(url),
  ),
);
assert.equal(
  skipped,
  0,
  "An update must wait for the user before replacing the current worker",
);
handlers.get("message")({ data: { type: "ACTIVATE_UPDATE" } });
assert.equal(skipped, 1);
handlers.get("activate")({
  waitUntil: (promise) => {
    waiting = promise;
  },
});
await waiting;
assert.deepEqual(deleted, ["papelito-public-v2"]);
assert.equal(claimed, 1);
for (const [url, method] of [
  ["/api/exchanges/private/my-assignment", "GET"],
  ["/api/auth/get-session", "GET"],
  ["/auth/callback", "GET"],
  ["/unirse/secret-token", "GET"],
  ["/", "POST"],
]) {
  let handled = false;
  handlers.get("fetch")({
    request: { url: `https://paper.example${url}`, method, mode: "navigate" },
    respondWith: () => {
      handled = true;
    },
  });
  assert.equal(
    handled,
    false,
    `${method} ${url} must not be intercepted or cached`,
  );
}
function navigation() {
  let result;
  handlers.get("fetch")({
    request: { url: "https://paper.example/", method: "GET", mode: "navigate" },
    respondWith: (promise) => {
      result = promise;
    },
  });
  return result;
}
assert.equal(await navigation(), network);
assert.equal(cached.length, 6);
networkFails = true;
assert.equal(await navigation(), offline);
assert.equal(cached.length, 6);
console.log(
  "PASS PWA: precarga solo pública, nunca cachea HTML privado/API/auth/invitaciones, actualización consentida y limpieza limitada a sus propias cachés",
);
