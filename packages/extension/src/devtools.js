// Registers the "API Capture" panel in DevTools.
// NOTE: panels.create() resolves pagePath relative to the EXTENSION ROOT, not to
// this devtools page — so it must include the `src/` prefix. ("panel.html" alone
// resolves to /panel.html at the root and fails with a "page moved/deleted" panel.)
chrome.devtools.panels.create("API Capture", "", "src/panel.html", () => {
  /* panel created */
});
