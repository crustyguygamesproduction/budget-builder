alter table if exists public.statement_imports
  add column if not exists start_date date,
  add column if not exists end_date date,
  add column if not exists detected_month_count integer,
  add column if not exists file_fingerprint text;

create unique index if not exists statement_imports_user_fingerprint_idx
  on public.statement_imports (user_id, file_fingerprint)
  where file_fingerprint is not null;

alter table if exists public.investments
  add column if not exists ticker_symbol text,
  add column if not exists units_owned numeric,
  add column if not exists total_contributed numeric,
  add column if not exists cost_basis numeric,
  add column if not exists live_price numeric,
  add column if not exists live_price_currency text,
  add column if not exists live_price_updated_at timestamptz,
  add column if not exists price_source text;

create table if not exists public.viewer_access (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  viewer_email text not null,
  viewer_user_id uuid references auth.users(id) on delete set null,
  label text,
  role text not null default 'viewer',
  invite_status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.viewer_access enable row level security;

drop policy if exists "viewer_access_select_own" on public.viewer_access;
create policy "viewer_access_select_own"
  on public.viewer_access
  for select
  using (auth.uid() = user_id or auth.uid() = viewer_user_id);

drop policy if exists "viewer_access_insert_own" on public.viewer_access;
create policy "viewer_access_insert_own"
  on public.viewer_access
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "viewer_access_update_own" on public.viewer_access;
create policy "viewer_access_update_own"
  on public.viewer_access
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "viewer_access_delete_own" on public.viewer_access;
create policy "viewer_access_delete_own"
  on public.viewer_access
  for delete
  using (auth.uid() = user_id);

create table if not exists public.financial_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  record_type text not null,
  linked_record_id uuid,
  file_name text,
  file_url text,
  file_type text,
  extraction_status text not null default 'uploaded',
  extraction_summary text,
  extracted_json jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.financial_documents enable row level security;

drop policy if exists "financial_documents_select_own" on public.financial_documents;
create policy "financial_documents_select_own"
  on public.financial_documents
  for select
  using (auth.uid() = user_id);

drop policy if exists "financial_documents_insert_own" on public.financial_documents;
create policy "financial_documents_insert_own"
  on public.financial_documents
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "financial_documents_update_own" on public.financial_documents;
create policy "financial_documents_update_own"
  on public.financial_documents
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "financial_documents_delete_own" on public.financial_documents;
create policy "financial_documents_delete_own"
  on public.financial_documents
  for delete
  using (auth.uid() = user_id);
