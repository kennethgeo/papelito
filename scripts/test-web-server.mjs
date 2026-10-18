import { spawn } from "node:child_process";
// A separate port and explicitly empty service configuration keep demo UI tests away from real data.
const child = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3041",
  ],
  {
    windowsHide: true,
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: "",
      DATABASE_URL_UNPOOLED: "",
      NEON_AUTH_BASE_URL: "",
      NEON_AUTH_COOKIE_SECRET: "",
      NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3041",
    },
  },
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 1));
