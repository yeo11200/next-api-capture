import type { CaptureConfig } from "@shinjinseop/shared";
import { resolveConfig } from "./config";
import { patchFetch } from "./patch-fetch";
import { patchHttp } from "./patch-http";
import { startWsServer } from "./transport/ws-server";

let registered = false;

/**
 * Entry point — call from `instrumentation.ts`'s `register()`.
 *
 * Feature-detects the runtime instead of pinning a Next version:
 * - Node server runtime: patch fetch + (dev) start the WebSocket hub.
 * - Edge runtime: WS cannot start; fetch patch is attempted best-effort.
 * Never throws — capture must not take down app startup.
 */
export async function registerCapture(input?: CaptureConfig): Promise<void> {
  if (registered) return;

  try {
    const config = resolveConfig(input);
    if (config.mode === "off") return;

    registered = true;

    const isNode =
      typeof process !== "undefined" && !!(process as { versions?: { node?: string } }).versions?.node;
    const isEdge = typeof (globalThis as { EdgeRuntime?: unknown }).EdgeRuntime !== "undefined";

    if (isEdge || !isNode) {
      console.warn(
        "[next-api-capture] non-Node server runtime — dev WebSocket transport unavailable here; " +
          "server fetch capture is limited on this runtime.",
      );
    }

    if (config.mode === "dev" && isNode && !isEdge) {
      await startWsServer(config.dev.wsPort, config.dev.token || undefined);
    }

    patchFetch(config);

    // 서버 axios/got 등 fetch 를 안 거치는 클라이언트까지 잡으려면 node:http/https 패치 필요.
    // patchHttp 는 process.getBuiltinModule 로 빌트인을 가져와 번들러에 안 걸리지만,
    // 실행 자체는 Node 런타임에서만(Edge 엔 getBuiltinModule 부재) 한다.
    if (isNode && !isEdge) {
      patchHttp(config);
    }

    if (config.mode === "prod") {
      console.warn(
        `[next-api-capture] PROD mode active: sampling=${config.prod.sampling}, ` +
          `bodies ${config.redaction.captureResponseBody ? "ON" : "OFF"}. ` +
          `Ensure a token/endpoint gate before exposing captured data.`,
      );
    }
  } catch (err) {
    console.warn("[next-api-capture] registerCapture failed (continuing without capture):", err);
  }
}
