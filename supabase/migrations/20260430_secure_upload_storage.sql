alter table if exists public.receipts
  add column if not exists file_path text;

alter table if exists public.financial_documents
  add column if not exists file_path text;

update storage.buckets
set public = false
where id = 'receipts';

drop policy if exists "receipts_storage_select_own_path" on storage.objects;
create policy "receipts_storage_select_own_path"
  on storage.objects
  for select
  using (
    bucket_id = 'receipts'
    and auth.uid()::text = split_part(name, '/', 1)
  );

drop policy if exists "receipts_storage_insert_own_path" on storage.objects;
create policy "receipts_storage_insert_own_path"
  on storage.objects
  for insert
  with check (
    bucket_id = 'receipts'
    and auth.uid()::text = split_part(name, '/', 1)
  );

drop policy if exists "receipts_storage_update_own_path" on storage.objects;
create policy "receipts_storage_update_own_path"
  on storage.objects
  for update
  using (
    bucket_id = 'receipts'
    and auth.uid()::text = split_part(name, '/', 1)
  )
  with check (
    bucket_id = 'receipts'
    and auth.uid()::text = split_part(name, '/', 1)
  );

drop policy if exists "receipts_storage_delete_own_path" on storage.objects;
create policy "receipts_storage_delete_own_path"
  on storage.objects
  for delete
  using (
    bucket_id = 'receipts'
    and auth.uid()::text = split_part(name, '/', 1)
  );

create index if not exists receipts_file_path_idx on public.receipts (file_path)
  where file_path is not null;

create index if not exists financial_documents_file_path_idx on public.financial_documents (file_path)
  where file_path is not null;
