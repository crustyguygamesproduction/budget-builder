# Codex context for Budget Builder / Money Hub

Last updated: 2026-05-03

This file is intended to give Codex enough context to work safely on the project without needing the chat history.

## Project summary

Budget Builder / Money Hub is a Vite React app backed by Supabase. It imports UK bank statement CSVs, normalises transactions, detects bills/subscriptions/transfers, stores receipts/documents, and uses Supabase Edge Functions plus OpenAI for Coach and organiser features.

This is a finance app, so security and data correctness matter more than speed of change.

## Current quality gate

Run this after any change:

```powershell
cd C:\Users\User\Desktop\budget-builder
npm run check
```

`npm run check` currently runs:

```text
npm run lint && npm run test:money && npm run test:organiser && npm run build
```

GitHub Actions CI exists at `.github/workflows/check.yml` and runs `npm ci` plus `npm run check` on pushes and PRs.

## Current database state and migrations

Supabase migrations have been pushed after the migration version cleanup. Migration filenames have unique versions now.

Important recent migrations:

- `202605030001_privacy_and_deletion_audit.sql`
  - adds `profiles`
  - stores privacy/AI consent metadata
  - adds `data_deletion_events`
  - adds RLS
- `202605030002_deletion_audit_status.sql`
  - adds `status` and `error_code` to `data_deletion_events`
- `202605030003_deletion_audit_update_policy.sql`
  - allows users to update their own deletion audit rows, so audit events can move from `started` to `completed` or `failed`

If new migrations are added, run:

```powershell
cd C:\Users\User\Desktop\budget-builder
npx supabase db push
```

Do not run destructive Supabase commands without asking the user.

## Important safety improvements already made

### User scoping

Most user-owned reads in `App.jsx` now explicitly filter by user ID on top of RLS. Preserve this.

Do not remove `.eq("user_id", scopedUserId)` or equivalent filters from user-owned data loads.

### CSV date handling

`UploadPageSafe.jsx` now normalises statement dates before preview/save.

It rejects ambiguous numeric dates such as `01/02/2026`, accepts ISO dates, accepts unambiguous UK dates like `13/02/2026`, and saves ISO `YYYY-MM-DD` only.

Preserve this behaviour.

### Duplicate detection

CSV row duplicate keys are built from:

- account ID
- ISO date
- rounded pence amount
- normalised description tokens

Preserve the existing hardened duplicate behaviour.

### Privacy consent

`AuthPage.jsx` persists privacy/AI consent metadata using auth metadata and the `profiles` table.

Stored fields:

- `privacy_policy_version`
- `privacy_policy_accepted_at`
- `ai_processing_acknowledged_at`

### Money organiser

`money-organiser` now uses deterministic transaction intelligence instead of sending every raw row to AI.

Relevant files:

- `supabase/functions/money-organiser/index.ts`
- `supabase/functions/_shared/moneyOrganiserIntelligence.js`
- `scripts/check-money-organiser-intelligence.mjs`

The organiser sends grouped/capped context to AI, including category totals, merchant totals, recurring candidates, annual/rare candidates, split-payment candidates, suspicious groups, large outgoing samples and representative raw samples.

### Deletion audit

`SettingsPage.jsx` logs destructive actions to `data_deletion_events`.

The intended lifecycle is:

1. insert `started`
2. update to `completed` with counts, or `failed` with partial counts and `error_code`

The update policy migration now exists.

### Receipts

`ReceiptsPage.jsx` validates sensitive file content using magic-byte/content sniffing, not just extension/MIME.

## Remaining high-priority production hardening work

These are the main tasks Codex should do next.

### 1. Harden `ai-coach` CORS

File: `supabase/functions/ai-coach/index.ts`

Problem:

`buildCorsHeaders()` still allows any origin when `ALLOWED_ORIGINS` is empty.

Required behaviour:

- Use the same fail-closed production pattern as `money-organiser` and `swift-worker`.
- Add helpers like `isProductionRuntime()`, `isLocalOrigin()`, and `hasCorsConfigError()`.
- If `ENVIRONMENT`, `DENO_ENV`, or `APP_ENV` is `production` or `prod`, and `ALLOWED_ORIGINS` is empty, return 500 before OPTIONS handling.
- Include header `X-CORS-Config-Error: missing_allowed_origins`.
- In non-production, if `ALLOWED_ORIGINS` is empty, allow local origins only.
- Do not break local development.

### 2. Require auth and rate limiting for `ai-coach` market price mode

File: `supabase/functions/ai-coach/index.ts`

Problem:

`mode === "market_price"` can currently fetch Yahoo Finance before auth/rate-limit checks.

Required behaviour:

- Require a valid authenticated user before fetching the quote.
- Add `enforceAiUsage()` for `market_price`.
- Suggested limits:
  - 60 requests per hour
  - 200 requests per day
- Keep the existing response shape.

### 3. Wire CSV content sniffing into upload

File: `src/pages/UploadPageSafe.jsx`

Problem:

`validateStatementCsvFileContent()` exists in `src/lib/security.js`, but the upload flow still calls the older synchronous `validateStatementCsvFile()` before `Papa.parse()`.

Required behaviour:

- Import `validateStatementCsvFileContent`.
- Validate file content before `Papa.parse(file, ...)`.
- Make the file handler async-safe.
- Preserve date normalisation, duplicate detection, AI mapping fallback, preview UI and save behaviour.
- Keep messages user-friendly.
- Scope account `last_imported_at` update by both account ID and user ID.

### 4. Use content sniffing for debt and investment document uploads

Files:

- `src/pages/DebtsPage.jsx`
- `src/pages/InvestmentsPage.jsx`

Problem:

These pages still use extension/MIME validation through `validateSensitiveFile()`.

Required behaviour:

- Use `validateSensitiveFileContent()` on selection and immediately before upload.
- Preserve current UX and error handling.

### 5. Add explicit user scoping to remaining sensitive writes

Known examples:

- `InvestmentsPage.jsx` live price update should update by `.eq("id", investment.id).eq("user_id", user.id)`.
- `UploadPageSafe.jsx` account `last_imported_at` update should include `.eq("user_id", user.id)`.

Add similar low-risk user scoping where the signed-in user ID is available and the write is user-owned.

## Medium-priority maintainability work

These are important but should not be mixed into the same large security patch unless very small.

### `App.jsx` is too large

`App.jsx` still owns auth/session, routing, data loading, viewport state, Money Hub model construction, Coach context construction, Coach snapshot saving, navigation helpers and AI refresh flow.

`src/hooks/useViewport.js` exists. The low-risk next step is to wire it into `App.jsx` only.

Recommended order:

1. wire `useViewport()` into `App.jsx`
2. extract `useMoneyHubData(userId)`
3. extract `useCoachSnapshot()`
4. keep page composition in `App.jsx`

Do not combine the larger data-loader extraction with production hardening unless specifically asked.

### Coach context is still browser-generated

`App.jsx` still saves `coach_context_snapshots` from browser state. `CoachPageGuarded.jsx` helps reduce stale snapshot use, but a stronger long-term architecture is server-side Coach context construction.

This should be a later project.

### `CoachPageGuarded` monkey-patches Supabase invoke

`CoachPageGuarded.jsx` wraps `supabase.functions.invoke` while Coach is mounted. It works, but it is brittle.

Later improvement: move freshness enforcement into `ai-coach` or pass a guarded send function instead of monkey-patching globally.

### Old `UploadPage.jsx`

`App.jsx` uses `UploadPageSafe`, not old `UploadPage.jsx`. The old file remains and can confuse audits.

After `UploadPageSafe` hardening is complete, either archive or delete old `UploadPage.jsx` if it is confirmed unused.

## Privacy note

`CoachPage.jsx` stores draft text using localStorage. For privacy on shared computers, switch Coach draft/autosend state to sessionStorage only.

Do not change unrelated localStorage keys unless asked.

## Manual test checklist

Use a test account.

### Auth and privacy

- Create a new account.
- Confirm a `profiles` row is created.
- Confirm `privacy_policy_version`, `privacy_policy_accepted_at`, and `ai_processing_acknowledged_at` are filled.

### CSV import

- Upload a normal CSV.
- Upload a CSV with `13/02/2026`, confirm it imports.
- Upload a CSV with `01/02/2026`, confirm it rejects as ambiguous.
- Upload the same file twice, confirm duplicate handling works.
- Upload a renamed binary as `.csv`, confirm it is rejected after content sniffing is wired.

### Receipts and documents

- Upload a real PDF receipt.
- Upload a fake PDF renamed from another file, confirm it is rejected.
- Upload debt/investment documents after switching those pages to content sniffing.

### Coach

- Import transactions and immediately ask Coach.
- Confirm it waits for a fresh snapshot.
- Ask a compact lookup like `how much did I spend on Tesco?`.
- Ask a hard-truth prompt.
- Confirm no stale/empty answer.

### Deletion audit

- Delete a selected month.
- Confirm a `data_deletion_events` row moves from `started` to `completed`.
- Full wipe a test account.
- Confirm audit counts are operational metadata only and do not store deleted financial details.

### AI functions

- Confirm `swift-worker` works for CSV mapping.
- Confirm `money-organiser` creates/updates `money_understanding_snapshots`.
- Confirm `ai-coach` works after CORS/auth fixes.
- Confirm `market_price` requires auth after patch.

## Codex finish criteria

Before finishing a task, Codex should report:

- files changed
- behaviour changed
- checks run
- whether `npm run check` passed
- whether any Supabase migration needs to be pushed
- anything intentionally left for later
