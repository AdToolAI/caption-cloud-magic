CREATE OR REPLACE FUNCTION public.voice_library_facets(
  _language text DEFAULT 'all',
  _native_only boolean DEFAULT false,
  _search text DEFAULT ''
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH base AS (
    SELECT *
    FROM public.voice_library_cache v
    WHERE (_language = 'all' OR v.supported_languages @> ARRAY[_language])
      AND (_native_only IS NOT TRUE OR v.is_native)
      AND (
        coalesce(_search, '') = ''
        OR v.name ILIKE '%' || _search || '%'
        OR v.description ILIKE '%' || _search || '%'
      )
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM base),
    'gender', (SELECT coalesce(jsonb_object_agg(k, c), '{}'::jsonb) FROM (
        SELECT coalesce(gender,'unknown') k, count(*) c FROM base GROUP BY 1 ORDER BY 2 DESC LIMIT 20) g),
    'age', (SELECT coalesce(jsonb_object_agg(k, c), '{}'::jsonb) FROM (
        SELECT coalesce(age,'unknown') k, count(*) c FROM base GROUP BY 1 ORDER BY 2 DESC LIMIT 20) a),
    'accent', (SELECT coalesce(jsonb_object_agg(k, c), '{}'::jsonb) FROM (
        SELECT coalesce(accent,'unknown') k, count(*) c FROM base GROUP BY 1 ORDER BY 2 DESC LIMIT 40) ac),
    'use_case', (SELECT coalesce(jsonb_object_agg(k, c), '{}'::jsonb) FROM (
        SELECT coalesce(use_case,'unknown') k, count(*) c FROM base GROUP BY 1 ORDER BY 2 DESC LIMIT 40) u),
    'language', (SELECT coalesce(jsonb_object_agg(k, c), '{}'::jsonb) FROM (
        SELECT language k, count(*) c FROM public.voice_library_cache GROUP BY 1 ORDER BY 2 DESC LIMIT 40) l)
  );
$$;

GRANT EXECUTE ON FUNCTION public.voice_library_facets(text, boolean, text) TO authenticated, service_role;