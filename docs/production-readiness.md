# Production Readiness Notes

## Supabase

- Edge functions used by the app:
  - `ai-coach`
  - `money-organiser`
  - `swift-worker`
- These functions need `OPENAI_API_KEY` set in Supabase function secrets where they call OpenAI.
- AI usage controls require `SUPABASE_SERVICE_ROLE_KEY` server-side in Edge Function secrets. Never expose it to the browser or Vercel client env vars.
- The app uploads documents and receipts to the `receipts` storage bucket.
- The app reads and writes these user-owned tables from the browser under RLS:
  - `accounts`
  - `transactions`
  - `statement_imports`
  - `money_understanding_snapshots`
  - `coach_context_snapshots`
  - `money_goals`
  - `receipts`
  - `ai_messages`
  - `debts`
  - `investments`
  - `viewer_access`
  - `financial_documents`
  - `profiles`
  - `subscription_profiles`
  - `bank_connections`
  - `bank_connection_accounts`
  - `bank_sync_runs`
  - `transaction_rules`
- Edge Functions write server-side operational tables such as:
  - `ai_usage_events`
- `ai-coach` consumes compact saved Coach snapshots. After changing `supabase/functions/ai-coach/index.ts`, redeploy it with:

```bash
npx supabase functions deploy ai-coach --project-ref itayxahonejogrnkhllp
```

## Vercel

- Build command: `npm run build`
- Output directory: `dist`
- Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in Vercel project settings. `.env.example` documents the required names.
- `vercel.json` now adds baseline security headers: CSP, frame blocking, referrer policy, content-type sniff protection, and a restrictive permissions policy.

## Paid Mode

- `subscription_profiles` stores the user-facing plan and Stripe identifiers.
- Browser users may create their own default `free` profile only.
- Paid status updates should be written from a Stripe webhook or trusted Supabase Edge Function using the service role key.
- Premium positioning:
  - Free: manual uploads, basic Today page, basic categories, limited AI checks.
  - Premium: live UK bank feeds, smarter AI context, debt payoff tracking, investment tracking, forecast calendar, subscription leak checks, and viewer mode.

## Live Bank Feeds

- Start with GoCardless Bank Account Data for UK account-information sync because it is the strongest low-cost fit for early AIS usage.
- Keep Plaid, TrueLayer, and Yapily as fallbacks if coverage, support, or commercial terms become better for production volumes.
- Store provider tokens only in a trusted backend or Supabase Edge Function secret store. The browser should only see connection status, institution labels, consent expiry, and sync timestamps.
- `bank_connections` is prepared for provider status, institution metadata, consent expiry, and last sync.
- `bank_connection_accounts` and `bank_sync_runs` are prepared for provider account mapping and sync audit history. No GoCardless API calls or UI connection flow are implemented yet.
- A future `bank-sync` Edge Function should:
  - create provider requisitions/link URLs,
  - exchange consent callbacks,
  - refresh balances and transactions,
  - map imported transactions through the same helpers used by CSV upload,
  - log sync failures to `security_events` or a dedicated sync log.

## Security

- `20260430_live_readiness.sql` enables row-level security on the core user-owned tables when they exist and recreates own-row select/insert/update/delete policies.
- Subscription and bank connection writes are intentionally backend-owned. Do not update paid status or provider connection state directly from the browser.
- The Supabase publishable key is safe to ship only when RLS policies are correct. Never expose service-role keys in Vite, Vercel client env vars, or browser code.
- Keep document and receipt storage buckets private unless each object path is protected by user-specific storage policies.
- Treat AI context as sensitive financial data. Edge functions should avoid logging full transaction payloads in production.
- Coach context should stay compact. The pre-Coach layers should calculate clean monthly facts, transfer/pass-through exclusions, trend direction and uncertainty flags before the Edge Function calls OpenAI.
- Do not solve Coach accuracy by sending all raw transaction history to OpenAI. Use `clean_monthly_facts`, `query_focus`, capped examples and Review checks.
- `20260430_secure_upload_storage.sql` makes the `receipts` storage bucket private, adds user-path storage policies, and adds `file_path` columns so new uploads use short-lived signed links instead of public URLs.
- New client uploads validate file type and size before parsing or storage. CSV statements are capped separately from receipt/document images and PDFs.
- CSV, receipt, debt and investment uploads use content sniffing, not only filename or browser MIME type. HEIC/HEIF uploads require a real compatible `ftyp` brand.
- Phone-camera images are resized client-side to a maximum 1600px edge and converted to WebP before upload when that reduces file size.
- Existing public `file_url` rows should be migrated or re-uploaded before launch if the bucket was public while testing.
- Keep signed document links short-lived. The browser should not store permanent public URLs for receipts, debts, investments, statements, or bank-feed exports.
- `src/pages/PrivacyPage.jsx` explains financial data use, AI context, private storage, and user control in product language.
- Supabase Edge Functions support `ALLOWED_ORIGINS` for tighter CORS. Set it to the production and preview app origins before public launch.

## Bundle Size

- Page modules are lazy-loaded from `src/App.jsx` so the first load no longer pulls every feature page into the main JavaScript chunk.
- Keep future page-specific libraries inside their page modules so Vite can split them out.

## Pre-Deploy Checks

Run these before pushing production-facing changes:

```bash
npm run check
```

## Known Follow-Up

- `src/App.jsx` is still the main bundle driver and should keep being split into smaller page files.
- Vite warns that the main JavaScript chunk is over 500 KB. Code-splitting pages will address this.
- Confirm Supabase Auth email settings, password policy, and allowed redirect URLs before public launch.
- Apply `20260430_live_readiness.sql` before enabling paid mode or bank feed UI for real users.
- A larger future architecture improvement is server-side Coach snapshot construction. The current production path is browser-built snapshots with deterministic clean-money facts and server-side prompt compaction.
