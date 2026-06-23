# next-api-capture (MVP)

Capture **server-side (SSR/RSC) and client-side API calls** of a Next.js **App Router**
app — per page render / navigation — and inspect them in a Chrome **DevTools panel**.

The whole point: in App Router, data fetching happens **on the server**, so those calls
**never appear in the browser Network tab**. A server-side library instruments `fetch`
and streams the captures to the extension over a dev WebSocket.

> **Implemented**: monorepo · library core · transports **(a) dev WebSocket**, **(b) HTML-inject
> fallback**, **(c) prod debug-route** · server source classification (`rsc` / `route-handler` /
> `action`) · playground · DevTools panel (filter / search / clear-on-nav / counts) · browser E2E.
> **Deferred**: full prod hardening, extension-side polling of the prod debug-route
> (consume it via curl/dashboard for now).

## Monorepo layout

```
next-api-capture/
├── packages/
│   ├── shared/      # types + constants shared by library and extension
│   ├── library/     # Next instrumentation: fetch patch, correlation, WS transport
│   └── extension/   # MV3 Chrome extension — DevTools panel (plain JS, no build)
└── apps/
    └── playground/  # Next App Router app that dogfoods the library
```

## Compatibility

- **Target: Next.js App Router, `next >= 13.4`** (not pinned to 15). The library
  **feature-detects** at runtime and degrades gracefully (warns, never throws).
- `instrumentation.ts` is **stable in Next 15**. On **13.4–14.x** enable it via
  `experimental.instrumentationHook: true` in `next.config` (see comment there).
- Server Actions source labelling needs **Next 14+**.

## Quick start (dev)

```bash
pnpm install
pnpm build                       # builds shared + library
pnpm --filter @shinjinseop/playground dev
```

Then in Chrome: `chrome://extensions` → enable Developer mode → **Load unpacked** →
select `packages/extension/`. Open DevTools on `http://localhost:3000`, pick the
**“API Capture”** panel, and visit `/server-fetch` and `/client-fetch`.

## Integrating into your own app (3 touch-points)

```ts
// 1) instrumentation.ts
import { registerCapture } from "@shinjinseop/library";
export async function register() {
  // mode defaults to "dev" in development and "off" in production — do NOT
  // hardcode `mode: "dev"` here or you defeat the prod-safe default.
  await registerCapture();
}
```

```ts
// 2) middleware.ts — app has NO middleware of its own
import { createCaptureMiddleware } from "@shinjinseop/library/middleware";
export const middleware = createCaptureMiddleware();
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
```

```ts
// 2b) middleware.ts — app ALREADY has a middleware (only one is allowed per app).
// Keep your existing body verbatim and wrap it; the wrapper normalizes every
// return shape (continue / redirect / rewrite / custom) and forwards the nav
// headers to the render, preserving your response's cookies + headers.
import { composeCaptureMiddleware } from "@shinjinseop/library/middleware";
import { type NextRequest } from "next/server";

async function appMiddleware(req: NextRequest) {
  // …your existing auth / redirect / rewrite logic, unchanged…
}

export const middleware = composeCaptureMiddleware(appMiddleware);
export const config = { matcher: [/* keep your existing matcher */] };
```

```
// 3) Load the extension (packages/extension/) and open the API Capture panel.
```

```js
// next.config.js — keep the Node-only `ws` package external (dev transport).
// Next 15:
module.exports = { serverExternalPackages: ["ws"] };
// Next 13.4–14.x: experimental: { serverComponentsExternalPackages: ["ws"] }
```

## Configuration

| Option | Default | Notes |
|--------|---------|-------|
| `mode` | `"dev"` | `"dev"` \| `"prod"` \| `"off"`. Never auto-on in prod. |
| `dev.wsPort` | `9477` | Dev WebSocket port (loopback only). |
| `dev.token` | – | If set, the extension must present it to connect. |
| `prod.sampling` | `0.1` | 0..1, prod only. |
| `redaction.captureResponseBody` | `true` (dev) / `false` (prod) | |
| `redaction.headerBlocklist` | `authorization, cookie, set-cookie, x-api-key, …` | Always masked. |
| `redaction.maxBodyBytes` | `65536` | Bodies truncated past this. |

## Production (debug route, transport c)

In `mode: "prod"` the dev WebSocket is **off**. Captures accumulate in an in-memory
ring buffer, read on demand from an authenticated route handler:

```ts
// app/nac/route.ts  — NOTE: do NOT use a "_"-prefixed folder; Next treats
// `_folder` as private (non-routable). A plain segment like `nac` works.
import { createCaptureRouteHandler } from "@shinjinseop/library";
const handler = createCaptureRouteHandler({ token: process.env.NAC_PROD_TOKEN });
export const GET = handler.GET; // named export — Next does NOT detect `export const { GET }`
export const dynamic = "force-dynamic";
```

```bash
# Requires the token; without it → 401/403. `since` is a cursor for incremental polls.
curl -H "Authorization: Bearer $NAC_PROD_TOKEN" 'https://your-app/nac?since=0'
# → { "calls": [ ... ], "cursor": 42 }
```

Defaults in prod stay conservative: bodies OFF, `sampling` 0.1, sensitive headers masked.
Fail-closed: if no `token` is configured the endpoint returns 403.

## HTML-inject fallback (transport b)

When the dev WebSocket is unavailable (port blocked, firewall, SW asleep), mount the
inject component at the end of your root layout `<body>`:

```tsx
import { CaptureInjectScript } from "@shinjinseop/library/inject";
// …<body>{children}<CaptureInjectScript /></body>
```

It renders a snapshot of recently-captured server calls into the SSR HTML; the
extension reads it from the DOM and **dedups by `callId`**, so it's harmless and
redundant when the WebSocket is working. It is an eventually-consistent snapshot
(the current request's in-flight fetches surface on the next navigation).

## How correlation works

`createCaptureMiddleware` stamps each request with `x-nac-navigation-id` (request +
response header) and a non-httpOnly `nac-nav` cookie. The server reads the id via
`next/headers` `headers()`; the client fetch patch reads the same id from the cookie —
so server and client calls for one navigation share a `navigationId`.

## Testing

```bash
pnpm install
pnpm build            # shared + library
pnpm typecheck        # library + playground, 0 errors

# Browser E2E — loads the extension in Chrome for Testing, drives the playground,
# and asserts the panel renders BOTH server and client captures.
npx playwright install chromium   # one-time
pnpm e2e
# → EXT_ID=…, SERVER_ROWS≥1, CLIENT_ROWS≥1, BROWSER_E2E=PASS
```

The E2E opens `panel.html` as a normal extension page (it uses only
`chrome.runtime.connect`, not `chrome.devtools.*`), sidestepping the un-automatable
DevTools panel while still exercising the full capture → SW → panel-render pipeline.

## Known limitations (MVP)

- Server source is classified by middleware into `server:rsc` / `server:route-handler`
  / `server:action` via request headers — a reliable heuristic, not a guarantee for
  every edge case.
- `headers()` marks routes dynamic — intended for dev debugging.
- `fetch`-patch ordering vs Next's own patch is a tracked risk (see library source).
- MV3 service worker may sleep; an alarm-based reconnect mitigates dropped sockets.
- **Client-side capture is not redacted** — response bodies are size-capped but not
  pattern-masked, and the library's redaction config applies to the **server path only**.
  Mitigated by the manifest restricting content scripts to `localhost`/`127.0.0.1` only.
- The page→extension relay accepts any `window.postMessage` of the expected shape, so a
  page script could forge client envelopes (dev-only, low risk). The panel escapes all
  rendered values (incl. quotes) so forged data cannot inject into the DevTools DOM.
- `mode` is **never auto-on in production**: unset → `off` when `NODE_ENV==="production"`,
  `dev` otherwise. Enabling prod capture requires an explicit `mode: "prod"`.
