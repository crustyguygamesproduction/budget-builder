# Next Refactor Plan

Purpose: keep `src/App.jsx` shrinking in safe, deployable slices while improving the app experience.

## Current State

- `GoalsPage` now lives in `src/pages/GoalsPage.jsx`.
- Shared UI primitives live in `src/components/ui.jsx`.
- Goal suggestions live in `src/lib/goalInsights.js`.
- Upload guidance lives in `src/lib/uploadGuidance.js`.
- User-owned Supabase data loading lives in `src/hooks/useMoneyHubData.js`.
- Browser-side Coach snapshot construction/saving lives in `src/hooks/useCoachSnapshot.js`.
- The active upload page is `src/pages/UploadPageSafe.jsx`; the older inactive `src/pages/UploadPage.jsx` has been removed.
- Old app snapshots are archived in `src/archive/`.
- Supabase temp files are no longer tracked.

## Resume Here

1. Continue tightening `UploadPageSafe` only when upload behaviour changes.
   - Keep CSV import helpers close to the page unless they become shared.
   - Preserve content sniffing, date normalisation, duplicate detection, upload guidance UX and AI mapping fallback.

2. Extract one page at a time after that.
   - Best order: `ReceiptsPage`, `CoachPage`, `DebtsPage`, `InvestmentsPage`, `CalendarPage`, then `TodayPage`.

3. Keep each slice shippable.
   - Run `npm run check`.
   - Commit and push after each clean extraction.

## Product Priorities After Structure

- Make onboarding feel guided: first statement, three-month history, then optional extra accounts.
- Make AI useful in-context: every page should have one clear "ask AI about this" action with good context.
- Tighten production setup: verify Supabase secrets, storage bucket policy, edge function deployment, and Vercel build settings.
- Then consider bigger features: smarter duplicate handling, better account linking, richer coach memory, and later Open Banking.
