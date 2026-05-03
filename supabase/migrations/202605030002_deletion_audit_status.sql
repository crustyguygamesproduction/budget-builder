alter table public.data_deletion_events
  add column if not exists status text not null default 'completed' check (status in ('started', 'completed', 'failed')),
  add column if not exists error_code text;

create index if not exists data_deletion_events_user_status_created_idx
  on public.data_deletion_events(user_id, status, created_at desc);
