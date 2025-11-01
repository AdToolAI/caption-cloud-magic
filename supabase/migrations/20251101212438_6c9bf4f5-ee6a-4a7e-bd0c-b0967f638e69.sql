-- Fix the sync_campaign_to_content_items trigger to properly get workspace_id

DROP TRIGGER IF EXISTS sync_campaign_posts_to_library ON public.campaign_posts;
DROP FUNCTION IF EXISTS public.sync_campaign_to_content_items();

CREATE OR REPLACE FUNCTION public.sync_campaign_to_content_items()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id UUID;
  v_workspace_id UUID;
BEGIN
  -- Get user_id from campaign
  SELECT user_id INTO v_user_id
  FROM public.campaigns
  WHERE id = NEW.campaign_id;
  
  -- Get user's default workspace (first workspace they own or are member of)
  SELECT workspace_id INTO v_workspace_id
  FROM public.workspace_members
  WHERE user_id = v_user_id
  ORDER BY created_at ASC
  LIMIT 1;
  
  -- If no workspace found, skip sync (shouldn't happen with proper setup)
  IF v_workspace_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Only sync if not already linked
  IF NOT EXISTS (
    SELECT 1 FROM public.content_items
    WHERE source = 'campaign' AND source_id = NEW.id
  ) THEN
    INSERT INTO public.content_items (
      workspace_id,
      type,
      title,
      caption,
      thumb_url,
      targets,
      tags,
      source,
      source_id
    )
    VALUES (
      v_workspace_id,
      CASE
        WHEN NEW.post_type IN ('Reel', 'Story') THEN 'video'
        ELSE 'image'
      END,
      NEW.title,
      NEW.caption_outline,
      NEW.media_url,
      NEW.platforms,
      NEW.hashtags,
      'campaign',
      NEW.id
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Recreate trigger
CREATE TRIGGER sync_campaign_posts_to_library
AFTER INSERT OR UPDATE ON public.campaign_posts
FOR EACH ROW
EXECUTE FUNCTION public.sync_campaign_to_content_items();