# Money Hub

AI-assisted budgeting app built with React, Vite, Supabase, and Vercel.

## Quick Start

```bash
npm install
npm run dev
```

## Check Before Push

```bash
npm run check
```

`npm run check` runs lint and production build. The current Vite bundle-size warning is expected.

## Architecture

- `src/App.jsx` is the shell: auth/session, Supabase loading, derived shared data, and page routing.
- `src/pages/*Page.jsx` contains page-level UI and workflows.
- `src/lib/finance.js` contains shared money/date/transaction helpers.
- `src/lib/dashboardIntelligence.js` contains home-page reads, freshness, summaries, transfer reads, and trend helpers.
- `src/lib/statementSignals.js` contains debt/investment signal detection and matching helpers.
- `src/lib/calendarIntelligence.js` contains calendar/rhythm/export helpers.
- `src/lib/importAnalysis.js` contains statement import date range, duplicate, overlap, and confidence helpers.
- `src/lib/coachContext.js` builds the AI coach data context.
- `src/styles.js` and `src/lib/styleHelpers.js` contain shared visual styling.

For the full working map, read `AGENTS.md` first, then `docs/maintainer-map.md`.
