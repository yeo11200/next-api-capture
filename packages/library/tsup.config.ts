import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    middleware: "src/next/middleware.ts",
    inject: "src/next/inject.tsx",
  },
  format: ["esm", "cjs"],
  // Bundle the shared types INTO the .d.ts too (rollup-plugin-dts treats workspace
  // packages as external by default, which would leak `import ... from
  // "@shinjinseop/shared"` into the declarations — broken for consumers since shared
  // isn't published). `resolve` inlines only shared; next/react/ws types stay external.
  dts: { resolve: [/@shinjinseop\/shared/] },
  clean: true,
  sourcemap: true,
  // Use the automatic JSX runtime (react/jsx-runtime), kept external.
  esbuildOptions(options) {
    options.jsx = "automatic";
  },
  // Bundle the shared contract so consumers only need `next` (+ optional `ws`/`react`).
  noExternal: [/@shinjinseop\/shared/],
  // Peers / dynamic-only deps stay external.
  external: ["next", "ws", "react", "react/jsx-runtime", "react/jsx-dev-runtime"],
});
