/**
 * Background service worker — the "hub".
 *
 * - Connects (as a WS client) to the library's dev WebSocket server and receives
 *   SERVER-side captured calls.
 * - Receives CLIENT-side captured calls relayed from the page (relay.js).
 * - Keeps a rolling in-memory log and broadcasts events to any open DevTools panel.
 *
 * MV3 note: an active WebSocket keeps the SW alive (Chrome 116+); we also use a
 * keepalive alarm to reconnect if the socket drops while idle.
 */

const DEFAULT_PORT = 9477;
const MAX_EVENTS = 2000;

let ws = null;
let events = [];
const panelPorts = new Set();
// Dedup calls by callId — the same server call can arrive via BOTH the WebSocket
// (live) and the HTML-inject fallback (snapshot). They share the server-generated
// callId, so we keep only the first.
let seenCallIds = new Set();

// Connection settings, persisted so they survive SW restarts. `token` must match
// the library's `dev.token` (if set) — it is appended to the WS URL as ?token=.
let settings = { port: DEFAULT_PORT, token: "" };

async function loadSettings() {
  try {
    const s = await chrome.storage.local.get(["nac_port", "nac_token"]);
    if (s.nac_port) settings.port = Number(s.nac_port) || DEFAULT_PORT;
    if (typeof s.nac_token === "string") settings.token = s.nac_token;
  } catch {
    /* storage unavailable */
  }
}

function wsUrl() {
  const base = "ws://127.0.0.1:" + settings.port;
  return settings.token ? base + "?token=" + encodeURIComponent(settings.token) : base;
}

function reconnect() {
  try {
    ws && ws.close();
  } catch {
    /* ignore */
  }
  connect();
}

function isOpen() {
  return ws && ws.readyState === 1;
}

function broadcast(msg) {
  for (const port of panelPorts) {
    try {
      port.postMessage(msg);
    } catch {
      /* port gone */
    }
  }
}

function addEvent(event) {
  events.push(event);
  if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
  broadcast({ type: "event", event });
}

function handleEnvelope(env) {
  if (!env || typeof env !== "object") return;
  if (env.type === "call" && env.call) {
    const id = env.call.callId;
    if (id) {
      if (seenCallIds.has(id)) return; // duplicate (e.g. WS + inject) — drop
      seenCallIds.add(id);
      if (seenCallIds.size > 5000) seenCallIds = new Set(); // bound memory
    }
    addEvent({ kind: "call", call: env.call, receivedAt: Date.now() });
  } else if (env.type === "navigation:start" && env.nav) {
    addEvent({ kind: "nav", nav: env.nav, receivedAt: Date.now() });
  }
}

function connect() {
  if (isOpen()) return;
  try {
    ws = new WebSocket(wsUrl());
  } catch {
    return;
  }
  ws.onopen = () => broadcast({ type: "status", connected: true });
  ws.onmessage = (e) => {
    let env;
    try {
      env = JSON.parse(e.data);
    } catch {
      return;
    }
    handleEnvelope(env);
  };
  ws.onclose = () => {
    broadcast({ type: "status", connected: false });
  };
  ws.onerror = () => {
    try {
      ws.close();
    } catch {
      /* ignore */
    }
  };
}

// Client-side captured calls arrive here via relay.js.
chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.__nac && msg.envelope) handleEnvelope(msg.envelope);
});

// DevTools panel connections.
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "panel") return;
  panelPorts.add(port);
  port.postMessage({ type: "snapshot", events, connected: isOpen(), settings });
  port.onMessage.addListener((m) => {
    if (!m) return;
    if (m.type === "clear") {
      events = [];
      seenCallIds = new Set();
      broadcast({ type: "cleared" });
    } else if (m.type === "settings") {
      settings.port = Number(m.port) || DEFAULT_PORT;
      settings.token = typeof m.token === "string" ? m.token : "";
      try {
        chrome.storage.local.set({ nac_port: settings.port, nac_token: settings.token });
      } catch {
        /* ignore */
      }
      reconnect();
    } else if (m.type === "reconnect") {
      reconnect();
    }
  });
  port.onDisconnect.addListener(() => panelPorts.delete(port));
});

// Keepalive: reconnect if the socket is not open.
try {
  chrome.alarms.create("nac-keepalive", { periodInMinutes: 0.4 });
  chrome.alarms.onAlarm.addListener((a) => {
    if (a.name === "nac-keepalive" && !isOpen()) connect();
  });
} catch {
  /* alarms unavailable */
}

loadSettings().then(connect);
