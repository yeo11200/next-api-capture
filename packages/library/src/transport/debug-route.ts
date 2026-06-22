import { getCalls } from "../store";

export interface CaptureRouteOptions {
  /** Bearer token required to read captures. If empty, the endpoint is disabled (403). */
  token?: string;
}

/**
 * Prod transport (c): an authenticated, on-demand endpoint that returns buffered
 * captures as JSON. In prod the dev WebSocket is off, so this is how a consumer
 * (curl, the extension's HTTP mode, a dashboard) pulls captured calls.
 *
 * Uses the Web `Response`/`URL` globals only — runtime-agnostic (Node + Edge),
 * no `next/server` import, so it is safe to export from the main entry.
 *
 * Mount in an App Router route, e.g. `app/__nac/route.ts`:
 *   export const { GET } = createCaptureRouteHandler({ token: process.env.NAC_PROD_TOKEN });
 *   export const dynamic = "force-dynamic";
 */
export function createCaptureRouteHandler(options: CaptureRouteOptions = {}) {
  const token = options.token ?? "";

  async function GET(request: Request): Promise<Response> {
    if (!token) {
      // Fail closed: never expose captures without an explicit token.
      return json({ error: "capture endpoint disabled: no token configured" }, 403);
    }
    const auth = request.headers.get("authorization") ?? "";
    const provided = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (provided !== token) {
      return json({ error: "unauthorized" }, 401);
    }

    const since = toInt(new URL(request.url).searchParams.get("since"));
    const { calls, cursor } = getCalls(since);
    return json({ calls, cursor }, 200, { "x-nac-cursor": String(cursor) });
  }

  return { GET };
}

function toInt(v: string | null): number {
  const n = Number(v ?? "0");
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function json(body: unknown, status: number, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...extraHeaders },
  });
}
