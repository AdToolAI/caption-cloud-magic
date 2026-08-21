DROP VIEW IF EXISTS public.v_metrics_summary;
CREATE VIEW public.v_metrics_summary WITH (security_invoker = true) AS
SELECT user_id,
       provider,
       date_trunc('day', posted_at) AS day,
       sum(likes) AS likes,
       sum(comments) AS comments,
       sum(shares) AS shares,
       sum(COALESCE(impressions, reach, 0)) AS views,
       sum(impressions) AS impressions,
       avg(COALESCE(engagement_rate, 0)) AS avg_engagement
FROM public.post_metrics
WHERE posted_at > (now() - interval '365 days')
GROUP BY user_id, provider, date_trunc('day', posted_at)
ORDER BY date_trunc('day', posted_at);

DROP VIEW IF EXISTS public.v_top_posts;
CREATE VIEW public.v_top_posts WITH (security_invoker = true) AS
SELECT provider,
       COALESCE(external_id, post_id) AS external_id,
       caption_text,
       likes,
       comments,
       shares,
       COALESCE(impressions, reach, 0) AS views,
       COALESCE(engagement_rate, 0) AS engagement_rate,
       post_url AS permalink,
       posted_at,
       user_id
FROM public.post_metrics
WHERE posted_at > (now() - interval '365 days')
ORDER BY COALESCE(engagement_rate, 0) DESC;

GRANT SELECT ON public.v_metrics_summary TO authenticated;
GRANT SELECT ON public.v_top_posts TO authenticated;
GRANT SELECT ON public.v_metrics_summary TO service_role;
GRANT SELECT ON public.v_top_posts TO service_role;