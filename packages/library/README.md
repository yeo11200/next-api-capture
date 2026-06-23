# @shinjinseop/next-api-capture

![npm](https://img.shields.io/npm/v/@shinjinseop/next-api-capture) ![license](https://img.shields.io/npm/l/@shinjinseop/next-api-capture)

**See the API calls your Next.js App Router app makes on the *server* — the ones that never show up in the browser Network tab — in a Chrome DevTools panel, right next to your client-side calls.**

## Why

In the App Router, most data fetching happens **on the server**: during the RSC render, inside route handlers, and inside server actions.

- Those requests are **invisible in the browser's Network tab** (they never touch the browser).
- After you deploy, they're even harder to see.

`@shinjinseop/next-api-capture` instruments `fetch` **and** Node `http`/`https` on the server (so `axios`, `got`, and `node-fetch` are covered too), correlates every call to the page navigation that triggered it, and streams them to a dedicated **DevTools panel** — server (`server:rsc` / `route-handler` / `action`) and client (`fetch` / `xhr`) side by side.

---

## 1. Install the library

```bash
pnpm add @shinjinseop/next-api-capture
# or: npm i @shinjinseop/next-api-capture / yarn add @shinjinseop/next-api-capture
```

Peer dependency: **`next >= 13.4`** (App Router). `react` is an optional peer (only the HTML-inject fallback needs it).

## 2. Wire it into your app (3 touch-points)

```ts
// instrumentation.ts  (project root, next to package.json — or src/)
import { registerCapture } from "@shinjinseop/next-api-capture";

export async function register() {
  // Defaults to "dev" in development and "off" in production.
  // It is NEVER auto-on in prod — enabling prod capture is explicit.
  await registerCapture();
}
```

```ts
// middleware.ts
import { createCaptureMiddleware } from "@shinjinseop/next-api-capture/middleware";

export const middleware = createCaptureMiddleware();
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
```

> Only one middleware is allowed per app. If you already have one, **wrap** it instead:
> ```ts
> import { composeCaptureMiddleware } from "@shinjinseop/next-api-capture/middleware";
> export const middleware = composeCaptureMiddleware(yourExistingMiddleware);
> ```

```js
// next.config.js — keep the Node-only `ws` package server-only (dev transport)
// Next 15:
module.exports = { serverExternalPackages: ["ws"] };
// Next 13.4–14.x:
// module.exports = { experimental: { serverComponentsExternalPackages: ["ws"] } };
```

On **13.4–14.x** you also need `experimental.instrumentationHook: true` to enable `instrumentation.ts`. It is stable (no flag) on **Next 15**.

## 3. Get the DevTools extension

> The Chrome extension is currently **pending Chrome Web Store review**. Until it's
> listed, load it **unpacked** from this repository — it takes ~20 seconds.

1. Get the repo (it contains the extension under `packages/extension/`):
   ```bash
   git clone https://github.com/yeo11200/next-api-capture.git
   ```
2. Open **`chrome://extensions`** in Chrome.
3. Toggle **Developer mode** on (top-right corner).
4. Click **Load unpacked**.
5. Select the **`packages/extension/`** folder — the one that contains `manifest.json`
   (not the repo root, not `src/`).
6. The extension **“Next API Capture”** now appears in your list. ✅

That folder is plain MV3 JavaScript — there is no build step for the extension.

## 4. Capture something

1. Run your app on `http://localhost` (the extension only attaches to `localhost` / `127.0.0.1`).
2. Open **DevTools** (F12 / ⌥⌘I) → pick the **“API Capture”** panel from the tab bar.
3. Navigate your app. Calls stream in live, grouped per navigation:

| Source badge | Where it came from |
|---|---|
| `server:rsc` | `fetch`/http during a Server Component render |
| `server:route-handler` | inside a Route Handler (`app/**/route.ts`) |
| `server:action` | inside a Server Action |
| `client:fetch` / `client:xhr` | in the browser |

Click a row to see headers and request/response bodies (gzip/deflate/br decoded). Drag the divider to resize the detail pane.

---

## Other entry points

- `@shinjinseop/next-api-capture/middleware` — `createCaptureMiddleware` / `composeCaptureMiddleware`
- `@shinjinseop/next-api-capture/inject` — `<CaptureInjectScript />`, an SSR HTML-inject **fallback transport** for when the dev WebSocket is unavailable (mount at the end of your root `layout.tsx` `<body>`).
- `createCaptureRouteHandler` (root export) — a **production** debug route (token-gated, fail-closed).

## Configuration

`registerCapture(config)` accepts:

| Option | Default | Notes |
|--------|---------|-------|
| `mode` | `"dev"` | `"dev"` \| `"prod"` \| `"off"`. Never auto-on in production. |
| `dev.wsPort` | `9477` | Dev WebSocket port (loopback only). Match it in the panel if you change it. |
| `dev.token` | – | If set, the panel must present the same token to connect. |
| `prod.sampling` | `0.1` | 0..1, prod only. |
| `redaction.captureResponseBody` | `true` (dev) / `false` (prod) | |
| `redaction.headerBlocklist` | `authorization, cookie, set-cookie, x-api-key, …` | Always masked. |
| `redaction.maxBodyBytes` | `65536` | Bodies truncated past this. |
| `redaction.maskPatterns` | `[]` | Regex sources masked in bodies. |

## Production debug route (optional)

In `mode: "prod"` the dev WebSocket is off; captures accumulate in an in-memory ring buffer, read on demand from an authenticated route handler:

```ts
// app/nac/route.ts  (a plain segment — do NOT use a "_"-prefixed private folder)
import { createCaptureRouteHandler } from "@shinjinseop/next-api-capture";
const handler = createCaptureRouteHandler({ token: process.env.NAC_PROD_TOKEN });
export const GET = handler.GET;
export const dynamic = "force-dynamic";
```

```bash
curl -H "Authorization: Bearer $NAC_PROD_TOKEN" 'https://your-app/nac?since=0'
# → { "calls": [ ... ], "cursor": 42 }
```

Fail-closed: with no token configured the endpoint returns 403.

## How correlation works

`createCaptureMiddleware` stamps each request with an `x-nac-navigation-id` header and a `nac-nav` cookie. The server reads the id via `next/headers`; the client fetch patch reads the same id from the cookie — so server and client calls for one navigation share a `navigationId`.

## Notes

- Safe by default: `mode` is never auto-on in production; sensitive headers are masked; bodies are size-capped and pattern-redacted.
- Fail-safe: the library feature-detects at runtime and degrades gracefully — it warns, never throws, and never alters or blocks your real requests.
- Repo, extension, and a playground: https://github.com/yeo11200/next-api-capture

## License

MIT © yeo11200
