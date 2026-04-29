-- Autopilot assets storage bucket
insert into storage.buckets (id, name, public)
values ('autopilot-assets', 'autopilot-assets', true)
on conflict (id) do nothing;

drop policy if exists "Autopilot assets: public read" on storage.objects;
create policy "Autopilot assets: public read"
  on storage.objects for select
  using (bucket_id = 'autopilot-assets');

drop policy if exists "Autopilot assets: owner upload" on storage.objects;
create policy "Autopilot assets: owner upload"
  on storage.objects for insert
  with check (
    bucket_id = 'autopilot-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Autopilot assets: owner update" on storage.objects;
create policy "Autopilot assets: owner update"
  on storage.objects for update
  using (
    bucket_id = 'autopilot-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Autopilot assets: owner delete" on storage.objects;
create policy "Autopilot assets: owner delete"
  on storage.objects for delete
  using (
    bucket_id = 'autopilot-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create extension if not exists pg_cron;
create extension if not exists pg_net;