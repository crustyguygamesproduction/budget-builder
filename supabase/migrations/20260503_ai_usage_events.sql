create table if not exists public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  function_name text not null,
  action text not null,
  input_bytes integer not null default 0,
  unit_count integer not null default 1,
  created_at timestamptz not null default now()
);

alter table public.ai_usage_events enable row level security;

drop policy if exists "Users can read own AI usage events" on public.ai_usage_events;
create policy "Users can read own AI usage events"
  on public.ai_usage_events
  for select
  using (auth.uid() = user_id);

create index if not exists ai_usage_events_user_created_idx
  on public.ai_usage_events (user_id, created_at desc);

create index if not exists ai_usage_events_function_action_created_idx
  on public.ai_usage_events (function_name, action, created_at desc);
