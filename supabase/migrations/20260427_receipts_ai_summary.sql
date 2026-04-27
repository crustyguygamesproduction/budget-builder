alter table if exists public.receipts
  add column if not exists ai_summary text,
  add column if not exists file_url text,
  add column if not exists file_type text,
  add column if not exists matched_status text default 'unmatched',
  add column if not exists source text default 'manual';
