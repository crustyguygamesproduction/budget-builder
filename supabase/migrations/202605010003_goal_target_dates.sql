alter table public.money_goals
  add column if not exists target_date date;
