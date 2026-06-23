export { registerCapture } from "./register";
export { resolveConfig } from "./config";
export { createCaptureRouteHandler, type CaptureRouteOptions } from "./transport/debug-route";

// Re-export the shared contract so consumers import everything from one place.
export {
  NAV_HEADER,
  NAV_COOKIE,
  DEFAULT_WS_PORT,
  type CaptureConfig,
  type CaptureMode,
  type CaptureCall,
  type CaptureSource,
  type CaptureNavigation,
  type RedactionConfig,
  type TransportEnvelope,
} from "@shinjinseop/shared";

// NOTE: `createCaptureMiddleware` is intentionally NOT re-exported here.
// Import it from "@shinjinseop/library/middleware" so `next/server`
// (an Edge module) never gets pulled into the Node instrumentation bundle.
