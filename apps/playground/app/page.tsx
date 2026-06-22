export default function Home() {
  return (
    <main>
      <h1>Next API Capture — Playground</h1>
      <p>
        Load the extension (Load unpacked → <code>packages/extension/</code>), open DevTools,
        select the <strong>“API Capture”</strong> panel, then try the scenarios:
      </p>
      <ul>
        <li>
          <a href="/server-fetch">/server-fetch</a> — a <code>fetch</code> during the RSC render.
          Invisible in the browser Network tab; appears here as <code>server:rsc</code>.
        </li>
        <li>
          <a href="/client-fetch">/client-fetch</a> — browser <code>fetch</code> +
          a POST to the <code>/api/ping</code> route handler (which itself fetches upstream).
        </li>
      </ul>
      <p style={{ color: "#666", fontSize: 13 }}>
        The dev WebSocket runs on <code>ws://127.0.0.1:9477</code>.
      </p>
    </main>
  );
}
