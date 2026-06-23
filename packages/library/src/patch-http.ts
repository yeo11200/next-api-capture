import type {
  CaptureSource,
  RequestKind,
  ResolvedCaptureConfig,
} from "@shinjinseop/shared";
import { currentRequestInfo } from "./context";
import { recordCall } from "./store";
import { redactBody, redactHeaders } from "./redact";

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
 *  - Response body capture (dev default ON) OBSERVES the stream without consuming it: a
 *    readable stream is an EventEmitter, so an extra 'data' listener receives a COPY of
 *    each chunk and never starves the real consumer. gzip/deflate/br bodies are decoded
 *    via node:zlib (the http layer hands us the raw, still-compressed bytes). Bodies are
 *    size-capped + pattern-masked by the same redaction config as the fetch path.
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
  write?: (...args: unknown[]) => unknown;
  end?: (...args: unknown[]) => unknown;
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

  // Capture the OUTGOING request body (POST/PUT/DELETE/PATCH payloads) by observing
  // write()/end() — that is where the consumer pushes the body. Mirrors the response
  // rules: only string/Buffer chunks copied, every call delegates and keeps its return.
  const readRequestBody = config.redaction.captureRequestBody
    ? hookRequestBody(req, config)
    : () => undefined;

  const finish = (
    status: number,
    resHeaders: NodeResponse["headers"],
    error?: string,
    bodyInfo?: { body: string; bodyTruncated: boolean },
  ) => {
    if (recorded) return;
    recorded = true;
    void record(start, status, resHeaders, error, meta, config, sample, bodyInfo, readRequestBody());
  };

  req.on("response", (res) => {
    const response = res as NodeResponse;
    const status = response.statusCode ?? 0;
    const headers = response.headers;

    if (!config.redaction.captureResponseBody) {
      // Metadata only. 'close' always fires (after 'end' on success, or on abort) and —
      // unlike attaching a 'data' listener — does NOT put the stream into flowing mode.
      response.on("close", () => finish(status, headers));
      return;
    }

    // Observe (NOT consume) the body. Every 'data' listener on a readable stream gets a
    // COPY of each chunk, so our capped accumulation never removes bytes from the real
    // consumer (axios/got/…). We attach here, inside the synchronous 'response' dispatch
    // — before any chunk is emitted on a later tick — so the consumer, which attaches its
    // own 'data' in the same dispatch, is never starved.
    const chunks: Buffer[] = [];
    let size = 0;
    let rawTruncated = false;
    const HARD_CAP = Math.max(config.redaction.maxBodyBytes, 1024 * 1024);
    response.on("data", (chunk: unknown) => {
      try {
        if (rawTruncated) return;
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
        if (size + buf.length > HARD_CAP) {
          const room = HARD_CAP - size;
          if (room > 0) {
            chunks.push(buf.subarray(0, room));
            size += room;
          }
          rawTruncated = true;
        } else {
          chunks.push(buf);
          size += buf.length;
        }
      } catch {
        /* ignore a bad chunk — never break the consumer */
      }
    });
    response.on("end", () => {
      const decoded = decodeBody(chunks, headers?.["content-encoding"]);
      if (decoded == null) {
        finish(status, headers); // empty, or compressed bytes we couldn't decode → metadata only
        return;
      }
      const { body, truncated } = redactBody(decoded, config.redaction);
      finish(status, headers, undefined, { body, bodyTruncated: truncated || rawTruncated });
    });
    // Aborted/closed with no 'end' → still record the metadata.
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
  bodyInfo?: { body: string; bodyTruncated: boolean },
  reqBodyInfo?: { body: string; bodyTruncated: boolean },
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
      ...(reqBodyInfo ? { body: reqBodyInfo.body, bodyTruncated: reqBodyInfo.bodyTruncated } : {}),
    },
    response: {
      status,
      headers: redactHeaders(resHeaders as never, config.redaction),
      ...(bodyInfo ? { body: bodyInfo.body, bodyTruncated: bodyInfo.bodyTruncated } : {}),
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

interface ZlibLike {
  gunzipSync?: (b: Buffer) => Buffer;
  brotliDecompressSync?: (b: Buffer) => Buffer;
  inflateSync?: (b: Buffer) => Buffer;
  inflateRawSync?: (b: Buffer) => Buffer;
}

/** Lazily resolve node:zlib via the bundler-invisible builtin loader (see patchHttp). */
let zlibMod: ZlibLike | null | undefined;
function getZlib(): ZlibLike | null {
  if (zlibMod !== undefined) return zlibMod;
  try {
    const getBuiltin = (
      process as { getBuiltinModule?: (id: string) => unknown }
    ).getBuiltinModule;
    const ns = typeof getBuiltin === "function" ? getBuiltin("node:zlib") : undefined;
    zlibMod = ((ns as { default?: unknown })?.default ?? ns ?? null) as ZlibLike | null;
  } catch {
    zlibMod = null;
  }
  return zlibMod;
}

/**
 * Concatenate captured chunks and decode to a string, transparently decompressing
 * gzip / deflate / br. Node's http layer hands us the RAW (still-compressed) bytes —
 * axios decompresses on its own AFTER us. Returns null when there is nothing to show or
 * the bytes can't be decoded (e.g. an unknown encoding, or our capped copy cut a
 * compressed stream short) — the caller then records metadata only instead of garbage.
 */
function decodeBody(
  chunks: Buffer[],
  contentEncoding: string | string[] | undefined,
): string | null {
  if (!chunks.length) return null;
  const raw = Buffer.concat(chunks);
  if (raw.length === 0) return null;
  const enc = String(
    Array.isArray(contentEncoding) ? contentEncoding[0] : contentEncoding ?? "",
  ).toLowerCase();
  const zlib = getZlib();
  try {
    if (enc.includes("br") && zlib?.brotliDecompressSync) {
      return zlib.brotliDecompressSync(raw).toString("utf8");
    }
    if (enc.includes("gzip") && zlib?.gunzipSync) {
      return zlib.gunzipSync(raw).toString("utf8");
    }
    if (enc.includes("deflate") && zlib?.inflateSync) {
      try {
        return zlib.inflateSync(raw).toString("utf8");
      } catch {
        return zlib.inflateRawSync ? zlib.inflateRawSync(raw).toString("utf8") : null;
      }
    }
    if (enc && enc !== "identity") return null; // unknown compression — don't emit garbage
  } catch {
    return null; // decompression failed (truncated/corrupt) — skip body, keep metadata
  }
  return raw.toString("utf8");
}

/**
 * Wrap a ClientRequest's write()/end() to copy the OUTGOING body (POST/PUT/DELETE/PATCH).
 * Same safety contract as response capture: only string/Buffer chunks are copied, every
 * call delegates to the original and returns its value (the backpressure boolean / the
 * request), so the real request is byte-for-byte unchanged. Returns an accessor that
 * decodes + redacts the accumulated body, or undefined when there is none / it looks
 * binary (uploads). Request bodies are not decompressed — clients send them uncompressed.
 */
function hookRequestBody(
  req: NodeClientRequest,
  config: ResolvedCaptureConfig,
): () => { body: string; bodyTruncated: boolean } | undefined {
  const chunks: Buffer[] = [];
  let size = 0;
  let truncated = false;
  const cap = config.redaction.maxBodyBytes;

  const grab = (chunk: unknown): void => {
    try {
      if (truncated || chunk == null) return;
      if (typeof chunk !== "string" && !Buffer.isBuffer(chunk)) return; // skip streams/objects
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      if (size + buf.length > cap) {
        const room = cap - size;
        if (room > 0) {
          chunks.push(buf.subarray(0, room));
          size += room;
        }
        truncated = true;
      } else {
        chunks.push(buf);
        size += buf.length;
      }
    } catch {
      /* ignore a bad chunk — never break the request */
    }
  };

  const origWrite = typeof req.write === "function" ? req.write.bind(req) : undefined;
  const origEnd = typeof req.end === "function" ? req.end.bind(req) : undefined;
  if (origWrite) {
    req.write = (...a: unknown[]) => {
      grab(a[0]);
      return origWrite(...a);
    };
  }
  if (origEnd) {
    req.end = (...a: unknown[]) => {
      // end() may be called as end(cb) with no body — don't grab a callback.
      if (typeof a[0] !== "function") grab(a[0]);
      return origEnd(...a);
    };
  }

  return () => {
    if (!chunks.length) return undefined;
    const raw = Buffer.concat(chunks);
    if (raw.length === 0) return undefined;
    const text = raw.toString("utf8");
    if (text.includes("\u0000")) return undefined; // NUL byte → looks binary, skip
    const r = redactBody(text, config.redaction);
    return { body: r.body, bodyTruncated: r.truncated || truncated };
  };
}
