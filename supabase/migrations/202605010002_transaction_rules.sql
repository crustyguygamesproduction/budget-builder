create table if not exists public.transaction_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  rule_type text not null default 'merchant_category',
  match_text text not null,
  match_amount numeric,
  category text not null,
  is_bill boolean not null default false,
  is_subscription boolean not null default false,
  is_internal_transfer boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, rule_type, match_text, match_amount)
);

alter table public.transaction_rules enable row level security;

drop policy if exists "Users can read their own transaction rules" on public.transaction_rules;

create policy "Users can read their own transaction rules"
  on public.transaction_rules
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can create their own transaction rules" on public.transaction_rules;

create policy "Users can create their own transaction rules"
  on public.transaction_rules
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own transaction rules" on public.transaction_rules;

create policy "Users can update their own transaction rules"
  on public.transaction_rules
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own transaction rules" on public.transaction_rules;

create policy "Users can delete their own transaction rules"
  on public.transaction_rules
  for delete
  using (auth.uid() = user_id);

create index if not exists transaction_rules_user_id_idx
  on public.transaction_rules (user_id);

create index if not exists transaction_rules_match_text_idx
  on public.transaction_rules (match_text);

