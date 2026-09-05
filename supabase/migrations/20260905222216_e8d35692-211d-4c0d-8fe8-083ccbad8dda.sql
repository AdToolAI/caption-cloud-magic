create or replace function public.video_model_runtime_stats()
returns table (model text, sample_size int, p50_seconds int, p90_seconds int)
language sql
stable
security definer
set search_path = public
as $$
  select
    g.model::text,
    count(*)::int,
    percentile_disc(0.5) within group (order by extract(epoch from (g.completed_at - g.created_at)))::int,
    percentile_disc(0.9) within group (order by extract(epoch from (g.completed_at - g.created_at)))::int
  from public.ai_video_generations g
  where g.status = 'completed'
    and g.completed_at is not null
    and g.created_at > now() - interval '90 days'
    and extract(epoch from (g.completed_at - g.created_at)) between 5 and 3600
  group by g.model
  having count(*) >= 3
$$;

grant execute on function public.video_model_runtime_stats() to authenticated;
grant execute on function public.video_model_runtime_stats() to service_role;