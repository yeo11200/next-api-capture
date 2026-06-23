import {
  DEFAULT_WS_PORT,
  type CaptureConfig,
  type ResolvedCaptureConfig,
} from "@shinjinseop/shared";

/** Header names whose values are always masked, even if allowlisted. */
const DEFAULT_BLOCKLIST = [
  "authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "proxy-authorization",
];

/**
 * Resolve user config into a fully-populated config with safe defaults.
 *
 * Defaults are intentionally conservative:
 * - mode is NEVER auto-on in production: if unset, it defaults to "dev" in a
 *   development build and "off" in a production build (NODE_ENV === "production").
 *   Enabling capture in prod requires an explicit `mode: "prod"`.
 * - in prod, response/request bodies are OFF unless explicitly enabled
 * - sensitive headers are masked by default
 */
export function resolveConfig(input: CaptureConfig = {}): ResolvedCaptureConfig {
  const mode = input.mode ?? defaultMode();
  const isProd = mode === "prod";

  return {
    mode,
    dev: {
      wsPort: input.dev?.wsPort ?? DEFAULT_WS_PORT,
      token: input.dev?.token ?? "",
    },
    prod: {
      token: input.prod?.token ?? "",
      sampling: clamp01(input.prod?.sampling ?? 0.1),
    },
    redaction: {
      headerAllowlist: input.redaction?.headerAllowlist ?? [],
      headerBlocklist: (input.redaction?.headerBlocklist ?? DEFAULT_BLOCKLIST).map(
        (h) => h.toLowerCase(),
      ),
      maskValue: input.redaction?.maskValue ?? "***",
      maxBodyBytes: input.redaction?.maxBodyBytes ?? 64 * 1024,
      // Bodies on by default in dev, off by default in prod.
      captureRequestBody: input.redaction?.captureRequestBody ?? !isProd,
      captureResponseBody: input.redaction?.captureResponseBody ?? !isProd,
      maskPatterns: input.redaction?.maskPatterns ?? [],
    },
  };
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/** Never auto-enable in production. Unset mode → "off" in prod, "dev" otherwise. */
function defaultMode(): "dev" | "off" {
  const env =
    typeof process !== "undefined"
      ? (process as { env?: { NODE_ENV?: string } }).env?.NODE_ENV
      : undefined;
  return env === "production" ? "off" : "dev";
}
