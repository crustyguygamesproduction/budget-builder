create table if not exists money_understanding_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_hash text not null,
  model_version text not null default 'money-understanding-v1',
  interpreted_at timestamptz not null default now(),
  transaction_count integer not null default 0,
  latest_transaction_date date,
  summary jsonb not null default '{}'::jsonb,
  transactions jsonb not null default '[]'::jsonb,
  bill_streams jsonb not null default '[]'::jsonb,
  recurring_events jsonb not null default '[]'::jsonb,
  checks jsonb not null default '[]'::jsonb,
  ai_context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, source_hash, model_version)
);

alter table money_understanding_snapshots enable row level security;

drop policy if exists "Users can read their own money understanding snapshots" on money_understanding_snapshots;
create policy "Users can read their own money understanding snapshots"
  on money_understanding_snapshots
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own money understanding snapshots" on money_understanding_snapshots;
create policy "Users can insert their own money understanding snapshots"
  on money_understanding_snapshots
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own money understanding snapshots" on money_understanding_snapshots;
create policy "Users can update their own money understanding snapshots"
  on money_understanding_snapshots
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists money_understanding_snapshots_user_latest_idx
  on money_understanding_snapshots (user_id, interpreted_at desc);

create index if not exists money_understanding_snapshots_user_model_idx
  on money_understanding_snapshots (user_id, model_version);
