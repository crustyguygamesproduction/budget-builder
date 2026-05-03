# Security fix notes - 2026-05-03

This note records the latest safety fixes made after the audit, plus remaining checks for Codex.

## Commits in this batch

- `e8012ba8575ac5f4f97cc7986df6775baf8fb5f8` - Added upload content-sniffing helpers in `src/lib/security.js`.
- `63a92b2b49fac3b7fa986872ce022120ef99d366` - Updated `src/pages/ReceiptsPage.jsx` to validate PDF/image content before accepting and again before upload.
- `16355687b73988668f2be50918c1c7a36ebc5434` - Updated `src/pages/AuthPage.jsx` to persist privacy/AI consent on signup.
- `98b9772227d38f1481bc79d4454fe6a9720ae4ac` - Added migration for `profiles` and `data_deletion_events` with RLS.
- `2e282528e4640c6e64ffef4a57739a3cb3d06fbb` - Updated `src/pages/SettingsPage.jsx` to log destructive deletion events.

## 6. File validation

`src/lib/security.js` now includes:

- `validateSensitiveFileContent(file, options)`
- `validateStatementCsvFileContent(file, options)`

Sensitive uploads now sniff the first bytes of files rather than trusting extension/MIME only. Supported signatures include PDF, JPG/JPEG, PNG, WEBP and HEIC/HEIF-style `ftyphei*` containers.

CSV validation now reads the first chunk and rejects obvious binary files, empty files, files with null bytes/control-heavy content, or previews without readable delimiter/header-like text.

`ReceiptsPage.jsx` now uses `validateSensitiveFileContent()` on file selection and again immediately before upload. This reduces the chance of a renamed binary or non-image/non-PDF being stored.

Important follow-up: `UploadPageSafe.jsx` still calls the older synchronous `validateStatementCsvFile()` because that file is large and was not safely overwritten in this pass. Codex should wire `validateStatementCsvFileContent()` into `handleFiles()` before `Papa.parse(file, ...)` so CSVs are content-sniffed before parsing or AI column mapping.

## 7. Privacy consent persistence

`AuthPage.jsx` now stores consent metadata during signup in two places:

1. Supabase auth user metadata via `supabase.auth.signUp({ options: { data } })`.
2. The new `profiles` table via client-side upsert when a user ID is immediately available.

Stored fields:

- `privacy_policy_version`
- `privacy_policy_accepted_at`
- `ai_processing_acknowledged_at`

The migration also adds a trigger on `auth.users` so the `profiles` row is created from auth metadata when the user is inserted, which covers signups where confirmation flow means the client cannot immediately write the profile row.

## 8. AI cost and latency

Not fully implemented in this batch. Current `money-organiser` still sends raw rows up to the configured cap.

Recommended next Codex task:

- Add a deterministic pre-clustering step before the AI call in `supabase/functions/money-organiser/index.ts`.
- Group by normalised merchant/counterparty, amount bucket, day-of-month pattern, category, direction and transfer/bill/subscription flags.
- Send the AI grouped recurring candidates, suspicious/uncertain groups, top category totals, large transaction samples and only a capped raw sample.
- Keep raw row IDs locally/server-side so AI results can still map back to transaction IDs.

This should reduce token cost and latency compared with sending up to 1,200 raw rows.

## 9. App orchestration

Not fully refactored in this batch. `App.jsx` still owns a lot of orchestration.

Recommended next Codex task:

- Extract data loaders into `src/hooks/useMoneyHubData.js`.
- Extract viewport state into `src/hooks/useViewport.js`.
- Extract Coach snapshot saving into `src/hooks/useCoachSnapshot.js`.
- Keep `App.jsx` responsible mainly for routing/page composition.

This should be done carefully because previous safety fixes in `App.jsx` added explicit user scoping and Coach snapshot writes that should not regress.

## 10. Destructive action auditability

The new migration adds `data_deletion_events` with RLS.

`SettingsPage.jsx` now logs deletion metadata after:

- full data wipe
- selected month deletion

The audit event stores operational metadata only:

- `user_id`
- `action_type`
- `selected_months`
- `counts`
- `created_at`

It does not store deleted transaction details or financial content.

## Local checks

Run:

```powershell
cd C:\Users\User\Desktop\budget-builder
git pull origin main
npm run check
```

Also apply the new Supabase migration before testing signup/deletion audit flows.
