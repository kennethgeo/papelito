import { bindings, defineConfig, defineWorker } from "cf/config";

export default defineConfig({
  worker: defineWorker({
    name: "papelitocr",
    entrypoint: "vinext/server/fetch-handler",
    compatibilityDate: "2026-10-30",
    compatibilityFlags: ["nodejs_compat"],
    assets: {
      htmlHandling: "none",
      notFoundHandling: "none",
      runWorkerFirst: ["/*", "!/_next/static/*", "!/*/_next/static/*"],
    },
    env: {
      ASSETS: bindings.assets(),
      IMAGES: bindings.images(),
      DATABASE_URL: bindings.secret(),
      NEON_AUTH_BASE_URL: bindings.secret(),
      NEON_AUTH_COOKIE_SECRET: bindings.secret(),
      INVITATION_TOKEN_SECRET: bindings.secret(),
      PAPELITO_APP_URL: bindings.text("https://papelitocr.papelitocr.workers.dev"),
    },
  }),
});
