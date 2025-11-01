-- Update source check constraint to include 'media_library'
ALTER TABLE content_items DROP CONSTRAINT IF EXISTS content_items_source_check;
ALTER TABLE content_items ADD CONSTRAINT content_items_source_check 
  CHECK (source = ANY (ARRAY['manual'::text, 'ai'::text, 'campaign'::text, 'imported'::text, 'media_library'::text]));

-- Add unique constraint for content_items to prevent duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_content_items_workspace_source_id 
ON content_items(workspace_id, source, source_id) 
WHERE source IS NOT NULL AND source_id IS NOT NULL;

-- Create function to sync media_assets to content_items
CREATE OR REPLACE FUNCTION public.sync_media_asset_to_content_item()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_workspace_id UUID;
  v_content_type TEXT;
  v_title TEXT;
BEGIN
  -- Get user's first workspace
  SELECT workspace_id INTO v_workspace_id
  FROM workspace_members
  WHERE user_id = NEW.user_id
  LIMIT 1;

  -- Skip if no workspace found
  IF v_workspace_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Determine content type
  IF NEW.type = 'video' THEN
    v_content_type := 'video';
  ELSE
    v_content_type := 'image';
  END IF;

  -- Extract filename from storage_path or use source
  v_title := COALESCE(
    regexp_replace(COALESCE(NEW.storage_path, NEW.original_url, ''), '^.*/([^/]+)$', '\1'),
    'Uploaded Media'
  );

  -- Insert into content_items (media_id is NULL since it references media_library table)
  INSERT INTO content_items (
    workspace_id,
    type,
    title,
    thumb_url,
    source,
    source_id,
    duration_sec
  ) VALUES (
    v_workspace_id,
    v_content_type,
    v_title,
    COALESCE(NEW.storage_path, NEW.original_url),
    'media_library',
    NEW.id,
    NEW.duration_sec
  )
  ON CONFLICT (workspace_id, source, source_id)
  WHERE source IS NOT NULL AND source_id IS NOT NULL
  DO UPDATE SET
    type = EXCLUDED.type,
    title = EXCLUDED.title,
    thumb_url = EXCLUDED.thumb_url,
    duration_sec = EXCLUDED.duration_sec,
    updated_at = now();

  RETURN NEW;
END;
$$;

-- Create trigger on media_assets
DROP TRIGGER IF EXISTS sync_media_asset_trigger ON media_assets;
CREATE TRIGGER sync_media_asset_trigger
  AFTER INSERT OR UPDATE ON media_assets
  FOR EACH ROW
  EXECUTE FUNCTION sync_media_asset_to_content_item();

-- Backfill existing media_assets into content_items
INSERT INTO content_items (
  workspace_id,
  type,
  title,
  thumb_url,
  source,
  source_id,
  duration_sec
)
SELECT DISTINCT ON (wm.workspace_id, ma.id)
  wm.workspace_id,
  CASE WHEN ma.type = 'video' THEN 'video' ELSE 'image' END,
  COALESCE(
    regexp_replace(COALESCE(ma.storage_path, ma.original_url, ''), '^.*/([^/]+)$', '\1'),
    'Uploaded Media'
  ),
  COALESCE(ma.storage_path, ma.original_url),
  'media_library',
  ma.id,
  ma.duration_sec
FROM media_assets ma
JOIN workspace_members wm ON wm.user_id = ma.user_id
WHERE NOT EXISTS (
  SELECT 1 FROM content_items ci
  WHERE ci.source = 'media_library'
  AND ci.source_id = ma.id
  AND ci.workspace_id = wm.workspace_id
)
ORDER BY wm.workspace_id, ma.id, ma.created_at ASC
ON CONFLICT (workspace_id, source, source_id)
WHERE source IS NOT NULL AND source_id IS NOT NULL
DO NOTHING;