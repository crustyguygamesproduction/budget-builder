alter table if exists public.receipts
  add column if not exists transaction_id uuid references public.transactions(id) on delete set null,
  add column if not exists merchant text,
  add column if not exists total numeric default 0,
  add column if not exists receipt_date date,
  add column if not exists source text default 'manual',
  add column if not exists matched_status text default 'unmatched',
  add column if not exists ai_summary text,
  add column if not exists file_url text,
  add column if not exists file_path text,
  add column if not exists file_type text;

create index if not exists receipts_user_receipt_date_idx
  on public.receipts (user_id, receipt_date desc);

create index if not exists receipts_transaction_id_idx
  on public.receipts (transaction_id)
  where transaction_id is not null;
