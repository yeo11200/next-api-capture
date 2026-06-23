# @shinjinseop/library

Capture **server-side (SSR/RSC, route handlers, server actions)** and **client-side**
API calls of a Next.js **App Router** app — per page render / navigation — and inspect
them in a Chrome **DevTools panel**.

In the App Router, data fetching happens **on the server**, so those calls **never appear
in the browser Network tab**. This library instruments `fetch` and Node `http`/`https`
(so axios, got and node-fetch are covered too), correlates each call to its navigation,
and streams the captures to the companion DevTools extension over a loopback dev WebSocket.

> Use it with the **Next API Capture** Chrome extension (the DevTools panel).
> Full docs, the extension, and a playground: https://github.com/yeo11200/next-api-capture

## Install

```bash
pnpm add @shinjinseop/library
# peer: next >= 13.4 (react optional)
```

## Setup (3 touch-points)

```ts
// 1) instrumentation.ts
import { registerCapture } from "@shinjinseop/library";
export async function register() {
  // dev by default; never auto-on in production
  await registerCapture();
}
```

```ts
// 2) middleware.ts
import { createCaptureMiddleware } from "@shinjinseop/library/middleware";
export const middleware = createCaptureMiddleware();
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
```

```js
// next.config.js — keep the Node-only `ws` package server-only (dev transport)
// Next 15:
module.exports = { serverExternalPackages: ["ws"] };
// Next 13.4–14.x: experimental: { serverComponentsExternalPackages: ["ws"] }
```

Then load the **Next API Capture** extension and open the **“API Capture”** panel in DevTools.

If your app already has a middleware, wrap it with `composeCaptureMiddleware(yourMiddleware)`.

## Other entry points

- `@shinjinseop/library/middleware` — `createCaptureMiddleware` / `composeCaptureMiddleware`
- `@shinjinseop/library/inject` — `<CaptureInjectScript />`, the SSR HTML-inject fallback transport
- `createCaptureRouteHandler` (from the root export) — the production debug route (token-gated)

## Configuration (defaults)

| Option | Default | Notes |
|--------|---------|-------|
| `mode` | `"dev"` | `"dev"` \| `"prod"` \| `"off"`. Never auto-on in prod. |
| `dev.wsPort` | `9477` | Dev WebSocket port (loopback only). |
| `redaction.captureResponseBody` | `true` (dev) / `false` (prod) | |
| `redaction.headerBlocklist` | `authorization, cookie, set-cookie, x-api-key, …` | Always masked. |
| `redaction.maxBodyBytes` | `65536` | Bodies truncated past this. |

## License

MIT
