/**
 * MAIN-world content script: patches the page's real window.fetch + XMLHttpRequest.
 *
 * Runs in the page's JS context (world: "MAIN") so it wraps the SAME fetch the app
 * uses. It cannot use chrome.* APIs, so it forwards captures via window.postMessage
 * to relay.js (ISOLATED world), which relays them to the background service worker.
 *
 * Correlation: reads the `nac-nav` cookie set by the library middleware so client
 * calls share the same navigationId as the server render for that navigation.
 *
 * SECURITY (MVP scope): client-side capture is NOT redacted the way the server
 * library is — response bodies are size-capped but not pattern-masked, and the
 * server-side redaction config is not shared with the page. This is mitigated by
 * the manifest restricting content scripts to http://localhost/* and
 * http://127.0.0.1/* only, so this never runs against production origins.
 */
(function () {
  const MAX_BODY = 64 * 1024;

  function navId() {
    const m = document.cookie.match(/(?:^|;\s*)nac-nav=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : "client:" + location.pathname;
  }

  function uuid() {
    try {
      return crypto.randomUUID();
    } catch {
      return "c_" + Date.now() + "_" + Math.random().toString(36).slice(2, 10);
    }
  }

  function post(envelope) {
    try {
      window.postMessage({ source: "nac-inject", envelope }, "*");
    } catch {
      /* ignore */
    }
  }

  function cap(body) {
    if (typeof body !== "string") return { body: null };
    if (body.length > MAX_BODY) return { body: body.slice(0, MAX_BODY), bodyTruncated: true };
    return { body };
  }

  function headersToObj(h) {
    const out = {};
    try {
      h.forEach((v, k) => {
        out[k] = v;
      });
    } catch {
      /* ignore */
    }
    return out;
  }

  // Next.js dev-only infra requests: error-overlay stack frames
  // (/__nextjs_original_stack_frames), other /__nextjs_* endpoints, HMR, static
  // chunks and the image optimizer (/_next/*). These are pure tooling noise, never
  // app API calls, so we skip capturing them entirely. Real APIs (/api/*, /v1/*,
  // cross-origin hosts) don't contain these path segments, so they're unaffected.
  function ignored(url) {
    const u = String(url || "");
    return u.indexOf("/__nextjs_") !== -1 || u.indexOf("/_next/") !== -1;
  }

  // ---- fetch ----
  const origFetch = window.fetch;
  if (typeof origFetch === "function") {
    window.fetch = function (input, init) {
      const start = Date.now();
      const method = ((init && init.method) || (input && input.method) || "GET").toUpperCase();
      const url = typeof input === "string" ? input : (input && input.url) || String(input);

      // Skip Next.js dev infra (stack frames, HMR, _next/*) without touching behavior.
      if (ignored(url)) return origFetch.apply(this, arguments);

      return origFetch.apply(this, arguments).then(
        (res) => {
          const duration = Date.now() - start;
          let body = null;
          let bodyTruncated = false;
          try {
            res
              .clone()
              .text()
              .then((text) => {
                const c = cap(text);
                body = c.body;
                bodyTruncated = !!c.bodyTruncated;
                post({
                  type: "call",
                  call: {
                    callId: uuid(),
                    navigationId: navId(),
                    source: "client:fetch",
                    method,
                    url,
                    request: { headers: {} },
                    response: { status: res.status, headers: headersToObj(res.headers), body, bodyTruncated },
                    timing: { start, duration },
                  },
                });
              })
              .catch(() => {
                post(callNoBody());
              });
          } catch {
            post(callNoBody());
          }
          return res;

          function callNoBody() {
            return {
              type: "call",
              call: {
                callId: uuid(),
                navigationId: navId(),
                source: "client:fetch",
                method,
                url,
                request: { headers: {} },
                response: { status: res.status, headers: headersToObj(res.headers) },
                timing: { start, duration },
              },
            };
          }
        },
        (err) => {
          post({
            type: "call",
            call: {
              callId: uuid(),
              navigationId: navId(),
              source: "client:fetch",
              method,
              url,
              request: { headers: {} },
              response: { status: 0, headers: {} },
              timing: { start, duration: Date.now() - start },
              error: String((err && err.message) || err),
            },
          });
          throw err;
        },
      );
    };
  }

  // ---- XMLHttpRequest (basic) ----
  const OrigXHR = window.XMLHttpRequest;
  if (OrigXHR) {
    const open = OrigXHR.prototype.open;
    const send = OrigXHR.prototype.send;
    OrigXHR.prototype.open = function (method, url) {
      this.__nac = { method: method, url: url, start: Date.now() };
      return open.apply(this, arguments);
    };
    OrigXHR.prototype.send = function () {
      const xhr = this;
      const info = xhr.__nac;
      if (info && !ignored(info.url)) {
        xhr.addEventListener("loadend", function () {
          let body = null;
          try {
            if (typeof xhr.responseText === "string") body = cap(xhr.responseText).body;
          } catch {
            /* responseType not text */
          }
          post({
            type: "call",
            call: {
              callId: uuid(),
              navigationId: navId(),
              source: "client:xhr",
              method: (info.method || "GET").toUpperCase(),
              url: String(info.url),
              request: { headers: {} },
              response: { status: xhr.status, headers: {}, body },
              timing: { start: info.start, duration: Date.now() - info.start },
            },
          });
        });
      }
      return send.apply(this, arguments);
    };
  }

  // ---- soft-navigation detection (App Router client transitions) ----
  function announce(kind) {
    post({
      type: "navigation:start",
      nav: { navigationId: navId(), route: location.pathname, kind, startedAt: Date.now() },
    });
  }
  try {
    const pushState = history.pushState;
    history.pushState = function () {
      const r = pushState.apply(this, arguments);
      announce("soft-nav");
      return r;
    };
    window.addEventListener("popstate", () => announce("soft-nav"));
  } catch {
    /* ignore */
  }
  announce("document");
})();
