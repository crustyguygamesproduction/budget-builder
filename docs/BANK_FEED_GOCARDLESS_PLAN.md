# GoCardless live bank feed plan

Last updated: 2026-05-03

This document prepares Money Hub / Budget Builder for a practical UK live bank feed integration.

## Provider decision

Use GoCardless Bank Account Data first.

The app already names this provider in `src/lib/bankFeeds.js`:

- provider key: `gocardless_bank_account_data`
- user-facing name: `GoCardless Bank Account Data`
- purpose: account information, balances, and transaction sync
- fallback providers: Plaid, TrueLayer, Yapily

Why this is the best first provider for this app:

- UK-first account-data use case.
- Good fit for a paid Premium feature.
- Supports account details, balances and transaction data.
- Bank consent/reconsent model fits the existing `bank_connections` table concept.
- Lets the product keep manual CSV upload as the free path and make live sync the Premium upgrade.

Important product wording:

- Do not call this a live bank account until the provider worker is built and deployed.
- Use wording like `Live bank feed is ready to connect` or `Bank sync is connected` only after the integration is real.
- Always explain that bank access expires and may need renewing.

## Current project state

Already present:

- `src/lib/bankFeeds.js` names GoCardless as the first provider and models ready/active/reconsent states.
- `public.bank_connections` exists from `20260430_live_readiness.sql`.
- `App.jsx` selects bank connections for the signed-in user.
- Premium copy already treats live bank feeds as a Premium feature.

Not yet built:

- bank institution picker
- provider redirect/link creation
- open-banking callback page
- provider account mapping
- transaction sync worker
- balance sync worker
- reconsent flow
- sync audit/event table
- duplicate merge between CSV transactions and bank feed transactions

## Architecture principle

The browser must never see GoCardless secrets.

All provider work should happen in Supabase Edge Functions using server-side secrets.

The client can ask to:

- list supported institutions
- create a connection link
- finalise a connection callback
- request a manual refresh
- disconnect a bank feed

The client must not receive or store:

- GoCardless secret ID
- GoCardless secret key
- access tokens
- refresh tokens
- raw provider credentials

## Required environment variables

Add to Supabase Edge Function secrets, not Vite client env:

```text
GOCARDLESS_SECRET_ID
GOCARDLESS_SECRET_KEY
GOCARDLESS_REDIRECT_URL
GOCARDLESS_WEBHOOK_SECRET optional if webhooks are used later
ENVIRONMENT=production
ALLOWED_ORIGINS=https://your-production-domain
```

Do not add these to `.env.local` unless only for local Supabase function testing, and never commit them.

## Recommended Edge Functions

### `bank-feed-institutions`

Returns supported institutions for a country, initially `GB`.

Request:

```json
{ "country": "GB" }
```

Response:

```json
{
  "provider": "gocardless_bank_account_data",
  "institutions": [
    { "id": "MONZO_MONZGB2L", "name": "Monzo", "logo": "..." }
  ]
}
```

### `bank-feed-create-link`

Validates the user, checks Premium access, creates/updates a `bank_connections` row with `pending` status, creates the GoCardless agreement/requisition, and returns the provider redirect link.

Request:

```json
{ "institution_id": "MONZO_MONZGB2L" }
```

Response:

```json
{
  "connection_id": "uuid",
  "link": "https://provider-auth-link",
  "expires_at": "..."
}
```

### `bank-feed-callback`

Called by the app after the provider redirects back. It should confirm requisition status with GoCardless, fetch linked account IDs, update `bank_connections`, and create account mapping rows.

Do not trust URL params alone. Confirm with the provider API.

### `bank-feed-sync`

Manual refresh first, scheduled refresh later.

It should fetch balances and transactions, upsert transactions into app tables, and record sync run metadata.

Sync windows:

- first sync: 90 to 180 days for beta
- later sync: last synced date minus a 7-day overlap window
- always allow overlap to catch pending-to-booked changes and bank corrections

### `bank-feed-disconnect`

Marks connection as disconnected/revoked and deletes provider requisition if supported. Do not delete imported transactions automatically.

## Recommended database changes

Add a migration for provider account mapping, sync runs, and provider transaction columns.

### `bank_connection_accounts`

```sql
create table if not exists public.bank_connection_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bank_connection_id uuid not null references public.bank_connections(id) on delete cascade,
  account_id uuid references public.accounts(id) on delete set null,
  provider text not null default 'gocardless_bank_account_data',
  provider_account_id text not null,
  display_name text,
  iban_last4 text,
  currency text,
  current_balance numeric,
  available_balance numeric,
  status text not null default 'active',
  last_synced_at timestamptz,
  provider_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_account_id)
);
```

### `bank_sync_runs`

```sql
create table if not exists public.bank_sync_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bank_connection_id uuid references public.bank_connections(id) on delete set null,
  run_type text not null default 'manual',
  status text not null default 'started',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  inserted_count integer not null default 0,
  updated_count integer not null default 0,
  skipped_count integer not null default 0,
  error_code text,
  error_message text,
  provider_metadata jsonb not null default '{}'::jsonb
);
```

RLS for provider tables should allow users to select their own rows. Writes should be service-only where practical.

### Transaction columns

```sql
alter table public.transactions
  add column if not exists source text not null default 'manual',
  add column if not exists provider text,
  add column if not exists provider_account_id text,
  add column if not exists provider_transaction_id text,
  add column if not exists booking_status text,
  add column if not exists bank_feed_synced_at timestamptz,
  add column if not exists raw_provider_payload jsonb;

create unique index if not exists transactions_provider_transaction_idx
  on public.transactions (user_id, provider, provider_account_id, provider_transaction_id)
  where provider_transaction_id is not null;
```

## Transaction normalisation rules

Map provider transactions into the existing transaction shape:

- `transaction_date`: prefer booked date; use value date only if booked date is missing
- `description`: combine remittance information, creditor/debtor name, and transaction info into a clean user-facing string
- `merchant`: best counterparty/merchant label
- `amount`: signed number in app convention, outgoings negative and income positive
- `direction`: `in` or `out`
- `category`: run through existing categorisation and transaction rules
- `is_internal_transfer`: run existing internal transfer logic
- `provider_transaction_id`: use provider transaction ID if available

Duplicate approach:

1. If provider transaction ID exists, use provider unique index.
2. If provider transaction ID is missing, use fallback key from user ID, provider account ID, booking date, pence amount and normalised description/counterparty.
3. For CSV overlap, show possible duplicates rather than silently deleting.

Important: do not duplicate months a user already uploaded by CSV before connecting a bank.

## Product flow

### Free user

Show manual CSV upload as free and live bank sync as Premium.

### Premium user, no connection

Flow:

1. Choose bank
2. Go to provider consent
3. Return to Money Hub
4. Show linked accounts
5. Run first sync
6. Review imported transactions and checks

### Active connection

Show:

- connected bank name
- linked account count
- last synced time
- latest transaction date
- consent expiry date
- refresh button
- disconnect button

### Consent expiring

Warn from 14 days before expiry.

## UX rules for idiot-proof budgeting

Live bank feeds must not make the app sound more certain than it is.

Always show:

- last synced time
- latest transaction date
- whether bank data is current or stale
- whether all linked accounts are syncing
- whether consent is close to expiry

Good copy:

```text
Updated 2 hours ago. Latest bank transaction: today.
```

Stale copy:

```text
Bank feed has not updated for 5 days. Today's safe-to-spend number may be wrong.
```

Never say:

```text
You definitely have £X safe to spend.
```

Prefer:

```text
Safe-to-spend estimate: £X, confidence good.
```

## Coach integration

Coach should know bank feed freshness.

Add to Coach context:

- active bank connection count
- last synced time
- latest transaction date from bank feed
- consent expiry warning
- sync error warning

Coach rules:

- If live feed is stale, say so before giving today-based advice.
- If no live feed exists, say advice is based on uploaded history.
- If bank sync exists but some accounts are failing, do not overstate confidence.

## Implementation order

Do not build bank feeds until the current high-priority production hardening in `docs/CODEX_CONTEXT.md` is completed.

Then implement in this order:

1. Add database migration for provider account mapping, sync runs, and transaction provider columns.
2. Add shared provider client in `supabase/functions/_shared/gocardlessBankData.ts`.
3. Add `bank-feed-institutions`.
4. Add `bank-feed-create-link`.
5. Add callback route/page and `bank-feed-callback`.
6. Add `bank-feed-sync` for manual sync.
7. Add Settings UI for connection status, refresh, reconsent and disconnect.
8. Add Home/Today freshness indicators.
9. Add Coach context freshness warnings.
10. Add scheduled sync only after manual sync is reliable.

## Codex instructions for bank feed work

When Codex starts this project:

- Read this file first.
- Read `docs/CODEX_CONTEXT.md` second.
- Do not expose secrets to the client.
- Keep all GoCardless calls inside Supabase Edge Functions.
- Use service role only inside functions after JWT validation.
- Preserve CSV upload as a free/manual fallback.
- Add tests for transaction normalisation and duplicate prevention.
- Run `npm run check` before finishing.
- Report any Supabase migration that must be pushed.
