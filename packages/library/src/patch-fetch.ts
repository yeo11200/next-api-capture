import type { CaptureSource, RequestKind, ResolvedCaptureConfig } from "@shinjinseop/shared";
import { currentRequestInfo } from "./context";
import { recordCall } from "./store";
import { redactBody, redactHeaders } from "./redact";

let patched = false;

/**
 * Wrap the global `fetch` once. The wrapper:
 *  1. delegates to the ORIGINAL fetch first (Next's caching/dedup is preserved —
 *     we only wrap, we never touch the init/cache options),
 *  2. records the call best-effort only when inside a tracked request (nav id present),
 *  3. reads the response body via `clone()` so the caller's stream is untouched.
 *
 * Known caveat (documented for review): if Next re-assigns `globalThis.fetch`
 * AFTER this runs, our wrapper is bypassed. We patch from `register()` at startup,
 * which in practice runs alongside Next's own patch; ordering is a tracked risk.
 */
export function patchFetch(config: ResolvedCaptureConfig): void {
  if (patched) return;
  const original = globalThis.fetch;
  if (typeof original !== "function") return;
  patched = true;

  const sample = config.mode === "prod" ? config.prod.sampling : 1;

  const wrapped: typeof fetch = async (input, init) => {
    const start = Date.now();

    let navId: string | undefined;
    let kind: RequestKind | undefined;
    try {
      ({ navId, kind } = await currentRequestInfo());
    } catch {
      navId = undefined;
    }

    // Always delegate. Capture must never alter or block the real request.
    if (!navId || Math.random() > sample) {
      return original(input as any, init as any);
    }

    const source = sourceFromKind(kind);

    let response: Response;
    try {
      response = await original(input as any, init as any);
    } catch (err: any) {
      recordCall({
        navigationId: navId,
        source,
        method: methodOf(input, init),
        url: urlOf(input),
        request: { headers: requestHeaders(input, init, config) },
        response: { status: 0, headers: {} },
        timing: { start, duration: Date.now() - start },
        error: String(err?.message ?? err),
      });
      throw err;
    }

    // Snapshot synchronously-safe data, then read the cloned body off the hot path.
    const duration = Date.now() - start;
    const meta = {
      navigationId: navId,
      source,
      method: methodOf(input, init),
      url: urlOf(input),
      request: {
        headers: requestHeaders(input, init, config),
        ...requestBody(init, config),
      },
      responseStatus: response.status,
      responseHeaders: redactHeaders(response.headers, config.redaction),
      timing: { start, duration },
      cache: cacheHintOf(init),
    };

    if (config.redaction.captureResponseBody) {
      let clone: Response | null = null;
      try {
        clone = response.clone();
      } catch {
        clone = null;
      }
      if (clone) {
        // Fire-and-forget: do not block the caller on body reading.
        void clone
          .text()
          .then((text) => {
            const { body, truncated } = redactBody(text, config.redaction);
            recordCall({
              navigationId: meta.navigationId,
              source: meta.source,
              method: meta.method,
              url: meta.url,
              request: meta.request,
              response: { status: meta.responseStatus, headers: meta.responseHeaders, body, bodyTruncated: truncated },
              timing: meta.timing,
              cache: meta.cache,
            });
          })
          .catch(() => {
            recordCall(callWithoutBody(meta));
          });
        return response;
      }
    }

    recordCall(callWithoutBody(meta));
    return response;
  };

  globalThis.fetch = wrapped;
}

interface FetchMeta {
  navigationId: string;
  source: CaptureSource;
  method: string;
  url: string;
  request: { headers: Record<string, string>; body?: string | null; bodyTruncated?: boolean };
  responseStatus: number;
  responseHeaders: Record<string, string>;
  timing: { start: number; duration: number };
  cache?: string;
}

function callWithoutBody(meta: FetchMeta) {
  return {
    navigationId: meta.navigationId,
    source: meta.source,
    method: meta.method,
    url: meta.url,
    request: meta.request,
    response: { status: meta.responseStatus, headers: meta.responseHeaders },
    timing: meta.timing,
    cache: meta.cache,
  };
}

function methodOf(input: RequestInfo | URL, init?: RequestInit): string {
  const m = init?.method ?? (typeof input === "object" && "method" in input ? (input as Request).method : undefined);
  return (m ?? "GET").toUpperCase();
}

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  if (typeof input === "object" && "url" in input) return (input as Request).url;
  return String(input);
}

/** Map the middleware-classified request kind to a capture source. */
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

function requestHeaders(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  config: ResolvedCaptureConfig,
): Record<string, string> {
  const source =
    init?.headers ??
    (typeof input === "object" && "headers" in input ? (input as Request).headers : undefined);
  return redactHeaders(source as Headers | undefined, config.redaction);
}

function requestBody(
  init: RequestInit | undefined,
  config: ResolvedCaptureConfig,
): { body?: string | null; bodyTruncated?: boolean } {
  if (!config.redaction.captureRequestBody) return {};
  // Only capture safely-stringifiable bodies; never consume streams/FormData.
  if (typeof init?.body === "string") {
    const { body, truncated } = redactBody(init.body, config.redaction);
    return { body, bodyTruncated: truncated };
  }
  return {};
}

function cacheHintOf(init?: RequestInit): string | undefined {
  return (init as { cache?: string } | undefined)?.cache;
}
