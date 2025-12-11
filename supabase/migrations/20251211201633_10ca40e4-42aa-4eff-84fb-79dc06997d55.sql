-- Fix the sync_campaign_to_content_items function
-- Problem 1: workspace_members has 'joined_at' not 'created_at'
-- Problem 2: campaign_posts doesn't have 'platforms' column - need to get from campaigns table

CREATE OR REPLACE FUNCTION public.sync_campaign_to_content_items()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_workspace_id uuid;
  v_platforms jsonb;
BEGIN
  -- Get user_id from the campaign
  SELECT user_id INTO v_user_id
  FROM public.campaigns
  WHERE id = NEW.campaign_id;

  IF v_user_id IS NULL THEN
    RAISE WARNING 'sync_campaign_to_content_items: No user_id found for campaign %', NEW.campaign_id;
    RETURN NEW;
  END IF;

  -- Get workspace_id from workspace_members (use joined_at, not created_at)
  SELECT workspace_id INTO v_workspace_id
  FROM public.workspace_members
  WHERE user_id = v_user_id
  ORDER BY joined_at ASC
  LIMIT 1;

  IF v_workspace_id IS NULL THEN
    RAISE WARNING 'sync_campaign_to_content_items: No workspace found for user %', v_user_id;
    RETURN NEW;
  END IF;

  -- Get platforms from campaigns table (not from campaign_posts which doesn't have this column)
  SELECT platform INTO v_platforms
  FROM public.campaigns
  WHERE id = NEW.campaign_id;

  -- Insert into content_items
  INSERT INTO public.content_items (
    workspace_id,
    user_id,
    title,
    caption,
    hashtags,
    platforms,
    status,
    scheduled_at,
    source,
    source_id
  ) VALUES (
    v_workspace_id,
    v_user_id,
    NEW.title,
    NEW.caption_outline,
    NEW.hashtags,
    v_platforms,
    'draft',
    NULL,
    'campaign',
    NEW.id::text
  )
  ON CONFLICT (source, source_id) DO UPDATE SET
    title = EXCLUDED.title,
    caption = EXCLUDED.caption,
    hashtags = EXCLUDED.hashtags,
    platforms = EXCLUDED.platforms;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'sync_campaign_to_content_items error: %', SQLERRM;
    RETURN NEW;
END;
$$;