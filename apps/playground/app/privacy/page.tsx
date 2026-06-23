const REPO = "https://github.com/yeo11200/next-api-capture";

export const metadata = {
  title: "Privacy Policy — Next API Capture",
  description: "Privacy policy for the Next API Capture Chrome extension.",
};

export default function PrivacyPage() {
  return (
    <main style={{ maxWidth: 680 }}>
      <h1>Privacy Policy</h1>
      <p style={muted}>Next API Capture (Chrome extension) · Last updated: June 23, 2026</p>

      <p>
        Next API Capture is a developer tool that displays the API/network calls made by a
        Next.js application you run locally, inside Chrome DevTools. This policy explains
        what it does with data. The short version: <strong>it collects nothing</strong>.
      </p>

      <h2 style={h2}>Data we collect</h2>
      <p>
        <strong>None.</strong> The extension does not collect, transmit, sell, rent, or
        share any personal information or user data. We operate no servers, and the
        extension contains no analytics, tracking, or advertising.
      </p>

      <h2 style={h2}>How your data is handled</h2>
      <ul>
        <li>
          Captured request/response data is sent from your own locally-running application
          to the extension over a <strong>loopback WebSocket (127.0.0.1)</strong> and is
          shown only in your browser&apos;s DevTools. It never leaves your machine and is
          never sent to us or any third party.
        </li>
        <li>
          The extension stores only your local connection settings — the dev WebSocket port
          and an optional token — using <code>chrome.storage.local</code> on your own
          device, so they persist across restarts.
        </li>
      </ul>

      <h2 style={h2}>Permissions</h2>
      <ul>
        <li>
          <code>storage</code> — persist your local connection settings across MV3
          service-worker restarts.
        </li>
        <li>
          <code>alarms</code> — periodically reconnect the local WebSocket, since MV3
          service workers go idle.
        </li>
        <li>
          Host access to <code>http://localhost/*</code> and <code>http://127.0.0.1/*</code>{" "}
          — content scripts run only on local development origins to relay client-side
          calls and read the SSR-injected capture snapshot. No remote, third-party, or
          production sites are accessed.
        </li>
      </ul>

      <h2 style={h2}>Changes to this policy</h2>
      <p>
        We may update this policy from time to time. Any changes will be posted on this
        page with an updated date.
      </p>

      <h2 style={h2}>Contact</h2>
      <p>
        Questions about this policy or the extension? Open an issue at{" "}
        <a href={`${REPO}/issues`}>{REPO.replace("https://", "")}/issues</a>.
      </p>
    </main>
  );
}

const muted = { color: "#777", fontSize: 13 } as const;
const h2 = { margin: "28px 0 8px", fontSize: 18 } as const;
