import type {
  CaptureSource,
  RequestKind,
  ResolvedCaptureConfig,
} from "@next-api-capture/shared";
import { currentRequestInfo } from "./context";
import { recordCall } from "./store";
import { redactHeaders } from "./redact";

let patched = false;

/**
 * Patch Node's `http`/`https` `.request` + `.get` so server-side HTTP clients that
 * DON'T go through `globalThis.fetch` — axios, got, superagent, node-fetch, request —
 * are captured too.
 *
 * Why this matters: `patch-fetch.ts` only wraps `globalThis.fetch` (undici). axios on
 * Node uses the `http` adapter → `node:http`/`https` `.request()`, bypassing that patch.
 * `node:http` is the COMMON CHOKEPOINT for those clients, so patching it once covers all
 * of them. Native fetch (undici) has its own socket stack and does NOT go through
 * `http.request`, so the two patches are disjoint — no double-recording.
 *
 * Constraints honored:
 *  - Builtins are loaded via `process.getBuiltinModule` (Node 20.16+/22.3+), NOT an
 *    import/require statement. That keeps them invisible to webpack/esbuild static
 *    analysis — so no "Can't resolve 'http'" in the Edge/instrumentation bundle, and no
 *    `node:` prefix stripping. Caller still gates on isNode && !isEdge.
 *  - Always delegates to the original first — capture must never alter/block a request.
 *  - v1 captures METADATA only (method/url/headers/status/timing). The response body is
 *    a single stream; reading it risks starving the real consumer, so body capture is
 *    deferred (see TODO) rather than done unsafely.
 */
export function patchHttp(config: ResolvedCaptureConfig): void {
  if (patched) return;

  // import/require 가 아닌 런타임 빌트인 로더 → 번들러가 못 본다(위 주석 참고).
  const getBuiltin = (
    process as { getBuiltinModule?: (id: string) => unknown }
  ).getBuiltinModule;
  if (typeof getBuiltin !== "function") return; // Node<20.16 또는 비Node — skip

  const http = pickModule(getBuiltin("node:http"));
  const https = pickModule(getBuiltin("node:https"));
  if (!http || typeof http.request !== "function") return;
  patched = true;

  const sample = config.mode === "prod" ? config.prod.sampling : 1;

  patchModule(http, "http:", config, sample);
  if (https && typeof https.request === "function") {
    patchModule(https, "https:", config, sample);
  }
}

interface HttpModule {
  request: (...args: unknown[]) => unknown;
  get: (...args: unknown[]) => unknown;
}

/**
 * Resolve the live `module.exports` object that consumers' `require('http')` sees.
 * Under both native ESM and esbuild's CJS interop, the builtin's `module.exports` is the
 * default export — patching its `.request` is what axios's `require('https').request` reads.
 * Patching a named export would NOT be observed by `require`.
 */
function pickModule(ns: unknown): HttpModule | undefined {
  const candidate = (ns as { default?: unknown })?.default ?? ns;
  if (candidate && typeof (candidate as HttpModule).request === "function") {
    return candidate as HttpModule;
  }
  return undefined;
}

function patchModule(
  mod: HttpModule,
  scheme: string,
  config: ResolvedCaptureConfig,
  sample: number,
): void {
  mod.request = wrap(mod.request, scheme, config, sample);
  // `http.get` calls the lexical (un-patched) `request` internally, so wrapping
  // `request` alone does NOT cover `.get`. Wrap it too (it returns a ClientRequest
  // we observe the same way).
  if (typeof mod.get === "function") {
    mod.get = wrap(mod.get, scheme, config, sample);
  }
}

function wrap(
  original: (...args: unknown[]) => unknown,
  scheme: string,
  config: ResolvedCaptureConfig,
  sample: number,
) {
  return function wrapped(this: unknown, ...args: unknown[]): unknown {
    const start = Date.now();
    // Always delegate first — capture must never alter or block the real request.
    const req = original.apply(this, args) as NodeClientRequest;
    try {
      instrument(req, start, scheme, args, config, sample);
    } catch {
      /* swallow — capture must never break the host app */
    }
    return req;
  };
}

interface NodeClientRequest {
  on(event: string, listener: (...a: unknown[]) => void): unknown;
}

interface NodeResponse {
  statusCode?: number;
  headers?: Record<string, string | string[] | undefined>;
  on(event: string, listener: (...a: unknown[]) => void): unknown;
}

function instrument(
  req: NodeClientRequest,
  start: number,
  scheme: string,
  args: unknown[],
  config: ResolvedCaptureConfig,
  sample: number,
): void {
  const meta = describeRequest(scheme, args);
  let recorded = false;

  const finish = (
    status: number,
    resHeaders: NodeResponse["headers"],
    error?: string,
  ) => {
    if (recorded) return;
    recorded = true;
    void record(start, status, resHeaders, error, meta, config, sample);
  };

  req.on("response", (res) => {
    const response = res as NodeResponse;
    const status = response.statusCode ?? 0;
    const headers = response.headers;
    // 'close' always fires (after 'end' on success, or on abort). Listening to it
    // does NOT consume the body stream — only attaching a 'data' listener would.
    response.on("close", () => finish(status, headers));
  });
  req.on("error", (err) =>
    finish(0, {}, String((err as Error)?.message ?? err)),
  );
}

async function record(
  start: number,
  status: number,
  resHeaders: NodeResponse["headers"],
  error: string | undefined,
  meta: { method: string; url: string; headers: unknown },
  config: ResolvedCaptureConfig,
  sample: number,
): Promise<void> {
  let navId: string | undefined;
  let kind: RequestKind | undefined;
  try {
    ({ navId, kind } = await currentRequestInfo());
  } catch {
    navId = undefined;
  }
  // Only capture inside a tracked request (navId present) + honor sampling.
  if (!navId || Math.random() > sample) return;

  recordCall({
    navigationId: navId,
    source: sourceFromKind(kind),
    method: meta.method,
    url: meta.url,
    request: {
      headers: redactHeaders(meta.headers as never, config.redaction),
    },
    response: {
      status,
      headers: redactHeaders(resHeaders as never, config.redaction),
    },
    timing: { start, duration: Date.now() - start },
    ...(error ? { error } : {}),
  });
}

/** Map middleware-classified kind to a capture source (mirrors patch-fetch.ts). */
function sourceFromKind(kind?: RequestKind): CaptureSource {
  switch (kind) {
    case "action":
      return "server:action";
    case "route-handler":
      return "server:route-handler";
    // "document" | "rsc" | undefined → server render
    default:
      return "server:rsc";
  }
}

/**
 * Normalize the polymorphic http.request/get args into { method, url, headers }.
 * Signatures: request(options[, cb]) | request(url[, options][, cb]); url is string|URL.
 * axios passes an options object with protocol/hostname/port/path/method/headers.
 */
function describeRequest(
  scheme: string,
  args: unknown[],
): { method: string; url: string; headers: unknown } {
  let urlArg: string | URL | undefined;
  let options: Record<string, unknown> | undefined;

  if (typeof args[0] === "string" || args[0] instanceof URL) {
    urlArg = args[0] as string | URL;
    if (args[1] && typeof args[1] === "object") {
      options = args[1] as Record<string, unknown>;
    }
  } else if (args[0] && typeof args[0] === "object") {
    options = args[0] as Record<string, unknown>;
  }

  const method = String(options?.method ?? "GET").toUpperCase();
  const headers = options?.headers;

  let url: string;
  if (urlArg !== undefined) {
    url = typeof urlArg === "string" ? urlArg : urlArg.toString();
  } else if (options) {
    const proto = String(options.protocol ?? scheme);
    const host = String(options.hostname ?? options.host ?? "localhost");
    const port = options.port != null ? `:${String(options.port)}` : "";
    const path = String(options.path ?? "/");
    url = `${proto}//${host}${port}${path}`;
  } else {
    url = "";
  }

  return { method, url, headers };
}
