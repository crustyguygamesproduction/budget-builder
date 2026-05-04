# Money Hub Maintainer Map

Use this first when making changes so future work does not start by rereading the whole app.

## App Shell

- `src/App.jsx` owns session loading, Supabase data loading, route/tab selection, and passing shared data into pages.
- `src/styles.js` owns the shared inline style dictionary.
- `src/lib/styleHelpers.js` owns responsive/status style helper functions.
- `src/components/ui.jsx` owns repeated small UI primitives: `Section`, `MiniCard`, `Row`, `InsightCard`, and `ActionCard`.
- `src/components/TopBar.jsx` and `src/components/BottomNav.jsx` own the app frame.
- `src/components/onboarding/*` owns the first-run guided setup flow, user-scoped onboarding memory, and setup replay.

## Pages

- `src/pages/HomePage.jsx` is the active home/dashboard experience and should stay focused on concise, bank-app-style money reads.
- `src/pages/UploadPageSafe.jsx` is the active CSV statement upload page. It owns account guessing, field mapping, content validation, import preview, and saving imported transactions.
- `src/pages/CoachPage.jsx` owns the AI chat UX and coach context handoff.
- `src/pages/GoalsPage.jsx` owns goals and goal-linked recommendations.
- `src/pages/ReceiptsPage.jsx` owns receipt upload, receipt/payment matching, and receipt AI extraction fallbacks.
- `src/pages/DebtsPage.jsx` owns debt records, debt document extraction, debt statement signals, and monthly debt status.
- `src/pages/InvestmentsPage.jsx` owns investment records, broker statement signals, investment document extraction, and price refreshes.
- `src/pages/CalendarPage.jsx` owns spending calendar, recurring event calendar, and calendar AI analysis.
- `src/pages/SettingsPage.jsx` owns viewer mode, viewer access, setup replay, full data reset, and selected-month deletion.
- `src/pages/AuthPage.jsx` owns login/signup.
- `src/pages/PrivacyPage.jsx` owns the human-readable privacy and data-use explanation for users.

## Money Logic

- `src/lib/finance.js` owns general money/date/transaction helpers. Put shared transaction classification and currency/date formatting here.
- `src/lib/moneyUnderstanding.js` owns the shared interpreted money layer: smart transactions, bills, recurring events, checks, summary, and AI context.
- `src/lib/appMoneyModel.js` owns page-friendly reads derived from `moneyUnderstanding`: Calendar bill totals, income, usual spending, safe saving amount, warnings, and next actions.
- `src/lib/appMoneyModel.js` also owns `cleanMonthlyFacts`, the compact monthly money brain Coach uses for latest full month, recent average, trend, worst month, raw-vs-clean sanity checks and uncertainty flags.
- `src/lib/statementIntelligence.js` owns statement-derived intelligence.
- `src/lib/coachContext.js` builds the AI coach context. If the coach needs better numbers, start in `appMoneyModel` or `statementIntelligence`, then pass compact facts here.
- `src/lib/importAnalysis.js` owns upload-specific import metadata: date ranges, duplicate fingerprints, overlap checks, and row confidence.
- `src/lib/uploadGuidance.js` owns upload guidance copy and next-best-upload recommendations.

## Change Order

1. For UX copy/layout, start in the relevant `src/pages/*Page.jsx` file.
2. For calculations shown in several places, start in `src/lib/finance.js` or `src/lib/statementIntelligence.js`.
3. For AI coach visibility, update `src/lib/coachContext.js` before changing the chat UI.
4. For upload/import behaviour, update `src/pages/UploadPageSafe.jsx`, `src/lib/security.js`, and `src/lib/importAnalysis.js`.
5. Keep `src/App.jsx` as orchestration only. Avoid adding page UI back into it.

## Current Guardrail

Run `npm run check` before pushing. The Vite bundle-size warning is currently expected; lint/build passing is the gate.
