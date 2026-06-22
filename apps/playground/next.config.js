const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // The dev transport uses the `ws` package (Node-only). Keep it external so Next
  // does not try to bundle ws's node builtins into the server/instrumentation bundle.
  // Next 15: `serverExternalPackages`. Next 13.4–14.x: use
  //   experimental: { serverComponentsExternalPackages: ["ws"] }
  serverExternalPackages: ["ws"],

  // Multiple lockfiles exist on this machine; pin the tracing root to this monorepo
  // so Next does not infer the wrong workspace root.
  outputFileTracingRoot: path.join(__dirname, "../../"),

  // Next 15: instrumentation.ts is enabled by default — nothing needed here.
  // Next 13.4 – 14.x: the instrumentation hook is experimental. Enable it via
  //   experimental: { instrumentationHook: true }
  // The library targets App Router broadly and degrades gracefully (warns, no-op).
};

module.exports = nextConfig;
