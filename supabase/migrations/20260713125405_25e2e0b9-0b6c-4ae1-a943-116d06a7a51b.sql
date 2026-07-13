-- Backfill: restore 'draft' status for universal-creator projects whose status
-- was previously overwritten to 'rendering' or 'completed' by the render
-- edge function. Auto-resume filters on status='draft' and would otherwise
-- never surface these projects again.
update public.content_projects
set status = 'draft'
where content_type = 'universal'
  and status in ('rendering', 'completed');