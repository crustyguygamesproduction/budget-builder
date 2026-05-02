create table if not exists public.coach_context_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null default 'client_interpreted_money_layer',
  context jsonb not null default '{}'::jsonb,
  context_hash text,
  transaction_count integer not null default 0,
  latest_transaction_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists coach_context_snapshots_user_id_key
  on public.coach_context_snapshots(user_id);

create index if not exists coach_context_snapshots_user_updated_idx
  on public.coach_context_snapshots(user_id, updated_at desc);

alter table public.coach_context_snapshots enable row level security;

drop policy if exists "Users can read own coach context snapshots" on public.coach_context_snapshots;
create policy "Users can read own coach context snapshots"
  on public.coach_context_snapshots
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own coach context snapshots" on public.coach_context_snapshots;
create policy "Users can insert own coach context snapshots"
  on public.coach_context_snapshots
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own coach context snapshots" on public.coach_context_snapshots;
create policy "Users can update own coach context snapshots"
  on public.coach_context_snapshots
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own coach context snapshots" on public.coach_context_snapshots;
create policy "Users can delete own coach context snapshots"
  on public.coach_context_snapshots
  for delete
  using (auth.uid() = user_id);
