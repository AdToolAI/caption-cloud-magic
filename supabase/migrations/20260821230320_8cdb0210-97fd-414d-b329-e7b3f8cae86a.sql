drop policy if exists "QA screenshots public read" on storage.objects;
create policy "QA screenshots admin read"
on storage.objects for select
to authenticated
using (bucket_id = 'qa-screenshots' and public.has_role(auth.uid(), 'admin'::app_role));