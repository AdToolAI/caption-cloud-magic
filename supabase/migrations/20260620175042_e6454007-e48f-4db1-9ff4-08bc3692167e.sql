-- v143 — RLS policies for lipsync-plates bucket.
-- Bucket itself is created via the storage admin API (storage.buckets writes
-- are blocked from SQL migrations in this project).

drop policy if exists "lipsync_plates_public_read" on storage.objects;
create policy "lipsync_plates_public_read"
on storage.objects for select
to public
using (bucket_id = 'lipsync-plates');

drop policy if exists "lipsync_plates_service_write" on storage.objects;
create policy "lipsync_plates_service_write"
on storage.objects for insert
to service_role
with check (bucket_id = 'lipsync-plates');

drop policy if exists "lipsync_plates_service_update" on storage.objects;
create policy "lipsync_plates_service_update"
on storage.objects for update
to service_role
using (bucket_id = 'lipsync-plates')
with check (bucket_id = 'lipsync-plates');

drop policy if exists "lipsync_plates_service_delete" on storage.objects;
create policy "lipsync_plates_service_delete"
on storage.objects for delete
to service_role
using (bucket_id = 'lipsync-plates');
