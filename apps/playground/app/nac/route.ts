import { createCaptureRouteHandler } from "@shinjinseop/next-api-capture";

// Prod debug endpoint (transport c). Requires Authorization: Bearer <NAC_PROD_TOKEN>.
//   curl -H "Authorization: Bearer $NAC_PROD_TOKEN" 'http://localhost:3000/nac?since=0'
//
// NOTE: the route folder must NOT start with "_" — Next treats `_folder` as a
// private (non-routable) folder. Use a plain segment like `nac`.
const handler = createCaptureRouteHandler({ token: process.env.NAC_PROD_TOKEN });

// Named `GET` export — Next's route compiler detects method exports statically.
export const GET = handler.GET;

export const dynamic = "force-dynamic";
