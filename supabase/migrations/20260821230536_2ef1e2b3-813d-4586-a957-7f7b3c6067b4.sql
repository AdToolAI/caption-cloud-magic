drop policy if exists "Users can book slots" on public.mentor_slots;
create policy "Users can book slots"
on public.mentor_slots for update
to authenticated
using (status = 'open' and mentor_user_id <> auth.uid())
with check (
  status = 'booked'
  and booked_by = auth.uid()
  and mentor_user_id <> auth.uid()
);

drop policy if exists "Authenticated users can view template activity" on public.template_activity;
create policy "Users can view their own template activity"
on public.template_activity for select
to authenticated
using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'::app_role));