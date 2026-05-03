# Security fix notes - 2026-05-03

This note records the security and production-readiness work completed during the May 2026 audit cycle.

For current Codex context and the latest pending work, read:

- `docs/CODEX_CONTEXT.md`

## Current quality gate

Run:

```powershell
cd C:\Users\User\Desktop\budget-builder
git pull origin main
npm run check
```

`npm run check` runs lint, money-understanding checks, organiser intelligence checks and build.

GitHub Actions CI now exists at `.github/workflows/check.yml` and runs `npm ci` plus `npm run check` on pushes and PRs.

## Completed work

### User scoping and RLS defence in depth

Most user-owned reads in `App.jsx` now explicitly filter by user ID on top of Supabase RLS. Preserve those filters.

### CSV dates and duplicates

`UploadPageSafe.jsx` now normalises statement dates before preview/save.

- Ambiguous numeric dates such as `01/02/2026` are rejected.
- Unambiguous UK dates such as `13/02/2026` are accepted.
- ISO dates are accepted.
- Saved transaction dates use ISO `YYYY-MM-DD` only.

Duplicate keys now use account ID, ISO date, rounded pence amount and normalised description tokens.

### File validation helpers

`src/lib/security.js` includes:

- `validateSensitiveFileContent(file, options)`
- `validateStatementCsvFileContent(file, options)`

`ReceiptsPage.jsx` uses content sniffing for receipt uploads.

Pending: `UploadPageSafe.jsx`, `DebtsPage.jsx` and `InvestmentsPage.jsx` still need to be wired to the content-sniffing helpers. See `docs/CODEX_CONTEXT.md`.

### Privacy consent persistence

`AuthPage.jsx` stores privacy/AI consent metadata in Supabase auth metadata and the `profiles` table.

Stored fields:

- `privacy_policy_version`
- `privacy_policy_accepted_at`
- `ai_processing_acknowledged_at`

Migration support exists in `202605030001_privacy_and_deletion_audit.sql`.

### AI cost and latency

`money-organiser` builds deterministic transaction intelligence before calling OpenAI. It sends grouped/capped context instead of every raw row.

Relevant files:

- `supabase/functions/money-organiser/index.ts`
- `supabase/functions/_shared/moneyOrganiserIntelligence.js`
- `scripts/check-money-organiser-intelligence.mjs`

### Destructive action auditability

`SettingsPage.jsx` logs deletion metadata for:

- full data wipe
- selected month deletion

The intended lifecycle is:

1. insert `started`
2. update to `completed` with operational counts, or `failed` with `error_code` and partial counts

Migration support:

- `202605030001_privacy_and_deletion_audit.sql` adds `data_deletion_events`.
- `202605030002_deletion_audit_status.sql` adds `status` and `error_code`.
- `202605030003_deletion_audit_update_policy.sql` allows users to update their own audit rows.

Audit rows must store operational metadata only, not deleted financial details.

### GitHub Actions CI

`.github/workflows/check.yml` has been added.

## Current high-priority pending work

The following items remain open and should be handled by Codex/local editor because the relevant files are large and the GitHub connector has truncated them previously.

1. `supabase/functions/ai-coach/index.ts`
   - Make CORS fail closed in production when `ALLOWED_ORIGINS` is missing.
   - Require auth and rate limiting for `mode === "market_price"` before Yahoo Finance fetch.

2. `src/pages/UploadPageSafe.jsx`
   - Replace old synchronous CSV validation with `await validateStatementCsvFileContent(file)` before `Papa.parse(file, ...)`.
   - Scope `accounts.last_imported_at` update by both account ID and user ID.

3. `src/pages/DebtsPage.jsx` and `src/pages/InvestmentsPage.jsx`
   - Use `validateSensitiveFileContent()` on document selection and immediately before upload.

4. `src/pages/InvestmentsPage.jsx`
   - Scope live price row update by both investment ID and user ID.

5. `src/App.jsx`
   - Wire `useViewport()` into App only. Do not refactor data loaders in the same patch.

6. `src/pages/CoachPage.jsx` and any autosend/draft owner
   - Use sessionStorage rather than localStorage for Coach draft/autosend state.

## Later maintainability work

These should be separate tasks after the security blockers are closed.

- Extract `useMoneyHubData(userId)` from `App.jsx`.
- Extract Coach snapshot handling into a hook or move context generation server-side.
- Remove/archival-review old `UploadPage.jsx` after `UploadPageSafe` is fully hardened.
- Replace `CoachPageGuarded` monkey-patching with a cleaner send function or server-side freshness check.
- Add anonymised real CSV fixtures for organiser/import regression tests.

## Manual test checklist

Use a test account.

### Auth and privacy

- Create a new account.
- Confirm a `profiles` row exists.
- Confirm privacy/AI consent fields are populated.

### CSV import

- Upload a normal CSV.
- Upload `13/02/2026`, confirm it imports.
- Upload `01/02/2026`, confirm it rejects as ambiguous.
- Upload the same file twice, confirm duplicate handling works.
- After content sniffing is wired, upload a renamed binary as `.csv`, confirm it rejects.

### Documents

- Upload a real PDF receipt.
- Upload a fake PDF/image renamed to an allowed extension, confirm rejection.
- Repeat for debt and investment documents after those pages are patched.

### Coach and AI

- Import transactions and immediately ask Coach, confirm stale snapshot guard behaves correctly.
- Ask compact lookup and hard-truth prompts.
- Confirm `swift-worker`, `money-organiser`, and `ai-coach` still work after deployments.
- Confirm market price requires auth after patch.

### Deletion audit

- Delete a selected month.
- Confirm a `data_deletion_events` row moves from `started` to `completed`.
- Full wipe a test account and confirm audit rows contain only operational metadata.
