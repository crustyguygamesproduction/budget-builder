# Codex Next Pass Prompt

Last updated: 2026-05-05

## Current State

Money Hub now has a compact pre-Coach money brain:

- `src/lib/moneyUnderstanding.js` interprets transactions, bills, checks and AI organiser snapshots.
- `src/lib/appMoneyModel.js` builds user-share bills, real income, real spending, safe saving reads and `cleanMonthlyFacts`.
- `src/lib/coachContext.js` passes `clean_monthly_facts` into the saved Coach snapshot.
- `supabase/functions/ai-coach/index.ts` consumes compact facts and is instructed not to parse raw statement history or compare all-history totals to monthly income.
- `ai-coach` fail-closes CORS with explicit safe error codes, accepts the Budget Builder Vercel project aliases, validates saved snapshot shape, and trims oversized prompt context.
- `CoachPage.jsx` saves chat messages only after the Edge Function succeeds. Keep that flow so failed sends do not create duplicate blue user messages.
- The old global onboarding modal is gone. `src/components/PageGuide.jsx` now shows compact first-run guidance inside each page, with page-scoped localStorage completion and replay from Settings.

Read `docs/COACH_BRAIN_NUMBERS_AND_TRENDS.md` before changing Coach maths.

## Guardrails

- Keep Coach blunt, informal and useful.
- Brutality must be based on clean timeframe-labelled numbers.
- Do not treat internal transfers, savings/investment movement, shared money, refunds, reimbursements or pass-through money as real spending/income.
- Preserve exact lookup behaviour through `query_focus`.
- Keep Coach prompts token-efficient. Normal advice should use compact facts, not raw history.
- Keep page guides action-led and low-friction: first payoff, three steps, one useful action. Do not reintroduce a blocking global onboarding modal.
- If Coach send failures return, check function deployment, `OPENAI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ALLOWED_ORIGINS`, and `ENVIRONMENT` / `APP_ENV` before changing money maths.
- Run `npm run check`.

## Good Next Work

- Move Coach snapshot construction server-side when the product is ready for that larger architecture change.
- Improve Review so each answer can show richer one-tap explanations and examples.
- Add bank-feed provider sync without changing the clean-money hierarchy.
