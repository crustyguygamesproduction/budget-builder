# Codex Notes

These notes document the recent safety fixes made through ChatGPT so Codex or a future maintainer can quickly understand the context before continuing work.

## Recent commits

- `0805cd8b66726fd1ce708aec99a73223068a4277` - Scoped client Supabase reads in `src/App.jsx` to the signed-in user.
- `44802fd0838583c3933fdf2a6e2ab79fa13ebfa9` - Added `src/pages/UploadPageSafe.jsx`, a hardened CSV import page.
- `a445c6b35aac971f6f703f29d9b5e355b3f1dfd5` - Switched `src/App.jsx` to load `UploadPageSafe` for the Upload tab.
- `830f3795a31d68743f14675f27f910b70a91673a` - Added `src/pages/CoachPageGuarded.jsx` to block Coach sends until the saved Coach brain snapshot matches the currently loaded transactions.
- `d00bea636f087122a196990a6c5630081827e73e` - Switched `src/App.jsx` to load `CoachPageGuarded` for the Coach tab.

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

### 4. Coach sends are guarded against stale snapshots

`src/pages/CoachPageGuarded.jsx` wraps the existing `CoachPage.jsx` without removing its UI or correction logic.

The wrapper intercepts `supabase.functions.invoke("ai-coach", ...)` while the Coach page is mounted. Before the Edge Function can run, it checks the saved `coach_context_snapshots` row for the signed-in user.

A Coach send is allowed only when the saved snapshot matches the currently loaded transactions by:

- transaction count
- latest transaction date

If the snapshot is missing or stale, the guard retries briefly to allow the delayed `App.jsx` snapshot upsert to finish. If it still does not match, the send is blocked and the user sees a clear error instead of Coach answering with stale financial data.

This is still a client-side guard around the existing client-generated snapshot design. The best future version is to move Coach context construction fully server-side, but this commit closes the immediate race where a user imports data and asks Coach before the delayed snapshot save has caught up.

## Important implementation notes

The original `src/pages/UploadPage.jsx` was left in place as a fallback/reference. The app currently imports:

```js
const UploadPage = lazy(() => import("./pages/UploadPageSafe"));
```

The original `src/pages/CoachPage.jsx` was also left in place. The app currently imports:

```js
const CoachPage = lazy(() => import("./pages/CoachPageGuarded"));
```

Future cleanup can either:

1. keep the safe/guarded wrapper files as production pages, or
2. merge the safe logic back into the original page files after running local checks.

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
- Import data, immediately open Coach, and send a question before the delayed snapshot is ready. Expected result: send is blocked with a stale Coach brain message rather than answering from old data.
- Wait a moment after import and send the same Coach question again. Expected result: Coach sends once `coach_context_snapshots.context.transaction_count` and latest transaction date match the loaded transactions.
- Consider moving Coach context construction fully server-side so the browser never acts as the source of truth for AI context.
- Consider merging `UploadPageSafe.jsx` and `CoachPageGuarded.jsx` back into the original files once verified, to avoid maintaining parallel page files.
