import { createCaptureMiddleware } from "@shinjinseop/library/middleware";

// Stamps every request (document + RSC navigation + route handlers) with a
// navigation id so server fetches and client fetches can be correlated.
export const middleware = createCaptureMiddleware();

export const config = {
  // Match everything except static assets. RSC soft-navigation requests hit the
  // route path (with an RSC header), so they are matched here too.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
