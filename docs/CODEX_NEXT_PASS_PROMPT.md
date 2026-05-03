# Next Codex pass prompt

Use this file as the working brief for the next Codex run.

## Start instruction

Read these first:

1. `docs/CODEX_CONTEXT.md`
2. `docs/BANK_FEED_GOCARDLESS_PLAN.md`
3. this file

## Current status

The previous high-priority hardening pass was completed on 2026-05-03 in commit `6f10eb8` and pushed to `main`.

Completed in that pass:

- Calendar bottom `Recent Months` / `This Month` section now shows month net only.
- `ai-coach` CORS now fails closed in production when `ALLOWED_ORIGINS` is missing.
- `ai-coach` `market_price` now requires auth and is rate-limited before Yahoo Finance is called.
- `UploadPageSafe.jsx` now validates real CSV content before parsing.
- Debt and investment document uploads now use content sniffing on selection and before upload.
- Investment live price writes and account import timestamp writes now include explicit user scoping.
- `App.jsx` now uses `useViewport()`.
- Coach draft/autosend one-shot handoff now uses `sessionStorage`.
- `vercel.json` already existed with baseline security headers.
- `npm run check` passed.
- Supabase `ai-coach` function was deployed.

## Non-negotiables

- This is a finance app. Data safety, clear wording, and defence in depth matter more than speed.
- Do not commit secrets, `.env`, `.env.local`, `node_modules`, `dist`, `.git`, real financial data, Supabase access tokens, service-role keys, OpenAI keys, or GoCardless secrets.
- Do not remove existing explicit `.eq("user_id", ...)` read filters in user-owned Supabase queries.
- Keep manual CSV upload as the free/manual fallback.
- Run `npm run check` before finishing.

## Useful next work

Do not redo the completed hardening pass unless a new bug is found.

Good next candidates:

1. Decide whether to archive/delete the old unused `src/pages/UploadPage.jsx` after confirming `App.jsx` only imports `UploadPageSafe`.
2. Continue the App maintainability split by extracting `useMoneyHubData(userId)` from `App.jsx`.
3. Later extract `useCoachSnapshot()` from `App.jsx`.
4. If the user asks for live bank feeds, implement from `docs/BANK_FEED_GOCARDLESS_PLAN.md` and keep GoCardless secrets server-side only.

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
