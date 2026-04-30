alter table if exists public.accounts
  add column if not exists counts_as_savings boolean,
  add column if not exists account_role text;

create index if not exists accounts_counts_as_savings_idx
  on public.accounts (user_id, counts_as_savings)
  where counts_as_savings is not null;
