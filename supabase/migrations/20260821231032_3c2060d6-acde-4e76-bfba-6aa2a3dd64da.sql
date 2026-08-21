drop policy if exists "Authenticated users can insert tags" on public.community_message_tags;
drop policy if exists "Anyone authenticated can insert tags" on public.community_message_tags;
drop policy if exists "Users can create tags" on public.community_message_tags;
create policy "Admins manage community tags"
on public.community_message_tags for insert
to authenticated
with check (public.has_role(auth.uid(), 'admin'::app_role));