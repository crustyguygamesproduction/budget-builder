# Next Codex pass prompt

Use this file as the working brief for the next Codex run.

## Start instruction

Read these first:

1. `docs/CODEX_CONTEXT.md`
2. `docs/BANK_FEED_GOCARDLESS_PLAN.md`
3. this file

Then complete the high-priority production hardening and UX correctness tasks below. Keep changes focused, avoid large architecture rewrites, and run `npm run check` before finishing.

## Non-negotiables

- This is a finance app. Data safety, clear wording, and defence in depth matter more than speed.
- Do not commit secrets, `.env`, `.env.local`, `node_modules`, `dist`, `.git`, real financial data, Supabase access tokens, service-role keys, OpenAI keys, or GoCardless secrets.
- Do not remove existing explicit `.eq("user_id", ...)` read filters in user-owned Supabase queries.
- Do not start building live bank feeds yet. Only keep the plan/docs ready. Current production hardening comes first.
- Keep manual CSV upload as the free/manual fallback.
- Run `npm run check` before finishing.

## Tasks to complete now

### 1. Fix Calendar Recent Months to show net only

User explicitly requested this.

File:

- `src/pages/CalendarPage.jsx`

Current problem:

The bottom `Recent Months` section shows `In`, `Out`, and then a green/red net number. The user wants this section to show only the month net number, whether up or down.

Required behaviour:

- In the bottom `Recent Months` / `This Month` section, remove the `In ... Out ...` copy entirely.
- Show the month label, days used, and the net only.
- The net is `month.net`, already calculated by `getMonthlyBreakdown()`.
- Keep plus sign and green colour for positive net.
- Keep minus sign and red colour for negative net.
- Example desired output:

```text
April 2026
Used on 27 days                    +£15.09

March 2026
Used on 28 days                    +£1588.89
```

Single-month desired copy:

```text
April 2026
Used on 27 days.
Month net: +£15.09
```

Do not change the top history summary cards unless needed. This task is specifically for the bottom Recent Months section.

### 2. Harden `ai-coach` CORS

File:

- `supabase/functions/ai-coach/index.ts`

Problem:

`buildCorsHeaders()` still allows any origin when `ALLOWED_ORIGINS` is empty.

Required behaviour:

- Copy/adapt the fail-closed production pattern from `money-organiser` and `swift-worker`.
- Add helpers such as `isProductionRuntime()`, `isLocalOrigin()`, and `hasCorsConfigError()`.
- If `ENVIRONMENT`, `DENO_ENV`, or `APP_ENV` is `production` or `prod`, and `ALLOWED_ORIGINS` is empty, return a 500 JSON error before handling OPTIONS.
- Include `X-CORS-Config-Error: missing_allowed_origins`.
- In non-production, if `ALLOWED_ORIGINS` is empty, allow local origins only.
- Do not break local development.

### 3. Require auth and rate limiting for `ai-coach` market price mode

File:

- `supabase/functions/ai-coach/index.ts`

Problem:

`mode === "market_price"` currently fetches Yahoo Finance before auth/rate-limit checks.

Required behaviour:

- Require a valid authenticated user before fetching the quote.
- Add `enforceAiUsage()` for `market_price`.
- Suggested limits:
  - 60 requests per hour
  - 200 requests per day
- Keep the existing response shape.

### 4. Wire CSV content sniffing into UploadPageSafe

Files:

- `src/pages/UploadPageSafe.jsx`
- `src/lib/security.js`

Problem:

`validateStatementCsvFileContent()` exists, but upload still calls the older synchronous `validateStatementCsvFile()` before `Papa.parse()`.

Required behaviour:

- Import `validateStatementCsvFileContent`.
- Validate file content before `Papa.parse(file, ...)`.
- Make the file handler async-safe.
- Preserve date normalisation, duplicate detection, AI mapping fallback, preview UI, and save behaviour.
- Keep user-facing errors friendly.
- Scope account `last_imported_at` update by both account ID and user ID.

### 5. Use content sniffing for debt and investment documents

Files:

- `src/pages/DebtsPage.jsx`
- `src/pages/InvestmentsPage.jsx`

Problem:

These pages still use extension/MIME validation through `validateSensitiveFile()`.

Required behaviour:

- Use `validateSensitiveFileContent()` on file selection.
- Revalidate with `validateSensitiveFileContent()` immediately before upload.
- Preserve current UX and error handling.

### 6. Add explicit user scoping to remaining sensitive writes

Known examples:

- `InvestmentsPage.jsx` live price update should update by `.eq("id", investment.id).eq("user_id", user.id)`.
- `UploadPageSafe.jsx` account `last_imported_at` update should include `.eq("user_id", user.id)`.

Add similar low-risk user scoping where the signed-in user ID is available and the row is user-owned.

### 7. Wire `useViewport()` into App.jsx

Files:

- `src/App.jsx`
- `src/hooks/useViewport.js`

Required behaviour:

- Replace local screen width / viewport height state and resize effect with `useViewport()`.
- Do not refactor data loaders or Coach snapshot logic in this pass.

### 8. Switch Coach draft/autosend storage to sessionStorage

Files likely involved:

- `src/pages/CoachPage.jsx`
- `src/App.jsx`

Required behaviour:

- Use `sessionStorage` for `COACH_DRAFT_KEY` and `COACH_AUTOSEND_KEY` only.
- Do not change unrelated localStorage keys.
- Handle storage unavailable cases safely.

### 9. Add `vercel.json` security headers if missing

Problem:

Docs previously claimed baseline Vercel security headers exist, but audit did not find `vercel.json`.

Required behaviour:

- If `vercel.json` is missing, add baseline headers for production:
  - `Content-Security-Policy`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy`
  - `Permissions-Policy`
  - frame protection using CSP `frame-ancestors 'none'`
- Ensure Vite/Supabase/OpenAI/Supabase function endpoints still work.
- Keep CSP practical rather than so strict it breaks the app.

### 10. Keep bank feed plan as docs only for now

Files:

- `docs/BANK_FEED_GOCARDLESS_PLAN.md`
- `src/lib/bankFeeds.js`

Required behaviour:

- Do not implement GoCardless yet.
- Do not add GoCardless secrets to client env.
- If touching bank feed docs, keep GoCardless Bank Account Data as the first planned provider.
- Bank feeds remain Premium; CSV remains free/manual fallback.

## Checks

Run:

```powershell
npm run check
```

If a migration is added, also report that the user needs to run:

```powershell
npx supabase db push
```

Do not run destructive Supabase commands.

## Finish report

At the end, report:

- files changed
- behaviour changed
- checks run
- whether `npm run check` passed
- whether a Supabase migration needs pushing
- anything intentionally left for later
