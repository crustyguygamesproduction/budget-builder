create table if not exists public.subscription_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan text not null default 'free',
  status text not null default 'free',
  stripe_customer_id text,
  stripe_subscription_id text,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create table if not exists public.bank_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'gocardless_bank_account_data',
  status text not null default 'pending',
  institution_id text,
  institution_name text,
  account_count integer not null default 0,
  consent_expires_at timestamptz,
  last_synced_at timestamptz,
  provider_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.security_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  severity text not null default 'info',
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.subscription_profiles enable row level security;
alter table public.bank_connections enable row level security;
alter table public.security_events enable row level security;

drop policy if exists "subscription_profiles_select_own" on public.subscription_profiles;
create policy "subscription_profiles_select_own"
  on public.subscription_profiles
  for select
  using (auth.uid() = user_id);

drop policy if exists "subscription_profiles_insert_own" on public.subscription_profiles;
create policy "subscription_profiles_insert_own"
  on public.subscription_profiles
  for insert
  with check (auth.uid() = user_id and plan = 'free' and status = 'free');

drop policy if exists "subscription_profiles_update_service_only" on public.subscription_profiles;
create policy "subscription_profiles_update_service_only"
  on public.subscription_profiles
  for update
  using (false)
  with check (false);

drop policy if exists "bank_connections_select_own" on public.bank_connections;
create policy "bank_connections_select_own"
  on public.bank_connections
  for select
  using (auth.uid() = user_id);

drop policy if exists "bank_connections_write_service_only" on public.bank_connections;
create policy "bank_connections_write_service_only"
  on public.bank_connections
  for all
  using (false)
  with check (false);

drop policy if exists "security_events_insert_own" on public.security_events;
create policy "security_events_insert_own"
  on public.security_events
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "security_events_select_own" on public.security_events;
create policy "security_events_select_own"
  on public.security_events
  for select
  using (auth.uid() = user_id);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'accounts',
    'transactions',
    'statement_imports',
    'money_goals',
    'receipts',
    'ai_messages',
    'debts',
    'investments'
  ]
  loop
    if to_regclass('public.' || table_name) is not null then
      execute format('alter table public.%I enable row level security', table_name);

      execute format('drop policy if exists %I on public.%I', table_name || '_select_own', table_name);
      execute format(
        'create policy %I on public.%I for select using (auth.uid() = user_id)',
        table_name || '_select_own',
        table_name
      );

      execute format('drop policy if exists %I on public.%I', table_name || '_insert_own', table_name);
      execute format(
        'create policy %I on public.%I for insert with check (auth.uid() = user_id)',
        table_name || '_insert_own',
        table_name
      );

      execute format('drop policy if exists %I on public.%I', table_name || '_update_own', table_name);
      execute format(
        'create policy %I on public.%I for update using (auth.uid() = user_id) with check (auth.uid() = user_id)',
        table_name || '_update_own',
        table_name
      );

      execute format('drop policy if exists %I on public.%I', table_name || '_delete_own', table_name);
      execute format(
        'create policy %I on public.%I for delete using (auth.uid() = user_id)',
        table_name || '_delete_own',
        table_name
      );
    end if;
  end loop;
end $$;

create index if not exists subscription_profiles_user_id_idx on public.subscription_profiles (user_id);
create index if not exists bank_connections_user_id_idx on public.bank_connections (user_id);
create index if not exists bank_connections_provider_status_idx on public.bank_connections (provider, status);
create index if not exists security_events_user_created_idx on public.security_events (user_id, created_at desc);
