import { NAV_HEADER, NAV_KIND_HEADER, type RequestKind } from "@next-api-capture/shared";

let headersFn: (() => unknown) | null | undefined;

export interface RequestInfo {
  navId?: string;
  kind?: RequestKind;
}

/**
 * Read the current navigation id + request kind from the request headers via
 * `next/headers`, in a single lookup.
 *
 * Why `next/headers` instead of AsyncLocalStorage: middleware runs on the Edge
 * runtime while the RSC render runs on Node — an ALS store set in middleware does
 * NOT propagate across that boundary. The middleware instead injects
 * `x-nac-navigation-id` + `x-nac-kind` onto the *request* headers, which `headers()`
 * exposes inside Server Components / Route Handlers / Server Actions.
 *
 * `await headers()` works for both Next 15 (Promise) and Next <=14 (sync object).
 * Returns an empty object outside request scope (build, background tasks).
 */
export async function currentRequestInfo(): Promise<RequestInfo> {
  try {
    if (headersFn === undefined) {
      const mod = await import("next/headers");
      headersFn = mod.headers as () => unknown;
    }
    if (!headersFn) return {};
    const h = (await headersFn()) as { get(name: string): string | null };
    const navId = h.get(NAV_HEADER) ?? undefined;
    const kind = (h.get(NAV_KIND_HEADER) as RequestKind | null) ?? undefined;
    return { navId, kind };
  } catch {
    // Not in a request scope, or next/headers unavailable — no correlation.
    return {};
  }
}
