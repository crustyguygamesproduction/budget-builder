# Deep Audit After Hardening

Last updated: 2026-05-04

The original after-hardening audit details have been folded into `docs/CODEX_CONTEXT.md`. This file exists so future Codex passes that are told to read the old audit path do not hit a missing document.

## Current High-Priority Notes

- CORS hardening is complete for the Supabase Edge Functions.
- User-owned reads and sensitive writes should stay explicitly scoped by `user_id` as well as protected by RLS.
- CSV uploads use content sniffing, date normalisation and duplicate detection.
- Receipt and document uploads use content sniffing.
- Coach must use the deterministic money brain rather than parsing raw bank statements.
- `clean_monthly_facts` is now the source of truth for monthly coaching numbers, trends and raw-vs-clean sanity flags.
- Server-side Coach snapshot generation is still a larger future architecture improvement.

Run `npm run check` before finishing production-facing work.
