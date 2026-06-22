import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    middleware: "src/next/middleware.ts",
    inject: "src/next/inject.tsx",
  },
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  // Use the automatic JSX runtime (react/jsx-runtime), kept external.
  esbuildOptions(options) {
    options.jsx = "automatic";
  },
  // Bundle the shared contract so consumers only need `next` (+ optional `ws`/`react`).
  noExternal: [/@next-api-capture\/shared/],
  // Peers / dynamic-only deps stay external.
  external: ["next", "ws", "react", "react/jsx-runtime", "react/jsx-dev-runtime"],
});
