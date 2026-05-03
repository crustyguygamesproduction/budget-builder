# Codex Notes

These notes document the recent safety fixes made through ChatGPT so Codex or a future maintainer can quickly understand the context before continuing work.

## Recent commits

- `0805cd8b66726fd1ce708aec99a73223068a4277` - Scoped client Supabase reads in `src/App.jsx` to the signed-in user.
- `44802fd0838583c3933fdf2a6e2ab79fa13ebfa9` - Added `src/pages/UploadPageSafe.jsx`, a hardened CSV import page.
- `a445c6b35aac971f6f703f29d9b5e355b3f1dfd5` - Switched `src/App.jsx` to load `UploadPageSafe` for the Upload tab.

## What changed

### 1. Client Supabase reads now have explicit user scoping

`src/App.jsx` now requires a signed-in user ID before loading app data. User-owned reads include `.eq("user_id", scopedUserId)` as a defence-in-depth layer on top of Supabase RLS.

Covered loaders include:

- `transactions`
- `accounts`
- `money_goals`
- `receipts`
- `ai_messages`
- `debts`
- `investments`
- `statement_imports`
- `viewer_access`
- `financial_documents`
- `subscription_profiles`
- `bank_connections`
- `transaction_rules`
- `money_understanding_snapshots`

`resetUserData()` was added so local sensitive state is cleared when there is no signed-in user.

### 2. CSV import date handling is now strict

`src/pages/UploadPageSafe.jsx` normalises statement dates before preview and before saving.

Accepted date shapes:

- ISO: `YYYY-MM-DD`
- unambiguous UK numeric: `DD/MM/YYYY` or `DD-MM-YYYY`
- text month: `DD Mon YYYY`
- text month leading: `Mon DD YYYY`

Ambiguous numeric dates such as `01/02/2026` are rejected instead of guessed. This is intentional because UK bank CSVs can otherwise be misread as US dates and corrupt calendars, trends, duplicate checks, AI summaries and monthly deletion.

Saved `transaction_date` values should now be ISO `YYYY-MM-DD` only.

### 3. Duplicate detection is stronger

`UploadPageSafe.jsx` builds transaction duplicate keys from:

- account ID
- ISO-normalised date
- amount rounded to pence
- cleaned/normalised description tokens

It also calculates near-duplicate warnings against existing transactions using ISO date, pence amount and cleaned description. These warnings are shown in the Upload preview so likely repeated rows are visible before saving.

## Important implementation note

The original `src/pages/UploadPage.jsx` was left in place as a fallback/reference. The app currently imports:

```js
const UploadPage = lazy(() => import("./pages/UploadPageSafe"));
```

Future cleanup can either:

1. keep `UploadPageSafe.jsx` as the production upload page, or
2. merge the safe logic back into `UploadPage.jsx` after running local checks.

## Local check commands

Run this after pulling new commits:

```bash
cd ~/budget-builder
git checkout main
git pull origin main
npm install
npm run check
```

For repeat checks after dependencies are already installed:

```bash
cd ~/budget-builder
git pull origin main
npm run check
```

## Suggested follow-up checks for Codex

- Run `npm run check` locally.
- Verify `UploadPageSafe.jsx` compiles with the project style objects currently available in `src/styles`.
- Upload a small CSV with ISO dates and confirm rows preview and save.
- Upload a small CSV with UK dates like `13/02/2026` and confirm they save as `2026-02-13`.
- Upload a CSV with ambiguous dates like `01/02/2026` and confirm the preview rejects it.
- Re-upload similar rows and confirm duplicate/near-duplicate warnings behave as expected.
- Consider merging `UploadPageSafe.jsx` back into `UploadPage.jsx` once verified, to avoid maintaining two upload pages.
