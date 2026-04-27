# Production Readiness Notes

## Supabase

- Edge functions used by the app:
  - `ai-coach`
  - `swift-worker`
- Both functions need `OPENAI_API_KEY` set in Supabase function secrets.
- The app uploads documents and receipts to the `receipts` storage bucket.
- The app reads and writes these tables from the browser:
  - `accounts`
  - `transactions`
  - `statement_imports`
  - `money_goals`
  - `receipts`
  - `ai_messages`
  - `debts`
  - `investments`
  - `viewer_access`
  - `financial_documents`

## Vercel

- Build command: `npm run build`
- Output directory: `dist`
- No local `.env` or `vercel.json` file is required for the current browser bundle because the Supabase URL and publishable key are currently committed in `src/supabase.js`.

## Pre-Deploy Checks

Run these before pushing production-facing changes:

```bash
npm run lint
npm run build
```

## Known Follow-Up

- `src/App.jsx` is still the main bundle driver and should keep being split into smaller page files.
- Vite warns that the main JavaScript chunk is over 500 KB. Code-splitting pages will address this.
