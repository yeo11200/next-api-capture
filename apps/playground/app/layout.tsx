import type { ReactNode } from "react";
import { CaptureInjectScript } from "@shinjinseop/library/inject";

export const metadata = {
  title: "Next API Capture — Playground",
  description: "Dogfooding app for the next-api-capture library + extension.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, -apple-system, sans-serif",
          margin: 0,
          padding: 24,
          maxWidth: 760,
          lineHeight: 1.6,
          color: "#1a1a1a",
        }}
      >
        <nav style={{ display: "flex", gap: 16, marginBottom: 24, fontSize: 14 }}>
          <a href="/">Home</a>
          <a href="/server-fetch">Server fetch</a>
          <a href="/client-fetch">Client fetch</a>
          <a href="/actions">Server action</a>
        </nav>
        {children}
        {/* Transport (b) fallback: SSR-injected snapshot of recent server captures. */}
        <CaptureInjectScript />
      </body>
    </html>
  );
}
