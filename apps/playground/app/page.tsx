const REPO = "https://github.com/yeo11200/next-api-capture";

// Promo / landing page for the library. The other routes are live demo scenarios —
// this page pitches the value and indexes them.
export default function Home() {
  return (
    <main>
      {/* Hero — dark, echoes the DevTools panel it ships */}
      <section style={hero}>
        <p style={kicker}>Next API Capture · DevTools for the App Router</p>
        <h1 style={heroH1}>
          See the API calls your <span style={{ color: "#4ec9b0" }}>server</span> makes.
        </h1>
        <p style={heroLede}>
          In the App Router, data is fetched on the server — RSC renders, route handlers,
          server actions. Those calls never reach the Network tab. Capture every one,
          correlated per navigation, beside your client requests, in a DevTools panel.
        </p>
        <div style={ctaRow}>
          <a href="/server-fetch" style={ctaPrimary}>See a live capture →</a>
          <a href={REPO} style={ctaGhost} target="_blank" rel="noreferrer">View on GitHub</a>
        </div>

        {/* Mini mock of the panel — show, don't tell */}
        <div style={mock}>
          <div style={mockBar}>
            <span style={mockDot} /> API Capture
          </div>
          <Row badge="server:rsc" color="#4ec9b0" url="/api/products?page=1" ms="62ms" note />
          <Row badge="client:fetch" color="#569cd6" url="/api/session" ms="41ms" />
        </div>
      </section>

      {/* Feature highlights */}
      <div style={grid}>
        <Feature accent="#4ec9b0" title="Server + client capture"
          body="server:rsc · route-handler · action, plus client fetch and XHR — fetch (undici) and axios/got via node:http alike." />
        <Feature accent="#569cd6" title="DevTools panel"
          body="Filter, search, group by navigation, clear-on-nav, and a full request / response detail with headers and bodies." />
        <Feature accent="#dcdcaa" title="Safe by default"
          body="Never auto-on in production. Sensitive headers masked, bodies size-capped and pattern-redacted." />
        <Feature accent="#c586c0" title="Drop-in, fail-safe"
          body="Three touch-points: instrumentation, middleware, the extension. Feature-detects and degrades — warns, never throws." />
      </div>

      {/* Scenario index — what the other routes are */}
      <h2 style={h2}>Try the demo scenarios</h2>
      <ul style={list}>
        <li style={li}>
          <a href="/server-fetch" style={link}>/server-fetch</a>{" "}
          <span style={tag("#4ec9b0")}>server:rsc</span>
          <div style={liDesc}>A <code>fetch</code> during the RSC render — invisible in the Network tab, captured here.</div>
        </li>
        <li style={li}>
          <a href="/client-fetch" style={link}>/client-fetch</a>{" "}
          <span style={tag("#569cd6")}>client:fetch</span> <span style={tag("#4ec9b0")}>route-handler</span>
          <div style={liDesc}>A browser <code>fetch</code>, plus a POST to a route handler that runs its own upstream fetch.</div>
        </li>
        <li style={li}>
          <a href="/actions" style={link}>/actions</a>{" "}
          <span style={tag("#c586c0")}>server:action</span>
          <div style={liDesc}>A real Server Action — its server-side fetch is classified and captured as an action call.</div>
        </li>
      </ul>

      <p style={footnote}>
        Dev transport runs on <code>ws://127.0.0.1:9477</code>. Load the extension
        (<code>Load unpacked → packages/extension/</code>), open DevTools, pick the{" "}
        <strong>“API Capture”</strong> panel. MVP.
      </p>
    </main>
  );
}

function Feature({ accent, title, body }: { accent: string; title: string; body: string }) {
  return (
    <div style={card}>
      <div style={{ ...cdot, background: accent }} />
      <h3 style={cardTitle}>{title}</h3>
      <p style={cardBody}>{body}</p>
    </div>
  );
}

function Row({ badge, color, url, ms, note }: { badge: string; color: string; url: string; ms: string; note?: boolean }) {
  return (
    <div style={rowWrap}>
      <div style={row}>
        <span style={tag(color)}>{badge}</span>
        <span style={rowMethod}>GET</span>
        <span style={rowStatus}>200</span>
        <span style={rowUrl}>{url}</span>
        <span style={rowMs}>{ms}</span>
      </div>
      {note && <div style={rowNote}>↑ never appears in the browser Network tab</div>}
    </div>
  );
}

/* ── styles (self-contained, no external deps) ── */
const mono = "ui-monospace, SFMono-Regular, Menlo, monospace";

const hero = {
  margin: "8px 0 28px",
  padding: 28,
  background: "#1e1e1e",
  border: "1px solid #2d2d2d",
  borderRadius: 14,
  color: "#d4d4d4",
} as const;
const kicker = {
  margin: 0,
  fontFamily: mono,
  fontSize: 12,
  letterSpacing: 0.5,
  color: "#7a8590",
} as const;
const heroH1 = { margin: "10px 0 0", fontSize: 38, lineHeight: 1.12, letterSpacing: -0.6, color: "#fff", fontWeight: 700 } as const;
const heroLede = { margin: "14px 0 0", fontSize: 16, lineHeight: 1.6, color: "#aab1b9", maxWidth: 600 } as const;
const ctaRow = { display: "flex", gap: 12, flexWrap: "wrap", margin: "22px 0 0" } as const;
const ctaPrimary = {
  background: "#4ec9b0", color: "#06231d", padding: "10px 18px", borderRadius: 8,
  textDecoration: "none", fontWeight: 700, fontSize: 15,
} as const;
const ctaGhost = {
  border: "1px solid #3c3c3c", color: "#d4d4d4", padding: "10px 18px", borderRadius: 8,
  textDecoration: "none", fontWeight: 600, fontSize: 15,
} as const;

const mock = { margin: "24px 0 0", background: "#252526", border: "1px solid #3c3c3c", borderRadius: 10, overflow: "hidden" } as const;
const mockBar = { display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", background: "#2d2d2d", color: "#9aa1a9", fontSize: 12, borderBottom: "1px solid #3c3c3c" } as const;
const mockDot = { width: 8, height: 8, borderRadius: "50%", background: "#4ec9b0", display: "inline-block" } as const;
const rowWrap = { borderBottom: "1px solid #2a2a2a" } as const;
const row = { display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", fontFamily: mono, fontSize: 12.5, whiteSpace: "nowrap", overflow: "hidden" } as const;
const rowMethod = { color: "#9aa1a9" } as const;
const rowStatus = { color: "#4ec9b0", fontWeight: 700 } as const;
const rowUrl = { color: "#d4d4d4", overflow: "hidden", textOverflow: "ellipsis", flex: 1 } as const;
const rowMs = { color: "#7a8590" } as const;
const rowNote = { padding: "0 12px 8px 12px", fontSize: 11.5, color: "#6f7984", fontStyle: "italic" } as const;

const grid = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 14, margin: "0 0 8px" } as const;
const card = { padding: 16, border: "1px solid #ececef", borderRadius: 10, background: "#fff" } as const;
const cdot = { width: 10, height: 10, borderRadius: "50%", marginBottom: 10 } as const;
const cardTitle = { margin: "0 0 6px", fontSize: 15 } as const;
const cardBody = { margin: 0, fontSize: 13.5, color: "#555", lineHeight: 1.55 } as const;

const h2 = { margin: "36px 0 12px", fontSize: 22 } as const;
const list = { listStyle: "none", padding: 0, margin: 0 } as const;
const li = { padding: "12px 0", borderTop: "1px solid #ececef" } as const;
const liDesc = { margin: "4px 0 0", fontSize: 13.5, color: "#555" } as const;
const link = { fontFamily: mono, fontWeight: 600 } as const;
const footnote = { margin: "32px 0 0", fontSize: 13, color: "#888", lineHeight: 1.6 } as const;
const tag = (c: string) =>
  ({
    fontFamily: mono, fontSize: 11, color: c, background: `${c}22`,
    padding: "1px 7px", borderRadius: 4, verticalAlign: "middle", fontWeight: 600,
  }) as const;
