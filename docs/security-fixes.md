# Security fixes

## Mock submit compatibility

The mock runner uses the stage from `mock_state_v2` and sends it in the PostgREST
`Prefer: crimsprint-mock-stage=<stage>` header. The RPC still takes `p_mock` and
returns void. The manual button and timer share a synchronous per-module guard,
including while pending saves flush. The database locks the mock, compares its
stage to the submitted stage, and treats a stale submission as a no-op.

During the database-first rollout, the old client can still submit with just a
mock ID. The database uses the last active stage delivered by the state RPC and
seeds it for mocks already open during migration. A subsequent state read can
move that marker forward. A request from the old client arriving after another
tab or request has loaded the next stage is indistinguishable from a new
submission. The stage header lets the new client distinguish those requests.

## Full content security policy

A full policy would need to cover the following before enforcement.

- Next.js bootstrap and hydration scripts, the inline theme script, and
  same-origin bundles. Test a hash-based policy with the prerendered shells.
  Request-specific nonces require dynamic rendering and affect Cache
  Components and partial prerendering.
- Desmos scripts from `https://www.desmos.com` and the actual worker,
  frame, connection, image and style sources used by the configured calculator.
  Capture these with the graphing calculator enabled.
- Bundled KaTeX styles and same-origin KaTeX and Geist fonts, plus the
  inline style attributes produced by KaTeX and used by app components.
- The configured Supabase API origin for browser auth and RPC calls, plus any
  Realtime WebSocket origin if the app uses Realtime. Include same-origin app
  fetches, images and optimized image paths.
- Default source restrictions, `object-src`, `base-uri`, and `form-action`.
  Test a report-only policy across public and signed-in pages, sign-in and
  verification, navigation and prefetch, and math rendering before enforcing it.

## Local verification

```sh
npm test
bash tests/submitAnswerConcurrency.sh
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:38123 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=local-test-key npm run build
node tests/webSecurity.browser.mts
```

The locking check needs Docker and uses a disposable PostgreSQL instance with
networking disabled. The browser check needs Chrome (set `CHROME` to its
executable when needed) and starts Next.js with a loopback test backend.
