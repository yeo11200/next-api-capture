import { getCalls } from "../store";

/**
 * Transport (b) — HTML inject FALLBACK.
 *
 * Renders a snapshot of recently-captured server calls into the SSR HTML as a
 * JSON <script>. The extension's content script reads this from the DOM, so server
 * captures are still visible when the dev WebSocket is unavailable (port blocked,
 * firewall, SW asleep). The client dedups by `callId`, so this is harmless and
 * redundant when the WS transport is working.
 *
 * IMPORTANT: this is an eventually-consistent SNAPSHOT of the global ring buffer,
 * NOT strictly the current render's calls. A sibling component renders concurrently
 * with the page, so the current request's in-flight fetches may not be buffered yet;
 * they surface on the next navigation. Place at the END of the root layout <body>.
 *
 * Usage (root layout, a Server Component):
 *   import { CaptureInjectScript } from "@shinjinseop/next-api-capture/inject";
 *   …<body>{children}<CaptureInjectScript /></body>
 */
export async function CaptureInjectScript() {
  const { calls } = getCalls(0);
  if (!calls.length) return null;

  const recent = calls.slice(-50);
  const payload = JSON.stringify({ source: "inject", calls: recent });

  return (
    <script
      type="application/json"
      id="__nac_inject__"
      // Escape "<" so a "</script>" inside any captured value can't break out of the tag.
      dangerouslySetInnerHTML={{ __html: payload.replace(/</g, "\\u003c") }}
    />
  );
}
