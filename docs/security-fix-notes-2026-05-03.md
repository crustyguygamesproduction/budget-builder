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

`npm run check` runs lint, money-understanding checks, organiser intelligence checks, security validation checks, import duplicate checks and build.

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

Statement-level duplicate detection now uses a content fingerprint so renaming the same CSV does not make it look new. The app also skips uploads where most rows already match existing transactions.

### File validation helpers

`src/lib/security.js` includes:

- `validateSensitiveFileContent(file, options)`
- `validateStatementCsvFileContent(file, options)`

`ReceiptsPage.jsx`, `UploadPageSafe.jsx`, `DebtsPage.jsx` and `InvestmentsPage.jsx` use content sniffing for user uploads.

`src/lib/security.js` includes regression coverage through `scripts/check-security-validation.mjs`, including renamed binary CSV/PDF rejection and stricter HEIC/HEIF brand checks.

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

## Current production verification work

The previous high-priority hardening list was completed in commits `6f10eb8` and the follow-up cleanup pass. Do not treat those items as pending unless a new regression is found.

Remaining production readiness work is mostly manual verification:

- confirm Supabase Edge Function deployments and secrets in the dashboard
- confirm `ALLOWED_ORIGINS` is set for production and preview app origins
- confirm Vercel environment variables and security headers on the deployed site
- run smoke tests with a fake/test account

## Later maintainability work

These should be separate tasks after the security blockers are closed.

- Extract `useMoneyHubData(userId)` from `App.jsx`.
- Extract Coach snapshot handling into a hook or move context generation server-side.
- Continue shrinking `App.jsx` with `useMoneyHubData(userId)` and later `useCoachSnapshot()`.
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
- Upload a renamed binary as `.csv`, confirm it rejects.

### Documents

- Upload a real PDF receipt.
- Upload a fake PDF/image renamed to an allowed extension, confirm rejection.
- Repeat for debt and investment documents.

### Coach and AI

- Import transactions and immediately ask Coach, confirm stale snapshot guard behaves correctly.
- Ask compact lookup and hard-truth prompts.
- Confirm `swift-worker`, `money-organiser`, and `ai-coach` still work after deployments.
- Confirm market price requires auth after patch.

### Deletion audit

- Delete a selected month.
- Confirm a `data_deletion_events` row moves from `started` to `completed`.
- Full wipe a test account and confirm audit rows contain only operational metadata.
