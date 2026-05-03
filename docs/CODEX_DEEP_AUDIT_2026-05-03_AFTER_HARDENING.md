# Codex deep audit after cleanup pass

Last updated: 2026-05-03

This is the current working audit after the hardening pass (`6f10eb8`) and the follow-up cleanup pass.

## How to use this document

Codex should read these files in order:

1. `docs/CODEX_CONTEXT.md`
2. this file
3. `docs/CODEX_NEXT_PASS_PROMPT.md`
4. `docs/BANK_FEED_GOCARDLESS_PLAN.md` only if bank feed work is explicitly requested

Do not redo completed hardening work unless a new regression is found.

## Audit method and limits

Reviewed from the uploaded `budget-builder-review.zip`, including:

- `src/`
- `supabase/functions/`
- `supabase/migrations/`
- `scripts/`
- `docs/`
- `vercel.json`
- `package.json`

The uploaded zip intentionally excluded `node_modules`, so the full `npm run check` could not be run in the audit environment. `scripts/check-security-validation.mjs` was run directly and passed. Other scripts and the build need installed dependencies, so Codex/local terminal must still run `npm run check` after any change.

## Current readiness view

- Private beta readiness: 8.5/10
- Public production readiness: 7.8/10
- Security posture: 8.1/10
- Data correctness: 8.0/10
- Maintainability: 7.0/10

The app is much safer than at the start of the audit cycle. The largest remaining gap is no longer an obvious production blocker. It is now product trust, manual deployment verification, and maintainability.

## Completed and verified from code

Treat these as done unless a new regression is found.

### Calendar Recent Months net-only display

`src/pages/CalendarPage.jsx` bottom `Recent Months` / `This Month` section now shows month label, days used, and net only. It no longer shows `In`/`Out` in that bottom monthly list.

Do not reintroduce `In`/`Out` in the bottom Recent Months section. Day-level drilldowns may still show in/out because that is transaction detail, not a monthly income claim.

### `ai-coach` CORS fail-closed

`supabase/functions/ai-coach/index.ts` now has the same production fail-closed CORS pattern as the other Edge Functions.

It includes:

- `isProductionRuntime()`
- `isLocalOrigin()`
- `hasCorsConfigError()`
- a 500 JSON response when production/prod runtime has no `ALLOWED_ORIGINS`
- `OPTIONS` handling after the CORS config check

### `ai-coach` market price auth/rate limiting

`mode === "market_price"` now calls `enforceAiUsage()` before Yahoo Finance fetch. `enforceAiUsage()` validates the Bearer JWT and inserts an `ai_usage_events` row, so this path requires auth and is rate-limited.

Current limits:

- 60/hour
- 200/day

Small remaining improvement: move the `OPENAI_API_KEY` requirement below the `market_price` branch, because Yahoo price lookup does not use OpenAI. Keep auth/rate-limit before Yahoo fetch.

### CSV and document content sniffing

Completed:

- `UploadPageSafe.jsx` uses `validateStatementCsvFileContent()` before `Papa.parse()`.
- `UploadPageSafe.handleFiles()` catches validation exceptions and clears the file input in `finally`.
- `DebtsPage.jsx`, `InvestmentsPage.jsx`, and `ReceiptsPage.jsx` use `validateSensitiveFileContent()`.
- `src/lib/security.js` now has stricter HEIC/HEIF brand checks instead of accepting any file starting with null bytes.
- `scripts/check-security-validation.mjs` covers CSV/PDF sniffing and HEIC/HEIF brand checks.

### Explicit user scoping

Completed:

- Core user-owned reads in `App.jsx` include explicit `.eq("user_id", scopedUserId)` filters.
- Upload account `last_imported_at` update is scoped by account ID and user ID.
- Investment live price update is scoped by investment ID and user ID.

### `useViewport()` and Coach draft privacy

Completed:

- `src/App.jsx` uses `useViewport()`.
- Coach draft/autosend one-shot handoff uses `sessionStorage` rather than `localStorage`.

### Old inactive upload page

Completed:

- `src/pages/UploadPage.jsx` was confirmed unused and removed.
- `App.jsx` imports `UploadPageSafe` as the active upload page.

Archive snapshots remain in `src/archive/`. They are not active, but they contain stale patterns and make code searches noisy.

### Vercel headers

`vercel.json` exists and sets:

- `Content-Security-Policy`
- `Referrer-Policy`
- `X-Content-Type-Options`
- `X-Frame-Options`
- `Permissions-Policy`

Needs deployed smoke testing, but the repo now has the expected file.

## Documentation state

Docs are mostly current after the cleanup pass.

Current source-of-truth docs:

- `docs/CODEX_CONTEXT.md`
- this file
- `docs/CODEX_NEXT_PASS_PROMPT.md`
- `docs/security-fix-notes-2026-05-03.md`
- `docs/production-readiness.md`
- `docs/BANK_FEED_GOCARDLESS_PLAN.md`

Known doc cleanup done:

- completed hardening tasks are no longer treated as pending
- active upload page is documented as `UploadPageSafe.jsx`
- old `UploadPage.jsx` is documented as removed
- `money-organiser` is listed in production readiness
- `vercel.json` is documented
- historical issue file is marked historical

One stale doc was found during this audit:

- `docs/next-refactor-plan.md` still referenced extracting helper functions from `App.jsx` that are no longer in `App.jsx`. It should say the next structural step is `useMoneyHubData(userId)`, not helper extraction.

## Highest-value next work

### 1. Manual production/deployment verification

Code being committed is not enough for public production.

Run locally:

```powershell
cd C:\Users\User\Desktop\budget-builder
npm run check
npx supabase migration list
```

Confirm in Supabase dashboard, without exposing values:

- `ai-coach`, `money-organiser`, and `swift-worker` are deployed after the hardening commits
- `ENVIRONMENT=production` or `APP_ENV=production` is set
- `ALLOWED_ORIGINS` is set to production and preview origins
- `OPENAI_API_KEY` exists
- `SUPABASE_SERVICE_ROLE_KEY` exists
- `receipts` storage bucket is private

Confirm in Vercel:

- build command is `npm run build`
- output directory is `dist`
- `VITE_SUPABASE_URL` exists
- `VITE_SUPABASE_PUBLISHABLE_KEY` exists
- deployed responses include the security headers from `vercel.json`

### 2. Small meaningful Codex task while tokens are low

Best low-token task:

- update `docs/next-refactor-plan.md` so it no longer tells Codex to extract helpers that are already gone from `App.jsx`
- move the `OPENAI_API_KEY` requirement in `ai-coach` below the `market_price` branch so live price refresh is not blocked by OpenAI config
- add a tiny comment/test note if needed
- run `npm run check`

This is small, low-risk, and meaningful.

### 3. Next maintainability task when tokens are available

Extract `useMoneyHubData(userId)` from `App.jsx`.

Keep this separate from any product or bank-feed work. The goal is to move Supabase data state/loaders/refresh methods out of `App.jsx` while preserving all user scoping and refresh behaviour.

### 4. Later architecture target

Move Coach context generation server-side.

Current snapshot guarding is useful, but the browser still builds/saves the Coach context. For a finance app, the long-term trust target is:

- client sends message only
- Edge Function validates JWT
- Edge Function loads scoped user data
- Edge Function builds/refetches context server-side
- Edge Function checks freshness before AI call

Do not do this as a tiny patch.

## Product trust improvements for the idiot-proof goal

Prioritise features that prevent false confidence:

- confidence labels beside major numbers
- “wrong? fix it” buttons beside important insights
- Review/Checks as the core learning loop
- safe-to-spend copy that refuses to pretend historical statement net is cash today
- demo/sandbox mode with fake data
- anonymised real CSV fixtures for import and money-understanding regression checks

## Bank feed readiness

`docs/BANK_FEED_GOCARDLESS_PLAN.md` remains the correct bank-feed plan. Do not implement GoCardless until the user explicitly asks.

When bank feed work starts:

- keep GoCardless secrets server-side only
- add provider account mapping tables first
- add sync run audit table
- keep CSV upload as free/manual fallback
- bank feed should be Premium
- avoid duplicating CSV-uploaded history on first sync
- show last synced time and consent expiry everywhere relevant

## Manual smoke test checklist

Use a test account and fake/non-sensitive data.

### Upload

- valid CSV imports
- renamed binary `.csv` rejects before Papa Parse
- `13/02/2026` imports
- `01/02/2026` rejects as ambiguous
- duplicate file or duplicate rows warn correctly

### Calendar

- bottom Recent Months shows only month net
- no `In`/`Out` appears in the bottom Recent Months rows
- selected day panel still shows transaction detail

### Documents

- real PDF receipt/debt/investment document accepts
- fake PDF/image rejects
- image resize/compression still works

### AI

- Coach works after fresh import
- stale snapshot guard still works
- `market_price` works only while signed in
- `market_price` does not depend on OpenAI config after the small cleanup task

### Production

- Vercel site loads with CSP enabled
- Supabase auth still works
- Supabase Edge Function calls still work
- receipts/documents signed URLs still render

## Suggested short Codex prompt

```text
Read docs/CODEX_CONTEXT.md, docs/CODEX_DEEP_AUDIT_2026-05-03_AFTER_HARDENING.md, and docs/CODEX_NEXT_PASS_PROMPT.md.

Do the small low-token cleanup task: update docs/next-refactor-plan.md so it points to useMoneyHubData(userId) as the next App.jsx split, move ai-coach's OPENAI_API_KEY requirement below the market_price branch so Yahoo price lookup only needs auth/rate-limit, and run npm run check. Keep changes tiny and update docs if anything changes.
```
