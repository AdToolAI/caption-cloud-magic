create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1
    from public.user_roles
    where user_id = _user_id
      and role = _role
      and workspace_id is null
  )
$function$;

drop policy if exists "Authenticated users can view role permissions" on public.role_permissions;
drop policy if exists "Anyone authenticated can view role permissions" on public.role_permissions;
create policy "Admins can view role permissions"
on public.role_permissions for select
to authenticated
using (public.has_role(auth.uid(), 'admin'::app_role));