import { registerCapture } from "@shinjinseop/library";

/**
 * Next calls this once per server runtime at startup.
 * registerCapture patches the global fetch and (in dev) starts the WebSocket hub.
 */
export async function register() {
  // Pass mode through verbatim (undefined when NAC_MODE is unset) so the library's
  // prod-safe default applies: "off" under NODE_ENV=production, "dev" otherwise.
  // Do NOT hardcode a `?? "dev"` fallback here — that would defeat that safeguard.
  await registerCapture({
    mode: process.env.NAC_MODE as "dev" | "prod" | "off" | undefined,
    dev: {
      wsPort: process.env.NAC_WS_PORT ? Number(process.env.NAC_WS_PORT) : undefined,
      token: process.env.NAC_DEV_TOKEN,
    },
    prod: {
      token: process.env.NAC_PROD_TOKEN,
      sampling: process.env.NAC_SAMPLING ? Number(process.env.NAC_SAMPLING) : undefined,
    },
  });
}
