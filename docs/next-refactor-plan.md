# Next Refactor Plan

Purpose: keep `src/App.jsx` shrinking in safe, deployable slices while improving the app experience.

## Current State

- `GoalsPage` now lives in `src/pages/GoalsPage.jsx`.
- Shared UI primitives live in `src/components/ui.jsx`.
- Goal suggestions live in `src/lib/goalInsights.js`.
- Upload guidance lives in `src/lib/uploadGuidance.js`.
- Old app snapshots are archived in `src/archive/`.
- Supabase temp files are no longer tracked.

## Resume Here

1. Extract shared finance/date helpers from `App.jsx`.
   - Start with `formatCurrency`, `numberOrNull`, `parseAppDate`, `toIsoDate`, `startOfDay`, `startOfMonth`, `isTransactionInMonth`, `isInternalTransferLike`.
   - Put them under `src/lib/financeHelpers.js` or split into `dateHelpers.js` and `moneyHelpers.js` if it stays clean.

2. Remove the `helpers` prop from `GoalsPage`.
   - Import the helper functions directly into the page once they live in `src/lib`.

3. Extract `UploadPage`.
   - Move CSV import helpers with it.
   - Keep the Supabase calls in the page for now.
   - Preserve the new upload guidance UX and AI action.

4. Extract one page at a time after that.
   - Best order: `ReceiptsPage`, `CoachPage`, `DebtsPage`, `InvestmentsPage`, `CalendarPage`, then `TodayPage`.

5. Keep each slice shippable.
   - Run `npm run check`.
   - Commit and push after each clean extraction.

## Product Priorities After Structure

- Make onboarding feel guided: first statement, three-month history, then optional extra accounts.
- Make AI useful in-context: every page should have one clear "ask AI about this" action with good context.
- Tighten production setup: verify Supabase secrets, storage bucket policy, edge function deployment, and Vercel build settings.
- Then consider bigger features: smarter duplicate handling, better account linking, richer coach memory, and later Open Banking.
