/**
 * ISOLATED-world content script: bridges page-context captures to the background SW.
 * inject.js (MAIN world) posts messages on `window`; this relay forwards them via
 * chrome.runtime.sendMessage (which MAIN world cannot call directly).
 */
window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  const data = event.data;
  if (!data || data.source !== "nac-inject" || !data.envelope) return;
  try {
    chrome.runtime.sendMessage({ __nac: true, envelope: data.envelope });
  } catch {
    /* background may be asleep; next event will retry */
  }
});

// Transport (b) FALLBACK: read the library's SSR-injected snapshot (#__nac_inject__)
// and forward each server call to the background. The background dedups by callId,
// so this is harmless when the WebSocket transport already delivered them.
function readInjectedSnapshot() {
  try {
    const el = document.getElementById("__nac_inject__");
    if (!el) return;
    const data = JSON.parse(el.textContent || "{}");
    for (const call of data.calls || []) {
      chrome.runtime.sendMessage({ __nac: true, envelope: { type: "call", call } });
    }
  } catch {
    /* ignore malformed/absent snapshot */
  }
}
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", readInjectedSnapshot);
} else {
  readInjectedSnapshot();
}
