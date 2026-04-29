# Money Hub Coding Guide

This repo has been refactored to keep future work cheap and focused. Start here before opening broad files.

## Fast Orientation

- `src/App.jsx` is the app shell only: auth/session, Supabase data loading, derived shared data, page routing, and prop wiring.
- Page UI lives in `src/pages/*Page.jsx`.
- Shared visual primitives live in `src/components/ui.jsx`.
- Shared inline styles live in `src/styles.js`.
- Responsive/status visual helpers live in `src/lib/styleHelpers.js`.

## Where To Go First

- Home/dashboard UX: `src/pages/TodayPage.jsx`, then `src/lib/dashboardIntelligence.js`.
- Statement upload/import accuracy: `src/pages/UploadPage.jsx`, `src/lib/importAnalysis.js`, `src/lib/finance.js`.
- Account detection/intelligence: `src/pages/AccountsPage.jsx`, `src/lib/statementIntelligence.js`.
- AI coach context/data visibility: `src/pages/CoachPage.jsx`, `src/lib/coachContext.js`.
- Goals: `src/pages/GoalsPage.jsx`.
- Receipts: `src/pages/ReceiptsPage.jsx`.
- Debts: `src/pages/DebtsPage.jsx`, `src/lib/statementSignals.js`, `src/lib/dashboardIntelligence.js`.
- Investments: `src/pages/InvestmentsPage.jsx`, `src/lib/statementSignals.js`, `src/lib/dashboardIntelligence.js`.
- Calendar: `src/pages/CalendarPage.jsx`, `src/lib/calendarIntelligence.js`.
- Settings/viewer mode: `src/pages/SettingsPage.jsx`.

## Token-Saving Rules

- Do not read all of `src/App.jsx` unless changing app shell behaviour.
- Use `docs/maintainer-map.md` for the wider file map.
- Prefer targeted searches over opening large files.
- Keep new logic out of `App.jsx`; put it in the relevant page or `src/lib/*`.
- When changing calculations used by multiple pages, update the relevant `src/lib/*` helper first.
- When changing AI advice quality, update `src/lib/coachContext.js` before changing chat UI.

## Verification

Run `npm run check` before committing or pushing.

The Vite bundle-size warning is currently expected. Lint/build passing is the gate.

## Current Direction

The app should feel like a smart bank app: concise first, detailed on demand. Avoid showing calculation caveats repeatedly in the UI; keep the maths correct in helpers and expose plain-language reads to users.
