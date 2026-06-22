/**
 * DevTools panel UI.
 * Connects a long-lived port to the background hub, renders captured calls grouped
 * by navigationId, distinguishes server vs client, and shows a request/response detail.
 */
const port = chrome.runtime.connect({ name: "panel" });

/** @type {Array<{kind:string, call?:any, nav?:any}>} */
let events = [];
let selectedId = null;
let filter = "all";
let search = "";

const $list = document.getElementById("list");
const $detail = document.getElementById("detail");
const $dot = document.getElementById("dot");
const $conn = document.getElementById("conn");
const $count = document.getElementById("count");
const $port = document.getElementById("port");
const $token = document.getElementById("token");
const $search = document.getElementById("search");
const $clearnav = document.getElementById("clearnav");

document.getElementById("clear").addEventListener("click", () => port.postMessage({ type: "clear" }));
document.getElementById("connect").addEventListener("click", () =>
  port.postMessage({ type: "settings", port: $port.value.trim() || 9477, token: $token.value.trim() }),
);
document.getElementById("filter").addEventListener("change", (e) => {
  filter = e.target.value;
  render();
});
$search.addEventListener("input", (e) => {
  search = e.target.value.trim().toLowerCase();
  render();
});

port.onMessage.addListener((msg) => {
  if (!msg) return;
  switch (msg.type) {
    case "snapshot":
      events = msg.events || [];
      if (msg.settings) {
        // Don't clobber a field the user is mid-edit.
        if (document.activeElement !== $port) $port.value = msg.settings.port ?? 9477;
        if (document.activeElement !== $token) $token.value = msg.settings.token ?? "";
      }
      setConnected(msg.connected);
      render();
      break;
    case "event":
      // Clear-on-navigation: a new nav resets the list (keeping the nav marker).
      if (msg.event.kind === "nav" && $clearnav.checked) events = [];
      events.push(msg.event);
      render();
      break;
    case "cleared":
      events = [];
      selectedId = null;
      render();
      break;
    case "status":
      setConnected(msg.connected);
      break;
  }
});

function setConnected(connected) {
  $dot.classList.toggle("on", !!connected);
  $conn.textContent = connected ? "connected" : "disconnected";
}

function isServer(source) {
  return typeof source === "string" && source.startsWith("server:");
}

function statusClass(status) {
  return "status-" + Math.floor((status || 0) / 100);
}

function render() {
  const calls = events.filter((e) => e.kind === "call").map((e) => e.call);
  const navs = {};
  for (const e of events) {
    if (e.kind === "nav" && e.nav) navs[e.nav.navigationId] = e.nav;
  }

  const filtered = calls.filter((c) => {
    if (filter === "server" && !isServer(c.source)) return false;
    if (filter === "client" && isServer(c.source)) return false;
    if (filter.indexOf("server:") === 0 && c.source !== filter) return false;
    if (search && ((c.url || "") + " " + (c.source || "")).toLowerCase().indexOf(search) === -1) return false;
    return true;
  });

  const serverN = filtered.filter((c) => isServer(c.source)).length;
  $count.textContent = serverN + " server · " + (filtered.length - serverN) + " client";

  if (filtered.length === 0) {
    $list.innerHTML =
      '<div class="empty">No calls captured yet.<br/>Open a Next page (localhost) with the library running.</div>';
    return;
  }

  // Group by navigationId, preserving first-seen order.
  const groups = new Map();
  for (const c of filtered) {
    const key = c.navigationId || "(none)";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  }

  let html = "";
  for (const [navId, groupCalls] of groups) {
    const nav = navs[navId];
    const route = nav ? nav.route : groupCalls[0] ? new URL(groupCalls[0].url, location.href).pathname : "";
    html += '<div class="nav-group">';
    html +=
      '<div class="nav-head"><span class="route">' +
      esc(route || "(unknown route)") +
      "</span> · " +
      groupCalls.length +
      ' calls · <span class="kv">' +
      esc(shortId(navId)) +
      "</span></div>";
    html += "<table>";
    for (const c of groupCalls) {
      const sel = c.callId === selectedId ? " sel" : "";
      const kind = isServer(c.source) ? "server" : "client";
      html +=
        '<tr class="call' +
        sel +
        '" data-id="' +
        esc(c.callId) +
        '">' +
        '<td><span class="badge ' +
        kind +
        '">' +
        esc(c.source) +
        "</span></td>" +
        "<td>" +
        esc(c.method) +
        "</td>" +
        '<td class="' +
        statusClass(c.response && c.response.status) +
        '">' +
        (c.error ? "ERR" : (c.response && c.response.status) || "-") +
        "</td>" +
        '<td class="url">' +
        esc(shortUrl(c.url)) +
        "</td>" +
        '<td class="kv">' +
        (c.timing ? c.timing.duration + "ms" : "") +
        "</td>" +
        "</tr>";
    }
    html += "</table></div>";
  }
  $list.innerHTML = html;

  for (const row of $list.querySelectorAll("tr.call")) {
    row.addEventListener("click", () => {
      selectedId = row.getAttribute("data-id");
      const call = calls.find((c) => c.callId === selectedId);
      renderDetail(call);
      render();
    });
  }
}

function renderDetail(call) {
  if (!call) {
    $detail.classList.remove("show");
    return;
  }
  $detail.classList.add("show");
  $detail.innerHTML =
    "<h4>General</h4>" +
    kv("Source", call.source) +
    kv("Method", call.method) +
    kv("URL", call.url) +
    kv("Status", call.error ? "ERROR: " + call.error : call.response && call.response.status) +
    kv("Duration", call.timing ? call.timing.duration + " ms" : "-") +
    kv("Navigation", call.navigationId) +
    (call.cache ? kv("Cache", call.cache) : "") +
    "<h4>Request headers</h4>" +
    pre(json(call.request && call.request.headers)) +
    (call.request && call.request.body != null ? "<h4>Request body</h4>" + pre(prettyBody(call.request.body)) : "") +
    "<h4>Response headers</h4>" +
    pre(json(call.response && call.response.headers)) +
    (call.response && call.response.body != null
      ? "<h4>Response body" + (call.response.bodyTruncated ? " (truncated)" : "") + "</h4>" + pre(prettyBody(call.response.body))
      : "");
}

function kv(k, v) {
  return '<div><span class="kv">' + esc(k) + ":</span> " + esc(String(v == null ? "-" : v)) + "</div>";
}
function pre(s) {
  return "<pre>" + esc(s || "") + "</pre>";
}
function json(o) {
  try {
    return JSON.stringify(o || {}, null, 2);
  } catch {
    return String(o);
  }
}
/**
 * Pretty-print a captured body. Bodies arrive as already-serialized strings from the
 * network (often minified JSON on one line). If the string looks like JSON, parse and
 * re-stringify with indentation; otherwise (HTML, plain text, non-JSON) leave it as-is.
 * Returns a plain string — the caller still runs it through esc() before rendering.
 */
function prettyBody(b) {
  if (b == null) return "";
  if (typeof b === "object") {
    try {
      return JSON.stringify(b, null, 2);
    } catch {
      return String(b);
    }
  }
  const s = String(b);
  const t = s.trim();
  if (t && (t[0] === "{" || t[0] === "[")) {
    try {
      return JSON.stringify(JSON.parse(t), null, 2);
    } catch {
      /* not valid JSON — fall through and show the raw string */
    }
  }
  return s;
}
function shortId(id) {
  return id && id.length > 12 ? id.slice(0, 8) + "…" : id || "";
}
function shortUrl(u) {
  try {
    const url = new URL(u, location.href);
    return url.pathname + url.search;
  } catch {
    return u;
  }
}
function esc(s) {
  // Escape for BOTH text and attribute contexts (quotes included) — captured data
  // comes from arbitrary pages/responses and must never break out of the DOM string.
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

render();
