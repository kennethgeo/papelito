import { defineConfig } from "@playwright/test";

const remote = process.env.PAPELITO_E2E_REMOTE === "1";
// PAPELITO_E2E_WORKERD=1 runs the same UI suite against the Workers bundle
// served by workerd (vinext router), instead of `next start`.
const workerd = process.env.PAPELITO_E2E_WORKERD === "1";
// PAPELITO_E2E_SESSION=1 runs tests/session.spec.ts with real sessions on a
// temporary local PostgreSQL (scripts/serve-session.mjs).
const session = process.env.PAPELITO_E2E_SESSION === "1";
const baseURL = remote ? "http://localhost:3042" : session ? "http://127.0.0.1:3044" : workerd ? "http://127.0.0.1:3043" : "http://127.0.0.1:3041";
const browserSuite = session ? "session.spec.ts" : "ui.spec.ts";
export default defineConfig({
  testDir: "./tests",
  outputDir: remote ? 'test-results/neon' : session ? 'test-results/session' : workerd ? 'test-results/workerd' : 'test-results/ui',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: remote ? 360_000 : 45_000,
  expect: { timeout: remote ? 30_000 : 10_000 },
  reporter: "list",
  use: {
    baseURL,
    browserName: "chromium",
    locale: "es-CR",
    timezoneId: "America/Costa_Rica",
    actionTimeout: remote ? 30_000 : 10_000,
    navigationTimeout: remote ? 45_000 : 15_000,
    trace: remote ? "off" : "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: remote
    ? [
        {
          name: "neon-aislado",
          testMatch: "neon.spec.ts",
          use: {
            viewport: { width: 390, height: 844 },
            isMobile: true,
            hasTouch: true,
          },
        },
      ]
    : [
        {
          name: "desktop",
          testMatch: browserSuite,
          use: { viewport: { width: 1280, height: 900 } },
        },
        {
          name: "mobile-390",
          testMatch: browserSuite,
          use: {
            viewport: { width: 390, height: 844 },
            isMobile: true,
            hasTouch: true,
          },
        },
        {
          name: "mobile-320",
          testMatch: browserSuite,
          use: {
            viewport: { width: 320, height: 740 },
            isMobile: true,
            hasTouch: true,
          },
        },
      ],
  webServer: remote
    ? undefined
    : {
        command: session ? "node scripts/serve-session.mjs" : workerd ? "node scripts/serve-workerd.mjs" : "node scripts/test-web-server.mjs",
        url: `${baseURL}/?mode=demo`,
        reuseExistingServer: false,
        timeout: 120_000,
      },
});
