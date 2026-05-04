# Codex Next Pass Prompt

Last updated: 2026-05-04

## Current State

Money Hub now has a compact pre-Coach money brain:

- `src/lib/moneyUnderstanding.js` interprets transactions, bills, checks and AI organiser snapshots.
- `src/lib/appMoneyModel.js` builds user-share bills, real income, real spending, safe saving reads and `cleanMonthlyFacts`.
- `src/lib/coachContext.js` passes `clean_monthly_facts` into the saved Coach snapshot.
- `supabase/functions/ai-coach/index.ts` consumes compact facts and is instructed not to parse raw statement history or compare all-history totals to monthly income.

Read `docs/COACH_BRAIN_NUMBERS_AND_TRENDS.md` before changing Coach maths.

## Guardrails

- Keep Coach blunt, informal and useful.
- Brutality must be based on clean timeframe-labelled numbers.
- Do not treat internal transfers, savings/investment movement, shared money, refunds, reimbursements or pass-through money as real spending/income.
- Preserve exact lookup behaviour through `query_focus`.
- Keep Coach prompts token-efficient. Normal advice should use compact facts, not raw history.
- Run `npm run check`.

## Good Next Work

- Move Coach snapshot construction server-side when the product is ready for that larger architecture change.
- Improve Review so each answer can show richer one-tap explanations and examples.
- Add bank-feed provider sync without changing the clean-money hierarchy.
