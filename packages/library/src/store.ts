import type { CaptureCall, TransportEnvelope } from "@shinjinseop/shared";
import { getTransport } from "./transport/ws-server";

interface Buffered {
  seq: number;
  call: CaptureCall;
}

interface StoreState {
  buffer: Buffered[];
  seq: number;
}

const BUFFER_MAX = 500;

/**
 * The ring buffer lives on `globalThis`, NOT in module scope.
 *
 * Next bundles `instrumentation.ts` and a route handler into separate chunks, each
 * getting its own copy of this module. The patched fetch (bound to the instrumentation
 * bundle) writes here; the prod debug route (a different bundle) reads here. A
 * module-level array would be two different buffers — a globalThis singleton is shared.
 */
function state(): StoreState {
  const g = globalThis as unknown as { __nacStore?: StoreState };
  if (!g.__nacStore) g.__nacStore = { buffer: [], seq: 0 };
  return g.__nacStore;
}

/**
 * Record a captured call: push to the shared ring buffer (read by the prod debug
 * route) AND emit over the active transport (dev WebSocket).
 * Best-effort: any failure here must never affect the host app's fetch.
 */
export function recordCall(call: Omit<CaptureCall, "callId">): void {
  try {
    const s = state();
    const full: CaptureCall = { callId: generateId(), ...call };
    s.seq += 1;
    s.buffer.push({ seq: s.seq, call: full });
    if (s.buffer.length > BUFFER_MAX) s.buffer.splice(0, s.buffer.length - BUFFER_MAX);
    emit({ type: "call", call: full });
  } catch {
    /* swallow — capture must never break the app */
  }
}

/** Read buffered calls after `since` (a cursor). Used by the prod debug route. */
export function getCalls(since = 0): { calls: CaptureCall[]; cursor: number } {
  const s = state();
  const fresh = s.buffer.filter((b) => b.seq > since);
  const cursor = s.buffer.length ? s.buffer[s.buffer.length - 1]!.seq : since;
  return { calls: fresh.map((b) => b.call), cursor };
}

export function clearCalls(): void {
  state().buffer.length = 0;
}

export function emit(env: TransportEnvelope): void {
  try {
    getTransport()?.send(env);
  } catch {
    /* ignore */
  }
}

/**
 * Runtime-agnostic id. Uses Web Crypto (`globalThis.crypto`), available on both
 * Node (19+) and Edge — deliberately NOT `node:crypto`, which Next's bundler
 * cannot resolve when it bundles instrumentation.ts.
 */
function generateId(): string {
  try {
    return globalThis.crypto.randomUUID();
  } catch {
    return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }
}
