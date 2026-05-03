create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  privacy_policy_version text,
  privacy_policy_accepted_at timestamptz,
  ai_processing_acknowledged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles
  for select
  using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles
  for insert
  with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create table if not exists public.data_deletion_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action_type text not null check (action_type in ('full_wipe', 'month_delete')),
  selected_months text[] not null default '{}',
  counts jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.data_deletion_events enable row level security;

drop policy if exists "data_deletion_events_select_own" on public.data_deletion_events;
create policy "data_deletion_events_select_own"
  on public.data_deletion_events
  for select
  using (auth.uid() = user_id);

drop policy if exists "data_deletion_events_insert_own" on public.data_deletion_events;
create policy "data_deletion_events_insert_own"
  on public.data_deletion_events
  for insert
  with check (auth.uid() = user_id);

create index if not exists data_deletion_events_user_created_idx
  on public.data_deletion_events(user_id, created_at desc);

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id,
    email,
    privacy_policy_version,
    privacy_policy_accepted_at,
    ai_processing_acknowledged_at
  ) values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'privacy_policy_version',
    nullif(new.raw_user_meta_data ->> 'privacy_policy_accepted_at', '')::timestamptz,
    nullif(new.raw_user_meta_data ->> 'ai_processing_acknowledged_at', '')::timestamptz
  )
  on conflict (id) do update set
    email = excluded.email,
    privacy_policy_version = coalesce(excluded.privacy_policy_version, public.profiles.privacy_policy_version),
    privacy_policy_accepted_at = coalesce(excluded.privacy_policy_accepted_at, public.profiles.privacy_policy_accepted_at),
    ai_processing_acknowledged_at = coalesce(excluded.ai_processing_acknowledged_at, public.profiles.ai_processing_acknowledged_at),
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute function public.handle_new_user_profile();
