# Apple Fulfillment Monitor — Vercel port

A Next.js (App Router) port of `apps-script/src/Index.html` + `Api.gs`, so the
same login/session/dashboard/config UI can run on Vercel instead of Google
Apps Script.

Reuses the exact same business logic as the Apps Script version and its
local dev harness — `lib/session.js`, `lib/auth.js`, `lib/stock.js` are
copied verbatim from `apps-script/src/lib/*.js`.

## Storage caveat

There is no Google Sheet here. Session/config/logs are kept in a JSON file:

- locally: `.localdata.json` in this folder (persists across restarts)
- on Vercel: `/tmp/data.json` — **ephemeral**. Vercel's filesystem is
  read-only outside `/tmp`, `/tmp` itself doesn't survive cold starts, and
  concurrent serverless invocations don't share it. This is fine to click
  around and test with, but config/session/history will reset unpredictably
  in production. Swap `lib/store.js` for a real datastore (Vercel KV,
  Postgres, etc.) before relying on this for real use.

## Local dev

```bash
npm install
npm run dev
```

Open http://localhost:3000. First run creates `.localdata.json` with login
`admin` / `admin`.

Set `MOCK_APPLE=1` to skip real calls to apple.com while iterating on the UI.

## Deploy to Vercel

```bash
npm install -g vercel   # if not already installed
vercel login
vercel                  # first deploy, links this folder to a Vercel project
vercel --prod           # promote to production
```

Or connect this repo in the Vercel dashboard and set **Root Directory** to
`apps-script/web` so Vercel builds this app instead of `apple-stock/`.
