import { defineConfig } from "@playwright/test";

const remote = process.env.PAPELITO_E2E_REMOTE === "1";
const baseURL = remote ? "http://localhost:3042" : "http://127.0.0.1:3041";
export default defineConfig({
  testDir: "./tests",
  outputDir: remote ? 'test-results/neon' : 'test-results/ui',
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
          testMatch: "ui.spec.ts",
          use: { viewport: { width: 1280, height: 900 } },
        },
        {
          name: "mobile-390",
          testMatch: "ui.spec.ts",
          use: {
            viewport: { width: 390, height: 844 },
            isMobile: true,
            hasTouch: true,
          },
        },
        {
          name: "mobile-320",
          testMatch: "ui.spec.ts",
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
        command: "node scripts/test-web-server.mjs",
        url: `${baseURL}/?mode=demo`,
        reuseExistingServer: false,
        timeout: 90_000,
      },
});
