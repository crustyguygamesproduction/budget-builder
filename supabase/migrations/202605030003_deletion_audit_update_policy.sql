drop policy if exists "data_deletion_events_update_own" on public.data_deletion_events;
create policy "data_deletion_events_update_own"
  on public.data_deletion_events
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
