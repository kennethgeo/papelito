// Imported before the Neon Auth client so it runs before zod loads. zod builds
// the auth client's schemas at import time and probes `new Function("")` to
// pick its fast path; under the report-only CSP that probe would send a report
// on every visit (it is caught, so nothing breaks). `jitless` skips the probe
// and uses zod's regular parser. zod reads this shared object from globalThis.
const shared = globalThis as { __zod_globalConfig?: { jitless?: boolean } };
shared.__zod_globalConfig = { ...shared.__zod_globalConfig, jitless: true };

export {};
