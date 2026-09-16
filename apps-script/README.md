# Apple Fulfillment Monitor — Apps Script

Google Apps Script version of the pickup monitor: Google Sheet as the datastore, single shared login, and a "newest login wins" session model (per the login/session requirement — see below).

## Layout

```
apps-script/
  src/
    Code.gs                  doGet() only — serves Index.html
    Api.gs                   google.script.run entry points (login/logout/getConfig/saveConfig/fetchAllStock)
    Index.html                UI: login screen + dashboard + config
    lib/                      pure logic, no GAS globals — unit tested with Jest
      session.js               session-replacement rules
      auth.js                  password verification
      stock.js                 Apple URL building, response parsing, history stamping
    services/                 GAS-specific adapters, thin wrappers around GAS APIs
      SessionStore.gs          PropertiesService + LockService session storage
      AuthStore.gs             credential storage/hashing (Script Properties)
      ConfigStore.gs           Config sheet read/write, setupSheets()
      AppleClient.gs           UrlFetchApp wrapper around lib/stock.js
      LogStore.gs               Logs sheet writer
  test/                       Jest tests for lib/*.js
```

The split exists so business rules (when is a session valid, when do we stamp
"found", how do we parse Apple's response) can be tested with plain Node/Jest
without spinning up Apps Script or mocking `SpreadsheetApp`. Everything that
touches a GAS service (`PropertiesService`, `LockService`, `UrlFetchApp`,
`SpreadsheetApp`) lives in `services/*.gs` and stays a thin pass-through to
the tested logic in `lib/*.js`.

## Session / login model

- One active session at a time, stored in Script Properties (`ACTIVE_SESSION`).
- `login(username, password)` verifies credentials server-side and creates a
  brand-new session token, replacing whatever was active — this is what
  "logging in from PC B kicks out PC A" means in practice.
- The token is kept in the browser's `sessionStorage` (not `localStorage`),
  so an F5 refresh keeps the session, but nothing persists once the tab
  closes.
- Every state-changing entry point (`getConfig`, `saveConfig`,
  `fetchAllStock`, `logout`) takes the token as its first argument and calls
  `SessionStore_requireValid(token)` before doing anything else. Hiding a
  button client-side is not access control — the check is server-side.
- `fetchAllStock` validates the session **before** calling the Apple API,
  writing to the Logs sheet, or updating `lastFoundAt`/`lastUnfoundAt`. If
  the session was replaced, none of that happens.
- If a call fails with the error `SESSION_REPLACED`, the client clears
  `sessionStorage` and drops back to the login screen with an explanation,
  instead of retrying or showing a generic error.
- Passwords are never stored or sent as plaintext: `login()` hashes the
  input with SHA-256 server-side and compares against a hash stored in
  Script Properties (`APP_PASSWORD_HASH`), set once via the `setCredentials`
  helper in `AuthStore.gs`.
- `SessionStore_create`/`SessionStore_logout` use `LockService.getScriptLock()`
  so two near-simultaneous logins can't race each other.

## Setup

1. Create/open a Google Sheet, then **Extensions → Apps Script**.
2. Copy the `scriptId` from that project's Settings into a local
   `.clasp.json` (copy `.clasp.json.example` and fill it in — `.clasp.json`
   is gitignored since it's per-deployment).
3. `npx clasp login` once, then `npx clasp push` from this directory to
   push everything under `src/`.
4. In the Apps Script editor, open `AuthStore.gs`, edit the `username`/
   `password` in `setCredentials()`, run it once (this sets the Script
   Properties and never stores the plaintext password anywhere), then
   revert the plaintext password in the file before pushing again.
5. Run `setupSheets()` once (or just open the web app — `getConfig()` calls
   it automatically) to create the `Config` and `Logs` sheet headers.
6. Deploy as a web app (**Deploy → New deployment → Web app**).

## Local dev (`npm run dev`)

Apps Script itself can't run locally — `Index.html` only works for real once
deployed as a Web App, because `google.script.run` only exists inside Apps
Script's runtime. `dev/` works around that with a small Node server that:

- serves `src/Index.html` **completely unmodified**, injecting
  `dev/script-run-shim.js` before it — the shim replaces `google.script.run`
  with `fetch()` calls to local `/__api__/*` routes, so the page can't tell
  the difference from the client's point of view;
- implements `login`/`logout`/`getConfig`/`saveConfig`/`fetchAllStock` in
  `dev/store.js`, reusing the exact same `src/lib/*.js` logic as production
  (session-replacement rules, password verification, history stamping) —
  just swapping `PropertiesService`/`SpreadsheetApp` for a local JSON file
  (`dev/.devdata.json`, gitignored, auto-created on first run).

```bash
npm install
npm run dev
```

Then open http://localhost:3000. First run creates `dev/.devdata.json` with
login `admin` / `admin` (printed in the server log). Auto-restarts on file
changes (`node --watch`).

By default it calls the real Apple API. To iterate on the UI without hitting
apple.com (and without risking rate limits), set `MOCK_APPLE=1`:

```bash
MOCK_APPLE=1 npm run dev
```

This gives you a real way to test the "kick out the old session" behavior
too: log in from two browser tabs/windows (or one normal + one incognito)
with the same account — logging in on the second should invalidate the
first, and its next auto-refresh should bounce it back to the login screen.

`dev/` is a local-only harness and is never pushed to Apps Script (it lives
outside `src/`, which is what `clasp push` uses as `rootDir`).

## Testing

```bash
npm install
npm test
```

Runs the Jest suite against `src/lib/*.js` — session-replacement rules,
password verification, and Apple response parsing/history stamping. These
files use `module.exports` guarded by `typeof module !== 'undefined'`, which
GAS's V8 runtime ignores harmlessly, so the same file works pushed to Apps
Script and required from Jest.

There's no automated test for the `services/*.gs` or `Api.gs` layer — those
are thin GAS-API wrappers, best verified by running the deployed web app
(login from two browsers/incognito windows and confirm the first one gets
kicked out on the next refresh).
