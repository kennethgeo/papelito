import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const handlers = new Map();
const cached = [],
  deleted = [];
let claimed = 0,
  skipped = 0,
  networkFails = false;
let cacheMissing = false, cacheFails = false;
const offline = { publicOffline: true },
  network = { privateServerResponse: true };
const context = {
  URL,
  Response,
  self: {
    registration: { showNotification: async (title, options) => { context.notification = { title, ...options }; } },
    location: { origin: "https://paper.example" },
    addEventListener: (name, handler) => handlers.set(name, handler),
    skipWaiting: async () => {
      skipped++;
    },
    clients: {
      openWindow: async (url) => { context.opened = url; },
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
    match: async (key) => {
      if (cacheFails) throw new Error('Cache storage unavailable');
      return key === "/offline.html" && !cacheMissing ? offline : undefined;
    },
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
      ["/offline-vault.js", "/offline-reader.js", "/preferences.js"].includes(url) ||
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
assert.deepEqual(deleted, ["papelito-public-v2", "papelito-public-v3"]);
assert.equal(claimed, 1);
handlers.get('push')({ data: { json: () => ({ body: 'Tenés novedades.', url: 'https://evil.example/' }) }, waitUntil: promise => { waiting = promise; } });
await waiting;
assert.equal(context.notification.title, 'Papelito');
assert.equal(context.notification.data.url, '/');
handlers.get('notificationclick')({ notification: { close() {}, data: { url: '//evil.example/' } }, waitUntil: promise => { waiting = promise; } });
await waiting;
assert.equal(context.opened, 'https://paper.example/');
// No page is running: a push wakes the worker and opens only its own exchange.
const exchangePath = '/?intercambio=00000000-0000-4000-8000-000000000001';
handlers.get('push')({ data: { json: () => ({ body: 'Tenés un mensaje nuevo en tu intercambio. Abrí Papelito para leerlo.', url: exchangePath, tag: 'message:ficticio' }) }, waitUntil: promise => { waiting = promise; } });
await waiting;
assert.equal(context.notification.data.url, exchangePath);
assert.equal(context.notification.body, 'Tenés un mensaje nuevo en tu intercambio. Abrí Papelito para leerlo.');
handlers.get('notificationclick')({ notification: { close() {}, data: context.notification.data }, waitUntil: promise => { waiting = promise; } });
await waiting;
assert.equal(context.opened, `https://paper.example${exchangePath}`);
for (const [url, method] of [
  ["/api/exchanges/private/my-assignment", "GET"],
  ["/api/auth/get-session", "GET"],
  ["/auth/callback", "GET"],
  ["/unirse/secret-token", "GET"],
  ["/papelito", "GET"],
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
assert.equal(cached.length, 9);
networkFails = true;
assert.equal(await navigation(), offline);
assert.equal(cached.length, 9);
cacheMissing = true;
const emergency = await navigation();
assert.ok(emergency instanceof Response, 'An evicted offline cache must not break the navigation');
assert.equal(emergency.status, 503);
assert.equal(emergency.headers.get('cache-control'), 'no-store');
assert.match(await emergency.text(), /No pudimos abrir Papelito/);
cacheFails = true;
assert.ok(await navigation() instanceof Response, 'Cache Storage failure must still return a valid response');
console.log(
  "PASS PWA: precarga solo pública, nunca cachea HTML privado/API/auth/invitaciones, actualización consentida y limpieza limitada a sus propias cachés",
);
