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

create index if not exists bank_connection_accounts_user_id_idx
  on public.bank_connection_accounts (user_id);

create index if not exists bank_connection_accounts_connection_idx
  on public.bank_connection_accounts (bank_connection_id);

create index if not exists bank_sync_runs_user_started_idx
  on public.bank_sync_runs (user_id, started_at desc);

create index if not exists bank_sync_runs_connection_started_idx
  on public.bank_sync_runs (bank_connection_id, started_at desc);

alter table public.bank_connection_accounts enable row level security;
alter table public.bank_sync_runs enable row level security;

drop policy if exists "bank_connection_accounts_select_own" on public.bank_connection_accounts;
create policy "bank_connection_accounts_select_own"
  on public.bank_connection_accounts
  for select
  using (auth.uid() = user_id);

drop policy if exists "bank_connection_accounts_write_service_only" on public.bank_connection_accounts;
create policy "bank_connection_accounts_write_service_only"
  on public.bank_connection_accounts
  for all
  using (false)
  with check (false);

drop policy if exists "bank_sync_runs_select_own" on public.bank_sync_runs;
create policy "bank_sync_runs_select_own"
  on public.bank_sync_runs
  for select
  using (auth.uid() = user_id);

drop policy if exists "bank_sync_runs_write_service_only" on public.bank_sync_runs;
create policy "bank_sync_runs_write_service_only"
  on public.bank_sync_runs
  for all
  using (false)
  with check (false);
