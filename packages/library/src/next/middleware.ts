import { NextResponse, type NextRequest } from "next/server";
import { NAV_COOKIE, NAV_HEADER, NAV_KIND_HEADER, type RequestKind } from "@next-api-capture/shared";

export interface CaptureMiddlewareOptions {
  /** Cookie name exposing the nav id to client-side code. Default: "nac-nav". */
  cookieName?: string;
  /** Request/response header carrying the nav id. Default: "x-nac-navigation-id". */
  headerName?: string;
}

/**
 * The standard Next middleware signature, plus the shapes a host app's middleware
 * may legitimately return (or not return) to mean "continue".
 */
export type NextMiddleware = (
  request: NextRequest,
) =>
  | NextResponse
  | Response
  | undefined
  | null
  | void
  | Promise<NextResponse | Response | undefined | null | void>;

/**
 * Creates a Next middleware that stamps each request with a navigation id.
 *
 * It writes the id to THREE places:
 *  - the forwarded *request* header  → server `headers()` reads it for correlation
 *  - the *response* header           → visible for debugging
 *  - a non-httpOnly *cookie*         → client-side fetch patch reads the same id
 *
 * Use this when the app has NO middleware of its own. If it already has one,
 * wrap it with `composeCaptureMiddleware` instead — a Next app may only export
 * a single `middleware`.
 *
 * Runs on the Edge runtime: uses Web Crypto (`globalThis.crypto`), not `node:crypto`.
 */
export function createCaptureMiddleware(options: CaptureMiddlewareOptions = {}) {
  const names = resolveNames(options);
  return function captureMiddleware(request: NextRequest): NextResponse {
    const stamp = beginStamp(request, names);
    return stamp.decorate(NextResponse.next({ request: { headers: stamp.forwarded } }));
  };
}

/**
 * Wraps an EXISTING app middleware so it also stamps the navigation id, without
 * the host having to touch any of its own return sites.
 *
 * The host keeps its middleware body verbatim — auth, redirects, rewrites, custom
 * responses — and exports the wrapped version:
 *
 *   const middleware = composeCaptureMiddleware(appMiddleware);
 *
 * Whatever the inner middleware returns is normalized and decorated:
 *  - returns nothing / `NextResponse.next()` → rebuilt as a `next()` that forwards
 *    the nav headers to the render, preserving the inner response's cookies/headers
 *  - `NextResponse.rewrite(url)`            → re-issued with forwarded nav headers
 *  - `NextResponse.redirect(url)`           → stamped (the cookie carries the id to
 *                                             the next document; the redirected
 *                                             request is re-stamped when it returns)
 *  - any terminal response (e.g. JSON)      → stamped header + cookie
 *
 * Edge-runtime safe: only Web APIs + `next/server`.
 */
export function composeCaptureMiddleware(
  inner: NextMiddleware,
  options: CaptureMiddlewareOptions = {},
) {
  const names = resolveNames(options);
  return async function capturedMiddleware(request: NextRequest): Promise<NextResponse> {
    const stamp = beginStamp(request, names);
    const innerRes = (await inner(request)) ?? undefined;

    // No response, or an explicit continue → forward the nav headers to the render.
    if (!innerRes) {
      return stamp.decorate(NextResponse.next({ request: { headers: stamp.forwarded } }));
    }

    const nr = innerRes instanceof NextResponse ? innerRes : null;
    const isRewrite = nr?.headers.has("x-middleware-rewrite") ?? false;
    const isContinue = nr?.headers.get("x-middleware-next") === "1";

    // Continue / rewrite both render a page for THIS request: re-issue the same
    // intent but with the nav headers forwarded, then graft the inner response's
    // cookies + custom headers back on.
    if (isContinue && nr) {
      const rebuilt = NextResponse.next({ request: { headers: stamp.forwarded } });
      copyResponseMeta(nr, rebuilt);
      return stamp.decorate(rebuilt);
    }
    if (isRewrite && nr) {
      const dest = nr.headers.get("x-middleware-rewrite")!;
      const rebuilt = NextResponse.rewrite(dest, { request: { headers: stamp.forwarded } });
      copyResponseMeta(nr, rebuilt);
      return stamp.decorate(rebuilt);
    }

    // Redirect or terminal custom response: header forwarding can't ride it, but the
    // cookie + response header still carry the id. Normalize to NextResponse so the
    // cookie API is available, then stamp.
    return stamp.decorate(toNextResponse(innerRes));
  };
}

interface NavNames {
  headerName: string;
  cookieName: string;
}

function resolveNames(options: CaptureMiddlewareOptions): NavNames {
  return {
    headerName: options.headerName ?? NAV_HEADER,
    cookieName: options.cookieName ?? NAV_COOKIE,
  };
}

interface Stamp {
  navId: string;
  /** Incoming request headers + the nav headers, to forward to the server render. */
  forwarded: Headers;
  /** Set the nav response header + cookie on any response, returning it. */
  decorate: (res: NextResponse) => NextResponse;
}

/** Compute the nav id + kind once and prepare the forwarding/decorating helpers. */
function beginStamp(request: NextRequest, names: NavNames): Stamp {
  const navId = request.headers.get(names.headerName) ?? generateNavId();
  const kind = classifyRequest(request);

  const forwarded = new Headers(request.headers);
  forwarded.set(names.headerName, navId);
  forwarded.set(NAV_KIND_HEADER, kind);

  return {
    navId,
    forwarded,
    decorate(res) {
      res.headers.set(names.headerName, navId);
      res.cookies.set(names.cookieName, navId, {
        httpOnly: false,
        sameSite: "lax",
        path: "/",
      });
      return res;
    },
  };
}

// Headers that encode middleware control flow — they belong to the response that
// *generated* them, so never copy them from the inner response onto a rebuilt one.
const CONTROL_HEADERS = new Set([
  "x-middleware-next",
  "x-middleware-rewrite",
  "x-middleware-override-headers",
]);

/** Copy the inner response's cookies + non-control headers onto a rebuilt response. */
function copyResponseMeta(from: NextResponse, to: NextResponse): void {
  from.headers.forEach((value, key) => {
    if (CONTROL_HEADERS.has(key) || key.startsWith("x-middleware-request-")) return;
    to.headers.set(key, value);
  });
  for (const cookie of from.cookies.getAll()) {
    to.cookies.set(cookie);
  }
}

/** Wrap a plain Response (or pass through a NextResponse) so the cookie API exists. */
function toNextResponse(res: NextResponse | Response): NextResponse {
  if (res instanceof NextResponse) return res;
  return new NextResponse(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers: res.headers,
  });
}

/**
 * Classify the request so the fetch wrapper can label the server source.
 * Heuristic, but reliable for the common cases:
 *  - Server Action: carries a `Next-Action` header (POST)
 *  - RSC navigation:  carries an `RSC` header
 *  - Document render: `Accept: text/html`
 *  - otherwise:       a Route Handler / API-style request
 */
function classifyRequest(request: NextRequest): RequestKind {
  const h = request.headers;
  if (h.get("next-action")) return "action";
  if (h.has("rsc")) return "rsc";
  if ((h.get("accept") ?? "").includes("text/html")) return "document";
  return "route-handler";
}

function generateNavId(): string {
  try {
    return globalThis.crypto.randomUUID();
  } catch {
    return `nav_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }
}
