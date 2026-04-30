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

## Pre-Deploy Checks

Run these before pushing production-facing changes:

```bash
npm run lint
npm run build
```

## Known Follow-Up

- `src/App.jsx` is still the main bundle driver and should keep being split into smaller page files.
- Vite warns that the main JavaScript chunk is over 500 KB. Code-splitting pages will address this.
- Confirm Supabase Auth email settings, password policy, and allowed redirect URLs before public launch.
- Apply `20260430_live_readiness.sql` before enabling paid mode or bank feed UI for real users.
