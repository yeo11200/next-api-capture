# Chrome Web Store listing — Next API Capture

────────────────────────────────────────────────────────
## A. Privacy practices tab — paste each field (개인정보 보호 관행 탭)
────────────────────────────────────────────────────────

### Single purpose (단일 목적)
Next API Capture is a developer tool for inspecting the API/network calls made by the developer's own locally-running Next.js App Router app — both server-side (RSC renders, route handlers, server actions) and client-side (fetch/XHR) — inside a Chrome DevTools panel, for local development and debugging.

### Permission: storage (storage 권한 사유)
Saves the developer's local connection settings (the dev WebSocket port and an optional token) with chrome.storage.local so they persist across MV3 service-worker restarts. No browsing history or personal data is stored.

### Permission: alarms (alarms 권한 사유)
Schedules a periodic check that re-opens the loopback dev WebSocket. MV3 service workers are terminated when idle, so the alarm restores the connection. Used only for reconnection timing — no other purpose.

### Host permissions: http://localhost/*, http://127.0.0.1/* (호스트 권한 사유)
This is a local-only development tool. The content scripts run exclusively on http://localhost/* and http://127.0.0.1/* to relay the page's client-side fetch/XHR calls and read the SSR-injected capture snapshot from the developer's own dev server. No remote, third-party, or production hosts are requested or accessed.

### Remote code (원격 코드)
Answer: NO — "I am not using remote code."
(If a justification box appears) All code ships inside the package. The extension opens a WebSocket to 127.0.0.1 to receive capture DATA from the developer's local app; it never downloads or executes remotely-hosted JavaScript, WebAssembly, or eval'd code.

### Data usage / certification (데이터 사용 인증)
Data collection: declare that the extension does NOT collect or transmit any user data. Captured request/response data stays on the developer's machine (served over a loopback WebSocket from their own app) and is shown only in their DevTools — nothing is sent to the publisher or any third party.
Then check all three required certifications (all true here):
- I do not sell or transfer user data to third parties (outside approved use cases).
- I do not use or transfer user data for purposes unrelated to the item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

────────────────────────────────────────────────────────
## B. Account / publisher settings (설정 페이지 — 직접 처리)
────────────────────────────────────────────────────────
- Add a CONTACT EMAIL you can actually receive mail at (not a no-reply address),
  then click the verification link Google emails you. Required before publishing.
- This is done in Account / Settings, not in the item form.

────────────────────────────────────────────────────────
## C. Store listing copy (스토어 등록 정보)
────────────────────────────────────────────────────────

### Short description (summary, ≤132 chars — 124)
See the server-side API calls your Next.js App Router app makes — RSC, route handlers, server actions — in a DevTools panel.

### Category
Developer Tools

### Detailed description
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
