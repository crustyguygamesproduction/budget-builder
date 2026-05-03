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
npm run lint && npm run test:money && npm run test:organiser && npm run test:security && npm run test:import && npm run build
```

GitHub Actions CI exists at `.github/workflows/check.yml` and runs `npm ci` plus `npm run check` on pushes and PRs.

## Current database state and migrations

Supabase migrations were pushed after the migration version cleanup. Migration filenames have unique versions now.

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
- `202605030004_bank_feed_groundwork.sql`
  - adds GoCardless-ready provider account mapping and sync run audit tables
  - adds provider transaction columns and a provider transaction unique index
  - does not add client secrets, provider API calls, or bank-feed UI
  - before relying on these tables remotely, run `npx supabase migration list` and confirm this migration is applied

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

Statement import fingerprints are content-based rather than filename-based, with legacy filename-based matching kept for old imports. Re-uploaded files with mostly matching rows are skipped so statements do not double-count.

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

## Live bank feed plan

A practical UK live bank feed integration plan now exists at:

- `docs/BANK_FEED_GOCARDLESS_PLAN.md`

Provider decision:

- Use GoCardless Bank Account Data first.
- Keep CSV uploads as the free/manual fallback.
- Treat live bank feeds as a Premium feature.
- Keep all GoCardless secrets and provider API calls inside Supabase Edge Functions.

The high-priority production hardening pass below was completed on 2026-05-03 in commit `6f10eb8`.

When bank feed work starts, Codex should read `docs/BANK_FEED_GOCARDLESS_PLAN.md` first.

## Recently completed high-priority hardening

These items were completed on 2026-05-03 and should not be treated as pending work unless a new audit finds a regression.

## Recently completed shared-rent fix

Status: completed after the shared rent audit. The one-off audit file was removed after its useful details were folded into this context.

Current behaviour:

- Recurring incoming person payments near rent/bills can be treated as shared bill contributions even when the statement text does not say rent.
- Confirmed shared rent/bill contribution rules are saved as `shared_bill_contribution` rules from Review.
- Possible shared contributions are excluded from normal income while waiting for Review, so shared-bill money is not treated as spendable income.
- Home and Calendar prefer the user's share where a matched contribution exists, while still showing gross bill context where useful.
- `monthlyBillTotal`, `monthlyBillBurdenTotal`, and `monthlyScheduledOutgoingsTotal` are user-share/burden values after shared contributions. Use `grossMonthlyBillTotal` only when the UI explicitly needs the full household bill amount for context.
- Regression coverage exists for half rent, person transfers without rent words, different payment days, variable top-ups, missing months, confirmed rules, and weak one-month Review candidates.

### 1. Harden `ai-coach` CORS

Status: completed in commit `6f10eb8`.

File: `supabase/functions/ai-coach/index.ts`

Original problem:

Before commit `6f10eb8`, `buildCorsHeaders()` allowed any origin when `ALLOWED_ORIGINS` was empty.

Current behaviour:

- Uses the same fail-closed production pattern as `money-organiser` and `swift-worker`.
- Includes helpers like `isProductionRuntime()`, `isLocalOrigin()`, and `hasCorsConfigError()`.
- If `ENVIRONMENT`, `DENO_ENV`, or `APP_ENV` is `production` or `prod`, and `ALLOWED_ORIGINS` is empty, it returns 500 before OPTIONS handling.
- Includes header `X-CORS-Config-Error: missing_allowed_origins`.
- In non-production, if `ALLOWED_ORIGINS` is empty, it allows local origins only.

### 2. Require auth and rate limiting for `ai-coach` market price mode

Status: completed in commit `6f10eb8`.

File: `supabase/functions/ai-coach/index.ts`

Original problem:

Before commit `6f10eb8`, `mode === "market_price"` could fetch Yahoo Finance before auth/rate-limit checks.

Current behaviour:

- Requires a valid authenticated user before fetching the quote.
- Calls `enforceAiUsage()` for `market_price`.
- Does not require `OPENAI_API_KEY` for Yahoo market price lookup.
- Limits:
  - 60 requests per hour
  - 200 requests per day
- Keep the existing response shape.

### 3. Wire CSV content sniffing into upload

Status: completed in commit `6f10eb8`.

File: `src/pages/UploadPageSafe.jsx`

Original problem:

Before commit `6f10eb8`, `validateStatementCsvFileContent()` existed in `src/lib/security.js`, but the upload flow still called the older synchronous `validateStatementCsvFile()` before `Papa.parse()`.

Current behaviour:

- Imports `validateStatementCsvFileContent`.
- Validates file content before `Papa.parse(file, ...)`.
- Handles unexpected validation errors with a friendly upload status and clears the file input in a `finally`.
- Preserves date normalisation, duplicate detection, AI mapping fallback, preview UI and save behaviour.
- Scopes account `last_imported_at` updates by both account ID and user ID.

### 4. Use content sniffing for debt and investment document uploads

Status: completed in commit `6f10eb8`.

Files:

- `src/pages/DebtsPage.jsx`
- `src/pages/InvestmentsPage.jsx`

Original problem:

Before commit `6f10eb8`, these pages still used extension/MIME validation through `validateSensitiveFile()`.

Current behaviour:

- Uses `validateSensitiveFileContent()` on selection and immediately before upload.
- Preserves current UX and error handling.

### 5. Add explicit user scoping to remaining sensitive writes

Status: completed in commit `6f10eb8`.

Current behaviour:

- `InvestmentsPage.jsx` live price updates use `.eq("id", investment.id).eq("user_id", user.id)`.
- `UploadPageSafe.jsx` account `last_imported_at` updates include `.eq("user_id", user.id)`.

### 6. Fix Calendar monthly income wording/calculation clarity

Status: completed in commit `6f10eb8` for the bottom `Recent Months` / `This Month` section by showing month net only.

Original user report:

The Calendar page Recent Months card shows `In` totals that appear wrong/confusing. Example screenshot showed April 2026 `In £2519.62`, March 2026 `In £5455.44`, etc. The user asked whether these are gross before bills/spending.

Relevant code:

- `src/lib/calendarIntelligence.js`
- `getMonthlyBreakdown()`
- `getMonthlyHistorySummary()`

Previous behaviour:

- `earned` sums all positive non-internal-transfer transactions.
- The UI labels that as `In`, which may include wages, reimbursements, refunds, transfers from other people, repayments, or pass-through money.

Current behaviour:

- The bottom `Recent Months` / `This Month` section shows month label, days used, and net only.
- It does not show gross `In` / `Out` copy in that bottom section.
- Day-level drilldowns can still show in/out because that is about a selected day, not a monthly income claim.

## Medium-priority maintainability work

These are important but should not be mixed into the same large security patch unless very small.

### `App.jsx` is too large

`App.jsx` still owns auth/session, routing, data loading, viewport state, Money Hub model construction, Coach context construction, Coach snapshot saving, navigation helpers and AI refresh flow.

`src/hooks/useViewport.js` exists and is now wired into `App.jsx`.

`src/hooks/useMoneyHubData.js` now owns user-owned Supabase data state, loaders, and refresh orchestration. `App.jsx` keeps auth/session setup, routing, page composition, shared money model construction, and Coach snapshot saving.

`ai-coach` was redeployed after the market-price/OpenAI-key cleanup.

Recommended order:

1. extract `useCoachSnapshot()`
2. keep page composition in `App.jsx`
3. later move Coach context generation server-side as a separate architecture project

Do not combine the larger data-loader extraction with production hardening unless specifically asked.

### Coach context is still browser-generated

`App.jsx` still saves `coach_context_snapshots` from browser state. `CoachPageGuarded.jsx` helps reduce stale snapshot use, but a stronger long-term architecture is server-side Coach context construction.

This should be a later project.

### `CoachPageGuarded` monkey-patches Supabase invoke

`CoachPageGuarded.jsx` wraps `supabase.functions.invoke` while Coach is mounted. It works, but it is brittle.

Later improvement: move freshness enforcement into `ai-coach` or pass a guarded send function instead of monkey-patching globally.

### Old `UploadPage.jsx`

`App.jsx` uses `UploadPageSafe`, not old `UploadPage.jsx`.

`src/pages/UploadPage.jsx` was confirmed unused and removed in the cleanup pass after commit `6f10eb8`.

## Privacy note

`CoachPage.jsx` and `App.jsx` now use sessionStorage for the one-shot Coach draft/autosend handoff.

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
- Upload a renamed binary as `.csv`, confirm it is rejected.

### Receipts and documents

- Upload a real PDF receipt.
- Upload a fake PDF renamed from another file, confirm it is rejected.
- Upload debt/investment documents and confirm fake renamed files are rejected.

### Coach

- Import transactions and immediately ask Coach.
- Confirm it waits for a fresh snapshot.
- Ask a compact lookup like `how much did I spend on Tesco?`.
- Ask a hard-truth prompt.
- Confirm no stale/empty answer.

### Calendar

- Confirm bottom Recent Months shows only month label, days used, and net.
- Confirm no `In` / `Out` copy appears in the bottom Recent Months rows.
- Confirm selected day drilldown still shows day-level transaction detail.

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
