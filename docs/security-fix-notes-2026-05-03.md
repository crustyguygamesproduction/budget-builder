# Security fix notes - 2026-05-03

This note records the latest safety fixes made after the audit, plus remaining checks for Codex.

## Commits in this batch

- `e8012ba8575ac5f4f97cc7986df6775baf8fb5f8` - Added upload content-sniffing helpers in `src/lib/security.js`.
- `63a92b2b49fac3b7fa986872ce022120ef99d366` - Updated `src/pages/ReceiptsPage.jsx` to validate PDF/image content before accepting and again before upload.
- `16355687b73988668f2be50918c1c7a36ebc5434` - Updated `src/pages/AuthPage.jsx` to persist privacy/AI consent on signup.
- `98b9772227d38f1481bc79d4454fe6a9720ae4ac` - Added migration for `profiles` and `data_deletion_events` with RLS.
- `2e282528e4640c6e64ffef4a57739a3cb3d06fbb` - Updated `src/pages/SettingsPage.jsx` to log destructive deletion events.
- `83bd4a1848f6c1d7c285b8b1d71e958d424fd35f` - Added `src/hooks/useViewport.js` as the first low-risk App orchestration extraction.
- `fa235c3773d2a9e3feee05acc5d7e969b2fbe6d6` - Updated `money-organiser` to send deterministic transaction intelligence to AI instead of every raw row.
- `29b3feb54a41cf580684d62e9ff60c23213cb8d1` - Added `status` and `error_code` fields to `data_deletion_events`.
- `2719a656470ce8f2483e602378ed0f4abc7ff377` - Updated `SettingsPage.jsx` to record deletion audit events as `started`, then `completed` or `failed`.

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

`money-organiser` now builds deterministic transaction intelligence before calling OpenAI.

The AI now receives grouped and capped context including:

- category totals
- merchant/counterparty totals
- recurring candidates
- suspicious or high-impact groups
- large outgoing samples
- a capped representative raw sample

Raw rows are still kept server-side for hashing and snapshot metadata, but the prompt no longer dumps every transaction row into the model. This should reduce token use and latency on larger accounts while preserving source transaction IDs in groups and samples.

Follow-up: test the organiser output against known statement sets to ensure recurring bill quality has not regressed.

## 9. App orchestration

`src/hooks/useViewport.js` has been added as the first low-risk extraction, but it has not yet been wired into `App.jsx` because `App.jsx` is large and currently contains critical user scoping plus Coach snapshot logic.

Recommended next Codex task:

- Replace `App.jsx` viewport state/effect with `useViewport()`.
- Then extract data loaders into `src/hooks/useMoneyHubData.js`.
- Then extract Coach snapshot saving into `src/hooks/useCoachSnapshot.js`.
- Keep `App.jsx` responsible mainly for routing/page composition.

Do this carefully because previous safety fixes in `App.jsx` added explicit user scoping and Coach snapshot writes that should not regress.

## 10. Destructive action auditability

The migrations add `data_deletion_events` with RLS and status fields.

`SettingsPage.jsx` now logs deletion metadata for:

- full data wipe
- selected month deletion

The lifecycle is now:

1. insert a `started` audit event before deletion begins
2. update it to `completed` with operational counts on success
3. update it to `failed` with `error_code` and partial counts on failure

The audit event stores operational metadata only:

- `user_id`
- `action_type`
- `selected_months`
- `counts`
- `status`
- `error_code`
- `created_at`

It does not store deleted transaction details or financial content.

## Remaining high-priority local patches

The GitHub connector repeatedly truncated these large files, so these should be done locally with Codex where the full files are available:

1. `supabase/functions/ai-coach/index.ts`
   - Apply the same fail-closed CORS helper used by `money-organiser` and `swift-worker`.
   - Production/prod with missing `ALLOWED_ORIGINS` should return 500 and `X-CORS-Config-Error: missing_allowed_origins`.

2. `src/pages/UploadPageSafe.jsx`
   - Replace `validateStatementCsvFile(file)` with `await validateStatementCsvFileContent(file)` before `Papa.parse(file, ...)`.
   - Keep the existing date normalisation and duplicate detection unchanged.

## Local checks

Run:

```powershell
cd C:\Users\User\Desktop\budget-builder
git pull origin main
npm run check
```

Also apply the new Supabase migrations before testing signup/deletion audit flows.
