CREATE OR REPLACE FUNCTION public.set_content_hash()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_media_urls TEXT[];
BEGIN
  -- Extract URLs from assets_json (for calendar_events) or use media_urls (for other tables)
  IF TG_TABLE_NAME = 'calendar_events' THEN
    -- For calendar_events: extract URLs from assets_json
    SELECT COALESCE(
      array_agg(elem->>'url'),
      ARRAY[]::TEXT[]
    ) INTO v_media_urls
    FROM jsonb_array_elements(COALESCE(NEW.assets_json, '[]'::jsonb)) as elem;
    
    -- Only compute hash if caption or assets changed
    IF TG_OP = 'INSERT' OR 
       OLD.caption IS DISTINCT FROM NEW.caption OR
       OLD.assets_json IS DISTINCT FROM NEW.assets_json THEN
      
      NEW.content_hash := compute_content_hash(
        NEW.caption,
        NEW.channels::TEXT[],
        v_media_urls
      );
    END IF;
  ELSE
    -- Original logic for other tables
    IF TG_OP = 'INSERT' OR 
       OLD.caption IS DISTINCT FROM NEW.caption OR
       OLD.media_urls IS DISTINCT FROM NEW.media_urls THEN
      
      NEW.content_hash := compute_content_hash(
        NEW.caption,
        NEW.platforms::TEXT[],
        NEW.media_urls
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$function$;