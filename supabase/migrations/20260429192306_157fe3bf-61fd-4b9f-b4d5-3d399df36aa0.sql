
-- Create QA screenshots bucket (admin-only managed; public-read so cockpit can render)
insert into storage.buckets (id, name, public)
values ('qa-screenshots', 'qa-screenshots', true)
on conflict (id) do nothing;

drop policy if exists "QA screenshots admin write" on storage.objects;
create policy "QA screenshots admin write"
on storage.objects for all
to authenticated
using (bucket_id = 'qa-screenshots' and public.has_role(auth.uid(), 'admin'::app_role))
with check (bucket_id = 'qa-screenshots' and public.has_role(auth.uid(), 'admin'::app_role));

drop policy if exists "QA screenshots service write" on storage.objects;
create policy "QA screenshots service write"
on storage.objects for all
to service_role
using (bucket_id = 'qa-screenshots')
with check (bucket_id = 'qa-screenshots');

drop policy if exists "QA screenshots public read" on storage.objects;
create policy "QA screenshots public read"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'qa-screenshots');
