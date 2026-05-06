# Codex context for Budget Builder / Money Hub

Last updated: 2026-05-06

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

### Page-native first-run guidance

Status: completed on 2026-05-05.

Current behaviour:

- The old full-screen onboarding modal has been removed.
- `src/components/PageGuide.jsx` shows a compact, page-specific guide inside each page the first time a signed-in user opens it.
- The guide is user-scoped and page-scoped through `src/components/onboarding/onboardingState.js`.
- Settings can replay all page guides.
- Guidance should stay action-led: first payoff, three steps, one primary action. Avoid reintroducing a blocking global onboarding tour.

### Coach brain number discipline

Status: completed on 2026-05-04.

Relevant files:

- `src/lib/appMoneyModel.js`
- `src/lib/coachContext.js`
- `supabase/functions/ai-coach/index.ts`
- `docs/COACH_BRAIN_NUMBERS_AND_TRENDS.md`

Current behaviour:

- Coach is not the primary bank-statement parser.
- `appMoneyModel` builds `cleanMonthlyFacts`, exposed to Coach as `clean_monthly_facts`.
- Clean facts include latest full month, previous full month, recent monthly average, worst recent month, trend direction, worsening/improving categories, risky accelerating categories, budget sanity flags, uncertainty flags, capped monthly rows and raw all-history totals with a warning.
- Internal transfers, savings/investment movements, pass-through/work money, shared bill contributions, refunds and reimbursements are excluded from clean spending/income before Coach sees the context.
- Raw statement outgoings can set `budget_sanity.raw_outgoings_likely_inflated`, telling Coach to use clean spending estimates and ask for Review checks instead of shaming the user on raw movement.
- Review/Coach confirmation options now include shared rent/bill contribution, friend/family, work/pass-through, refund/reimbursement, own transfer and ignore-from-budget answers.
- `ai-coach` prompt rules forbid comparing all-history totals to monthly income and require timeframe-labelled figures.

Preserve this flow:

```text
CSV or bank feed -> import parser -> money understanding / statement intelligence -> app money model -> compact Coach context -> AI Coach advice
```

### Calendar clean-money source of truth

Status: completed on 2026-05-05.

Relevant files:

- `src/pages/CalendarPage.jsx`
- `src/lib/calendarMoneyPresentation.js`
- `src/lib/appMoneyModel.js`

Current behaviour:

- Calendar is a simple bills-and-monthly-pressure screen: header, next-bill hero, compact upcoming bills, one quick read, and recent months.
- Calendar monthly reads use `appMoneyModel.cleanMonthlyFacts.monthly_rows` first.
- `getMonthlyBreakdown()` remains a raw reference fallback only. It must not drive personal monthly budget conclusions.
- Recent Months labels each row as `Personal net estimate`, `Needs checking`, or `Raw bank movement`.
- Clean month rows carry review flags for shared money, likely transfers, raw movement inflation, refunds/reimbursements, partial months, and impossible-looking personal results.
- Shared rent/bill contributions are excluded from income by contribution source and contribution key, so older repeated housemate payments do not become fake income.
- If shared rent timing is unclear, Calendar shows `Needs checking` instead of a confident impossible deficit or fake surplus.
- Upcoming bills show the user's share where confirmed shared money exists, with total bill shown only as secondary context.

### Review skip semantics

Status: completed on 2026-05-05 and tightened on 2026-05-06.

Relevant files:

- `src/lib/reviewDismissals.js`
- `src/lib/reviewOptions.js`
- `src/lib/reviewQueue.js`
- `src/pages/ConfidencePage.jsx`
- `src/pages/CoachPage.jsx`
- `src/lib/appMoneyModel.js`
- `src/lib/moneyUnderstanding.js`

Current behaviour:

- `Skip this` means the user does not want that exact Review item counted as pending.
- Skips are stored locally and as a non-financial `transaction_rules` row with `rule_type = confidence_check_skipped`.
- A skipped check should disappear from Review and should not keep Home, Calendar, Goals, Coach or page guides saying there are checks waiting.
- Skipping does not teach a spending/income classification. If the user wants the money treatment changed, they should pick a Review option.
- Review options now include plain-language answers for normal purchase, one-off payment, own transfer, and irrelevant/exclude.
- `src/lib/reviewQueue.js` is the shared visible Review queue. Home, Calendar, Goals, More/page guides and Review should use this same queue/count so Coach-generated checks and deterministic checks do not disagree.

### Work/pass-through money guardrails

Status: tightened on 2026-05-06 after a live account audit.

Current behaviour:

- Known work/pass-through merchants such as Mynextbike/Proovia must not be inferred as personal income or shared rent/bill contributions.
- Coach quick prompts should use clean flexible-spending categories and must not suggest cutting pass-through, refunds, transfers, income, bills, debt, investing, savings or shared-money categories.
- Goals should show `Needs checking` for everyday spending while Review checks, raw movement inflation, shared/pass-through uncertainty, or needs-checking monthly rows remain.

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

Status: completed in commit `6f10eb8`, with a follow-up hardening pass on 2026-05-05.

File: `supabase/functions/ai-coach/index.ts`

Original problem:

Before commit `6f10eb8`, `buildCorsHeaders()` allowed any origin when `ALLOWED_ORIGINS` was empty.

Current behaviour:

- Uses the same fail-closed production pattern as `money-organiser` and `swift-worker`.
- Includes helpers like `isProductionRuntime()`, `isLocalOrigin()`, and explicit CORS error codes.
- If `ENVIRONMENT`, `DENO_ENV`, or `APP_ENV` is `production` or `prod`, and `ALLOWED_ORIGINS` is empty, it returns 500 before OPTIONS handling.
- Includes header `X-CORS-Config-Error: missing_allowed_origins`.
- If a browser origin is not allowed, it now returns `origin_not_allowed` instead of silently falling back to the first configured origin.
- The Budget Builder Vercel project aliases are accepted by pattern, but custom domains must still be added to `ALLOWED_ORIGINS`.
- In non-production, if `ALLOWED_ORIGINS` is empty, it allows local origins only.
- `CoachPage.jsx` keeps the pending blue user message while the request is in flight, then saves the user and assistant messages only after `ai-coach` succeeds. Failed sends restore the draft without leaving duplicate saved user bubbles.
- `ai-coach` validates saved Coach snapshot shape, null-guards compact clean-money fields, and trims prompt context if a snapshot gets too large.

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

- Superseded by the 2026-05-05 Calendar clean-money simplification above.
- Calendar no longer uses raw `In` / `Out` monthly summaries for the main monthly read.

## Medium-priority maintainability work

These are important but should not be mixed into the same large security patch unless very small.

### `App.jsx` is too large

`App.jsx` still owns auth/session, routing, data loading, viewport state, Money Hub model construction, Coach context construction, Coach snapshot saving, navigation helpers and AI refresh flow.

`src/hooks/useViewport.js` exists and is now wired into `App.jsx`.

`src/hooks/useMoneyHubData.js` now owns user-owned Supabase data state, loaders, and refresh orchestration.

`src/hooks/useCoachSnapshot.js` now owns browser-side Coach context construction, snapshot hashing, and saving to `coach_context_snapshots`. `App.jsx` keeps auth/session setup, routing, page composition, and shared money model construction.

`ai-coach` was redeployed after the market-price/OpenAI-key cleanup.

Recommended order:

1. keep page composition in `App.jsx`
2. later move Coach context generation server-side as a separate architecture project

Do not combine the larger data-loader extraction with production hardening unless specifically asked.

### Coach context is still browser-generated

`App.jsx` still saves `coach_context_snapshots` from browser state. `CoachPageGuarded.jsx` helps reduce stale snapshot use, but a stronger long-term architecture is server-side Coach context construction.

This should be a later project. Do not work around it by dumping more raw transactions into `ai-coach`; keep improving the deterministic money model and compact context.

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

- Confirm the page shows a simple header, next-bill hero, Upcoming Bills, What Stands Out, and Recent Months.
- Confirm Recent Months rows are labelled `Personal net estimate`, `Needs checking`, or `Raw bank movement`.
- Confirm no `In` / `Out` copy appears in Recent Months.
- Confirm shared rent/bill contributions show as reduced user share, with gross total only as secondary context.
- Confirm cross-month or uncertain shared money shows `Needs checking` and points to Review.

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
