# Chrome Web Store listing — Next API Capture

## Short description (store "summary", ≤132 chars)
See the server-side API calls your Next.js App Router app makes — RSC, route handlers, server actions — in a DevTools panel.

## Category
Developer Tools

## Detailed description
In the Next.js App Router, most data is fetched on the server — during the RSC
render, inside route handlers, and inside server actions. Those requests never
show up in the browser's Network tab, which makes them hard to see while you
build and debug.

Next API Capture instruments fetch (and Node http/https — so axios, got and
node-fetch are covered too) on the server, correlates every call to the page
navigation that triggered it, and streams them to a dedicated DevTools panel —
right next to your client-side fetch and XHR calls.

What you get:
• Server + client capture — server:rsc, server:route-handler, server:action, plus client fetch and XHR.
• A real DevTools panel — filter by source, search by URL, group by navigation, clear-on-nav, live counts.
• Full request / response detail — headers and bodies (gzip/deflate/br decoded), with a resizable detail pane.
• Safe by default — never auto-on in production; sensitive headers masked; bodies size-capped and pattern-redacted.
• Drop-in and fail-safe — three small touch-points; feature-detects at runtime and degrades gracefully (warns, never throws).

How it works (in your app):
1. instrumentation.ts → registerCapture()
2. middleware.ts → createCaptureMiddleware()
3. Load this extension and open the “API Capture” panel in DevTools.

The library streams captures to the extension over a loopback dev WebSocket
(127.0.0.1). The extension only runs on http://localhost and http://127.0.0.1,
and nothing is sent to any remote server.

Open source: https://github.com/yeo11200/next-api-capture

## Single purpose (privacy tab)
Inspect the API/network calls a locally-running Next.js App Router app makes —
both server-side (RSC, route handlers, server actions) and client-side — for
local development and debugging.

## Permission justifications (privacy tab)
- storage: persist the dev WebSocket port and optional token so they survive MV3 service-worker restarts.
- alarms: periodically re-check and reconnect the dev WebSocket, since MV3 service workers go idle.
- host permissions (http://localhost/*, http://127.0.0.1/*): the content scripts that relay client-side calls and read the SSR-injected snapshot run ONLY on local dev origins — no remote hosts are requested.

## Data usage disclosures
- Does the extension collect user data? No. Captured request/response data stays
  on the developer's own machine (served over a loopback WebSocket from the
  developer's own app) and is shown only in the developer's DevTools. Nothing is
  transmitted to the publisher or any third party.
