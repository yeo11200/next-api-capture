/**
 * Shared contract between the server library and the Chrome extension.
 * Pure types + a few runtime constants — no Node/DOM-only code, so both
 * the (Node) library and the (browser) extension can rely on the same shape.
 */

/** Default dev WebSocket port the library binds and the extension connects to. */
export const DEFAULT_WS_PORT = 9477;

/** Request/response header carrying the per-navigation correlation id. */
export const NAV_HEADER = "x-nac-navigation-id";

/** Cookie the middleware sets so client-side code can read the same nav id. */
export const NAV_COOKIE = "nac-nav";

/** Header the middleware sets so the fetch wrapper can label the server source. */
export const NAV_KIND_HEADER = "x-nac-kind";

/** Request classification done by middleware (where the signal actually exists). */
export type RequestKind = "document" | "rsc" | "action" | "route-handler";

/** Where a captured call originated. */
export type CaptureSource =
  | "server:rsc" // fetch during a Server Component render
  | "server:route-handler" // fetch inside a Route Handler
  | "server:action" // fetch inside a Server Action
  | "client:fetch" // window.fetch in the browser
  | "client:xhr"; // XMLHttpRequest in the browser

export interface CaptureNavigation {
  navigationId: string;
  /** pathname (query stripped by default) */
  route: string;
  kind: "document" | "soft-nav" | "action" | "prefetch";
  /** epoch ms */
  startedAt: number;
}

export interface CaptureCall {
  callId: string;
  navigationId: string;
  source: CaptureSource;
  method: string;
  url: string;
  request: {
    headers: Record<string, string>;
    body?: string | null;
    bodyTruncated?: boolean;
  };
  response: {
    status: number;
    headers: Record<string, string>;
    body?: string | null;
    bodyTruncated?: boolean;
  };
  timing: { start: number; duration: number };
  /** Next fetch cache hint when derivable. */
  cache?: string;
  /** Present when the underlying fetch threw. */
  error?: string;
}

/** Messages sent over the transport (WS) from library/extension to the hub. */
export type TransportEnvelope =
  | { type: "hello"; role: "server" | "client"; ts: number }
  | { type: "navigation:start"; nav: CaptureNavigation }
  | { type: "navigation:end"; navigationId: string }
  | { type: "call"; call: CaptureCall };

/** ---- Configuration (library) ---- */

export type CaptureMode = "off" | "dev" | "prod";

export interface RedactionConfig {
  /** If set, only these (lowercased) header names are kept; others masked. */
  headerAllowlist?: string[];
  /** Header names (lowercased) always masked. Applied after allowlist. */
  headerBlocklist?: string[];
  /** Replacement string for masked values. */
  maskValue?: string;
  /** Max bytes of a captured body before truncation. */
  maxBodyBytes?: number;
  captureRequestBody?: boolean;
  captureResponseBody?: boolean;
  /** Regex source strings; matches in bodies are replaced with maskValue. */
  maskPatterns?: string[];
}

export interface DevConfig {
  wsPort?: number;
  /** Optional shared secret; extension must present it to connect. */
  token?: string;
}

export interface ProdConfig {
  token?: string;
  /** 0..1 sampling rate. */
  sampling?: number;
}

export interface CaptureConfig {
  mode?: CaptureMode;
  dev?: DevConfig;
  prod?: ProdConfig;
  redaction?: RedactionConfig;
}

export interface ResolvedCaptureConfig {
  mode: CaptureMode;
  dev: Required<DevConfig>;
  prod: Required<ProdConfig>;
  redaction: Required<RedactionConfig>;
}
