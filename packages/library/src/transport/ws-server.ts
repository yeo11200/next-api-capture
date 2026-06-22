import type { TransportEnvelope } from "@next-api-capture/shared";

export interface Transport {
  send(env: TransportEnvelope): void;
}

let transport: Transport | null = null;
let starting: Promise<void> | null = null;

export function getTransport(): Transport | null {
  return transport;
}

/**
 * Start a dev-only WebSocket server bound to loopback. The Chrome extension
 * connects as a client and receives broadcast envelopes.
 *
 * `ws` is loaded via dynamic import so this module is import-safe on the Edge
 * runtime (where `ws`/Node net is unavailable) — it simply no-ops there.
 */
export async function startWsServer(port: number, token?: string): Promise<void> {
  if (transport) return;
  if (starting) return starting;

  starting = (async () => {
    let WebSocketServer: any;
    try {
      ({ WebSocketServer } = await import("ws"));
    } catch {
      console.warn(
        '[next-api-capture] optional dependency "ws" not found — dev transport disabled.',
      );
      return;
    }

    let wss: any;
    try {
      wss = new WebSocketServer({ host: "127.0.0.1", port });
    } catch (err: any) {
      console.warn(
        `[next-api-capture] could not bind dev WS on :${port} (${err?.message ?? err}). ` +
          `Set dev.wsPort to a free port.`,
      );
      return;
    }

    const clients = new Set<any>();

    wss.on("connection", (socket: any, req: any) => {
      if (token) {
        let provided: string | null = null;
        try {
          const u = new URL(req?.url ?? "", "http://127.0.0.1");
          provided = u.searchParams.get("token");
        } catch {
          /* ignore */
        }
        if (provided !== token) {
          socket.close(1008, "invalid token");
          return;
        }
      }
      clients.add(socket);
      socket.on("close", () => clients.delete(socket));
      socket.on("error", () => clients.delete(socket));
      safeSend(socket, JSON.stringify({ type: "hello", role: "server", ts: Date.now() }));
    });

    wss.on("error", (e: any) =>
      console.warn("[next-api-capture] dev WS error:", e?.message ?? e),
    );

    transport = {
      send(env) {
        const data = JSON.stringify(env);
        for (const c of clients) safeSend(c, data);
      },
    };

    console.log(`[next-api-capture] dev WebSocket listening on ws://127.0.0.1:${port}`);
  })();

  return starting;
}

function safeSend(socket: any, data: string): void {
  try {
    // 1 === WebSocket.OPEN
    if (socket.readyState === 1) socket.send(data);
  } catch {
    /* ignore */
  }
}
