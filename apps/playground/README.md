# Next API Capture — Playground & Landing

The public site for **[@shinjinseop/next-api-capture](https://www.npmjs.com/package/@shinjinseop/next-api-capture)**. It serves three jobs:

- **`/`** — the promo landing page (what the tool is + how to set it up).
- **`/privacy`** — the privacy policy (used as the Chrome Web Store privacy-policy URL).
- **`/server-fetch`, `/client-fetch`, `/actions`** — live demo scenarios that exercise every capture source (`server:rsc`, `route-handler`, `server:action`, `client:fetch/xhr`). These dogfood the library; live capture itself needs the extension + local dev WebSocket, so on the deployed site they render but won't stream to a panel.

It's a Next.js App Router app that depends on the library via `workspace:*`.

## Deploy on Vercel

This app lives in a pnpm + Turborepo monorepo, so the library must build before the
app. The included `vercel.json` handles that:

```json
{ "framework": "nextjs", "buildCommand": "cd ../.. && pnpm turbo run build --filter=@shinjinseop/playground" }
```

Set up the Vercel project once:

1. Import `github.com/yeo11200/next-api-capture` in the Vercel dashboard
   (or run `npx vercel` from this `apps/playground/` directory).
2. **Root Directory** → `apps/playground`.
3. Framework preset → **Next.js** (auto-detected). Install/Build are taken from
   `vercel.json` above — no other overrides needed.
4. Deploy. Pushes to `main` then auto-deploy.

`turbo run build --filter=@shinjinseop/playground` builds `shared` → `library` → the app
in order (via `dependsOn: ["^build"]`), so the app's `@shinjinseop/next-api-capture`
import resolves to freshly-built `dist`.
