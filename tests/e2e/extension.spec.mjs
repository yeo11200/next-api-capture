/**
 * Browser E2E: load the unpacked MV3 extension, drive the playground, and assert
 * the DevTools panel UI renders BOTH server-side and client-side captured calls.
 *
 * DevTools panels can't be automated, so we exploit two facts:
 *  - panel.js uses only chrome.runtime.connect (not chrome.devtools.*), so panel.html
 *    works when opened as a normal extension page.
 *  - the background SW collects events regardless of whether DevTools is open.
 *
 * Assumes the playground dev server is already running at NAC_TEST_PORT (default 3500),
 * with the dev WebSocket on its default port 9477 (the SW connects there).
 */
import { chromium } from "playwright";
import path from "node:path";

const PORT = process.env.NAC_TEST_PORT || "3500";
const BASE = `http://localhost:${PORT}`;
const EXT = path.resolve(process.env.EXT_PATH || "packages/extension");

function log(...a) {
  console.log(...a);
}

// Chrome for Testing (the bundled build) is purpose-built for automation and
// reliably exposes the extension's MV3 service worker.
const context = await chromium.launchPersistentContext("", {
  headless: false, // headed = most reliable for MV3 extension + service worker loading
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});

let failed = false;
try {
  // 1) Resolve the background service worker (→ extension id). MV3 SWs are lazy,
  //    so poll serviceWorkers() rather than rely on a one-shot waitForEvent.
  async function getServiceWorker(timeoutMs) {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      const sws = context.serviceWorkers();
      if (sws.length) return sws[0];
      await new Promise((r) => setTimeout(r, 500));
    }
    return null;
  }
  let sw = await getServiceWorker(30000);
  if (!sw) {
    log("DIAG serviceWorkers=" + context.serviceWorkers().length + " pages=" + context.pages().length);
    throw new Error("extension service worker did not start");
  }
  const extId = new URL(sw.url()).host;
  log("EXT_ID=" + extId);

  // 2) Generate events: server render (server:rsc) + client fetch + route handler.
  const page = await context.newPage();
  await page.goto(`${BASE}/server-fetch`, { waitUntil: "load", timeout: 30000 });
  await page.goto(`${BASE}/client-fetch`, { waitUntil: "load", timeout: 30000 });
  await page.getByRole("button", { name: /fetch jsonplaceholder/i }).click();
  await page.getByRole("button", { name: /api\/ping/i }).click();
  await page.waitForTimeout(1500);

  // Real Server Action (POST + Next-Action header) → server:action
  await page.goto(`${BASE}/actions`, { waitUntil: "load", timeout: 30000 });
  await page.getByRole("button", { name: /run server action/i }).click();
  await page.waitForTimeout(2500);

  // 3) Open the panel as a normal extension page; it connects to the SW and renders.
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extId}/src/panel.html`, { waitUntil: "load" });

  // 4) Wait for rows to appear, then assert both server and client are present.
  await panel.waitForSelector("tr.call", { timeout: 15000 }).catch(() => {});
  const serverRows = await panel.locator("tr.call .badge.server").count();
  const clientRows = await panel.locator("tr.call .badge.client").count();
  const countText = (await panel.locator("#count").textContent()) || "";
  const sources = await panel.locator("tr.call .badge").allTextContents();

  const sourceSet = new Set(sources.map((s) => s.trim()));
  log("SERVER_ROWS=" + serverRows);
  log("CLIENT_ROWS=" + clientRows);
  log("COUNT=" + JSON.stringify(countText.trim()));
  log("SOURCES=" + JSON.stringify([...sourceSet]));

  // Assert the SPECIFIC sources the browser flow exercises, not just counts —
  // otherwise a regression dropping route-handler classification would still "pass".
  // (server:action is verified separately via the Next-Action header E2E.)
  const required = ["server:rsc", "server:route-handler", "client:fetch", "server:action"];
  const missing = required.filter((s) => !sourceSet.has(s));
  if (missing.length) log("MISSING_SOURCES=" + JSON.stringify(missing));

  const pass = serverRows >= 1 && clientRows >= 1 && missing.length === 0;
  log("BROWSER_E2E=" + (pass ? "PASS" : "FAIL"));
  failed = !pass;
} catch (e) {
  log("ERROR " + (e && e.message ? e.message : e));
  log("BROWSER_E2E=FAIL");
  failed = true;
} finally {
  await context.close();
}
process.exit(failed ? 1 : 0);
