-- Step 1: Cleanup duplicates - keep best scene per (project_id, order_index)
WITH ranked AS (
  SELECT 
    id,
    project_id,
    order_index,
    ROW_NUMBER() OVER (
      PARTITION BY project_id, order_index 
      ORDER BY 
        CASE clip_status
          WHEN 'ready' THEN 1
          WHEN 'generating' THEN 2
          WHEN 'pending' THEN 3
          WHEN 'failed' THEN 4
          ELSE 5
        END,
        created_at DESC
    ) AS rn
  FROM public.composer_scenes
)
DELETE FROM public.composer_scenes
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- Step 2: Add unique constraint to prevent future duplicates
ALTER TABLE public.composer_scenes
ADD CONSTRAINT composer_scenes_project_order_unique
UNIQUE (project_id, order_index);