import { defineConfig } from "vite";
import vinext from "vinext";
import { cloudflare } from "@cloudflare/vite-plugin";
import { kvDataAdapter } from "@vinext/cloudflare/cache/kv-data-adapter";

// This configuration only builds the Cloudflare Workers bundle. The browser
// uses it to hide features that Workers cannot provide (store link lookups).
process.env.NEXT_PUBLIC_PAPELITO_RUNTIME ??= "workers";

export default defineConfig({
  plugins: [
    vinext({ cache: { data: kvDataAdapter() } }),
    cloudflare({
      viteEnvironment: {
        name: "rsc",
        childEnvironments: ["ssr"],
      },
    }),
  ],
});
