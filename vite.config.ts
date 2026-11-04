import { defineConfig } from "vite";
import vinext from "vinext";
import { cloudflare } from "@cloudflare/vite-plugin";

// This configuration only builds the Cloudflare Workers bundle. The browser
// uses it to hide features that Workers cannot provide (store link lookups).
process.env.NEXT_PUBLIC_PAPELITO_RUNTIME ??= "workers";

export default defineConfig({
  plugins: [
    // No data cache: every page is per-person and dynamic, and each mutation
    // refreshes its view through the snapshot read. (A KV data cache only
    // received revalidatePath writes, one per click, against the free quota.)
    vinext(),
    cloudflare({
      viteEnvironment: {
        name: "rsc",
        childEnvironments: ["ssr"],
      },
    }),
  ],
});
