-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS sync_media_library_to_content ON media_library;

-- Trigger: Sync media_library → content_items
CREATE OR REPLACE FUNCTION sync_media_library_to_content_items()
RETURNS TRIGGER AS $$
DECLARE
  v_workspace_id UUID;
  v_content_type TEXT;
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

  -- Map file_type to content type
  IF NEW.file_type IN ('image', 'video') THEN
    v_content_type := NEW.file_type;
  ELSE
    v_content_type := 'image'; -- default fallback
  END IF;

  -- Insert into content_items
  INSERT INTO content_items (
    workspace_id,
    type,
    title,
    caption,
    media_id,
    thumb_url,
    source,
    source_id,
    duration_sec
  ) VALUES (
    v_workspace_id,
    v_content_type,
    COALESCE(NEW.alt_text, NEW.file_name, 'Uploaded Media'),
    NEW.description,
    NEW.id,
    NEW.thumbnail_url,
    'media_library',
    NEW.id,
    NEW.duration
  )
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER sync_media_library_to_content
AFTER INSERT ON media_library
FOR EACH ROW
EXECUTE FUNCTION sync_media_library_to_content_items();

-- Backfill existing media from media_library
INSERT INTO content_items (
  workspace_id,
  type,
  title,
  caption,
  media_id,
  thumb_url,
  source,
  source_id,
  duration_sec
)
SELECT 
  wm.workspace_id,
  CASE 
    WHEN ml.file_type IN ('image', 'video') THEN ml.file_type
    ELSE 'image'
  END,
  COALESCE(ml.alt_text, ml.file_name, 'Uploaded Media'),
  ml.description,
  ml.id,
  ml.thumbnail_url,
  'media_library',
  ml.id,
  ml.duration
FROM media_library ml
LEFT JOIN workspace_members wm ON wm.user_id = ml.user_id
WHERE NOT EXISTS (
  SELECT 1 FROM content_items ci
  WHERE ci.source = 'media_library' AND ci.source_id = ml.id
)
AND wm.workspace_id IS NOT NULL
ON CONFLICT DO NOTHING;