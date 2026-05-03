# Codex deep audit after hardening pass

Last updated: 2026-05-03

This document is the working audit for the next Codex pass. It reflects a deep review of the uploaded `budget-builder-review.zip` after commit `6f10eb8` (`Harden coach and upload flows`).

## How to use this document

Codex should read these files in order:

1. `docs/CODEX_CONTEXT.md`
2. this file
3. `docs/CODEX_NEXT_PASS_PROMPT.md`
4. `docs/BANK_FEED_GOCARDLESS_PLAN.md` only if bank feed work is explicitly requested

The previous production hardening pass is complete. Do not redo it unless a regression is found.

## Audit method and limits

Reviewed from the uploaded project zip, including:

- `src/`
- `supabase/functions/`
- `supabase/migrations/`
- `scripts/`
- `docs/`
- `vercel.json`
- `package.json`

I could not run the full check command in the audit environment because `node_modules` was intentionally excluded from the zip and `eslint`/`vite` were not installed. The local/Codex report says `npm run check` passed. Treat that as the main check signal, but still run it again after every patch.

## Current readiness view

- Private beta: strong enough to continue testing.
- Public production: closer, but still needs documentation cleanup, manual deployment verification, and a few smaller correctness/security follow-ups.
- Biggest remaining risk: not one obvious blocker, but trust erosion from stale docs, old inactive files, and untested edge cases.

Suggested score after this pass:

- Private beta readiness: 8.4/10
- Public production readiness: 7.7/10
- Security posture: 8.0/10
- Data correctness: 8.0/10
- Maintainability: 6.9/10

## Completed and verified from code

The following items are implemented in the zip and should be treated as complete unless a new issue is found.

### Calendar Recent Months net-only display

`src/pages/CalendarPage.jsx` bottom `Recent Months` / `This Month` section no longer shows `In` and `Out`. It shows month label, days used, and net only.

This matches the user request. Do not reintroduce `In`/`Out` in that bottom section.

### `ai-coach` CORS fail-closed

`supabase/functions/ai-coach/index.ts` now:

- has `isProductionRuntime()`
- has `isLocalOrigin()`
- has `hasCorsConfigError()`
- returns a 500 JSON error when production/prod runtime has no `ALLOWED_ORIGINS`
- handles `OPTIONS` after the CORS config check
- allows local origins in non-production when no origins are configured

This aligns it with `money-organiser` and `swift-worker`.

### `ai-coach` market price auth/rate limiting

`mode === "market_price"` now calls `enforceAiUsage()` before Yahoo Finance fetch. `enforceAiUsage()` validates the Bearer JWT and inserts an `ai_usage_events` row, so this path now requires auth and is rate-limited.

Current limits:

- 60/hour
- 200/day

### CSV content sniffing wired into `UploadPageSafe`

`src/pages/UploadPageSafe.jsx` imports `validateStatementCsvFileContent()` and awaits it before `Papa.parse()`.

Account `last_imported_at` is now updated with both:

```js
.eq("id", accountId)
.eq("user_id", user.id)
```

### Debt and investment document content sniffing

`src/pages/DebtsPage.jsx` and `src/pages/InvestmentsPage.jsx` now use `validateSensitiveFileContent()` on selection and before upload.

### Investment live price update scoped by user

`src/pages/InvestmentsPage.jsx` now fetches the signed-in user before updating live price fields and scopes the update by both investment ID and user ID.

### `useViewport()` wired into App

`src/App.jsx` imports `useViewport()` and no longer keeps local resize state/effect for screen width and viewport height.

### Coach draft/autosend uses sessionStorage

`src/App.jsx` and `src/pages/CoachPage.jsx` use `sessionStorage` for the one-shot `COACH_DRAFT_KEY` and `COACH_AUTOSEND_KEY` handoff. Other localStorage keys are intentionally unchanged.

### Vercel headers exist

`vercel.json` exists and sets:

- `Content-Security-Policy`
- `Referrer-Policy`
- `X-Content-Type-Options`
- `X-Frame-Options`
- `Permissions-Policy`

The CSP is practical and should work for the current app shape, but still needs deployed smoke testing.

## Highest-priority next work

### 1. Update and clean stale docs

Docs are now the main mismatch.

Files that need updating:

- `docs/CODEX_CONTEXT.md`
- `docs/security-fix-notes-2026-05-03.md`
- `docs/maintainer-map.md`
- `docs/production-readiness.md`
- `docs/critical-issues-next-session.md`
- maybe `docs/next-refactor-plan.md`

Required doc fixes:

- Stop listing completed hardening tasks as pending.
- Make clear that `UploadPageSafe.jsx` is the active upload page.
- Mark old `UploadPage.jsx` as inactive or scheduled for removal.
- Add `money-organiser` to production readiness Edge Function list.
- Add `ai_usage_events`, `coach_context_snapshots`, `subscription_profiles`, `bank_connections`, and `transaction_rules` to table/readiness notes where relevant.
- Mark `docs/critical-issues-next-session.md` as historical, or refresh it with only still-relevant bugs.
- Mention that `vercel.json` now exists.

Finish criterion: a future Codex run should not get contradictory instructions from docs.

### 2. Confirm hardening deployment and environment setup

Code being committed is not enough for public production.

Manual verification needed:

```powershell
cd C:\Users\User\Desktop\budget-builder
npm run check
npx supabase migration list
```

Confirm in Supabase, without revealing secret values:

- `ai-coach` deployed after commit `6f10eb8`
- `money-organiser` deployed
- `swift-worker` deployed
- `ENVIRONMENT=production` or `APP_ENV=production` is set for production functions
- `ALLOWED_ORIGINS` is set to the production app origin
- `OPENAI_API_KEY` exists
- `SUPABASE_SERVICE_ROLE_KEY` exists

Confirm in Vercel:

- build command is `npm run build`
- output directory is `dist`
- `VITE_SUPABASE_URL` exists
- `VITE_SUPABASE_PUBLISHABLE_KEY` exists
- security headers are present on the deployed site

### 3. Add small regression checks for the just-fixed paths

The recent fixes are important enough to deserve regression checks.

Suggested checks:

- Calendar Recent Months renders net-only wording or at least a helper test around monthly breakdown display copy.
- CSV content validation rejects renamed binary data.
- CSV content validation accepts normal CSV with headers.
- Debt/investment document validation rejects fake PDF/image content.
- `ai-coach` CORS helper returns config error in production when `ALLOWED_ORIGINS` is empty.
- `ai-coach` market price path uses usage enforcement before Yahoo fetch.

If a full test framework is too much, add focused `scripts/check-*.mjs` tests and wire them into `npm run check` carefully.

### 4. Make `UploadPageSafe.handleFiles()` more robust

Current code awaits content validation before Papa Parse, which is good. Remaining improvement:

```js
for (const file of selectedFiles) {
  const validation = await validateStatementCsvFileContent(file);
  ...
}
```

If `validateStatementCsvFileContent()` throws unexpectedly, the handler can reject and leave the UI in a reading state.

Fix:

- wrap content validation in try/catch
- set upload status to error for that file
- clear the input reliably in a `finally`
- keep parsing behaviour unchanged

Also remove the duplicate `title: Understanding ${file.name}` line in the upload status object inside `UploadPageSafe.jsx`.

### 5. Clean up old inactive code paths

`App.jsx` imports `UploadPageSafe`, not `UploadPage.jsx`. The old `src/pages/UploadPage.jsx` still contains older validation and import logic. It is inactive, but it confuses audits and future Codex runs.

Options:

- delete `src/pages/UploadPage.jsx`, or
- move it out of active source to something like `docs/archive-code/UploadPage-legacy.jsx.txt`, or
- leave it but add a strong comment at the top and exclude it from future searches/lint if appropriate.

Recommendation: delete it after confirming nothing imports it.

Also consider deleting or moving:

- `src/archive/App-STABLE.jsx`
- `src/archive/App-BEFORE-SUPER-BUNDLE.jsx`

They are useful history but contain stale patterns and make code search noisy.

### 6. Tighten HEIC/HEIF content sniffing

`src/lib/security.js` currently allows `heic` / `heif`, but the magic-byte check for those formats is weak:

```js
heic: [[0x00, 0x00, 0x00]],
heif: [[0x00, 0x00, 0x00]],
```

That can match non-HEIC binary files that start with null bytes.

Fix options:

- implement a real ISO BMFF `ftypheic` / `ftypheif` style check around bytes 4-12, or
- temporarily remove HEIC/HEIF support until robust validation is implemented.

For a finance app, prefer rejecting unclear files over accepting weakly validated ones.

### 7. Review `ai-coach` OpenAI key requirement for `market_price`

`ai-coach` checks `OPENAI_API_KEY` before the `market_price` branch, even though Yahoo price lookup does not use OpenAI.

This is not a security issue, but it creates an unnecessary coupling. If OpenAI is misconfigured, market price refresh fails even though it could work independently.

Optional improvement:

- move the `OPENAI_API_KEY` requirement below `market_price`, while keeping all auth/rate-limit checks before Yahoo fetch.

### 8. Server-side Coach context remains the long-term trust target

The current guarded snapshot flow is better than before, but Coach context is still built/saved by browser state.

Long-term ideal:

- client sends message only
- Edge Function validates JWT
- Edge Function loads user data server-side
- Edge Function builds/refetches context server-side
- client cannot be the source of truth for Coach financial context

Do not do this in a quick patch. Treat it as a planned architecture project.

### 9. Product-quality work for the “idiot-proof” goal

The app needs to show uncertainty clearly.

High-value product improvements:

- add confidence labels to major numbers
- make `Review` / `Checks` the core loop
- add “wrong? fix it” controls beside important insights
- add “safe to spend today” as a plain, confidence-labelled answer
- add a demo/sandbox account with fake data
- add more real-world anonymised CSV fixtures

## Bank feed readiness

`docs/BANK_FEED_GOCARDLESS_PLAN.md` is the right plan. Do not implement it until the app is stable after the hardening pass and docs are clean.

When bank feed work starts:

- keep GoCardless secrets server-side only
- add provider account mapping tables first
- add sync run audit table
- keep CSV upload as free fallback
- bank feed should be Premium
- do not silently duplicate CSV history when a bank connection first syncs
- always show last synced time and consent expiry

## Manual smoke test checklist after the next patch

Use a test account and fake/non-sensitive data.

### Upload

- valid CSV imports
- renamed binary `.csv` rejects before Papa Parse
- `13/02/2026` imports
- `01/02/2026` rejects as ambiguous
- duplicate file or duplicate rows warn correctly

### Calendar

- bottom Recent Months shows only month net
- no `In` / `Out` appears in the bottom Recent Months rows
- selected day panel can still show day-level in/out if desired

### Documents

- real PDF receipt/debt/investment document accepts
- fake PDF/image rejects
- image resize/compression still works

### AI

- Coach works after fresh import
- stale snapshot guard still works
- `market_price` works only while signed in
- `market_price` does not work from unauthenticated request

### Production

- Vercel site loads with CSP enabled
- Supabase auth still works
- Supabase Edge Function calls still work
- receipts/documents signed URLs still render

## Suggested next Codex prompt

```text
Read docs/CODEX_CONTEXT.md, docs/CODEX_DEEP_AUDIT_2026-05-03_AFTER_HARDENING.md, and docs/CODEX_NEXT_PASS_PROMPT.md.

Do the next cleanup/audit pass from the deep audit: update stale docs, add small regression checks where practical, harden UploadPageSafe validation error handling, remove or clearly archive the inactive old UploadPage, review HEIC/HEIF sniffing, and keep changes focused. Do not start GoCardless implementation yet. Run npm run check and report any Supabase deployment or migration step needed.
```
