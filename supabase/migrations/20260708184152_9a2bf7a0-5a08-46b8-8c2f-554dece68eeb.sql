
-- RLS for brand-uploads bucket: user-id must be first path segment
CREATE POLICY "brand_uploads_read_own"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'brand-uploads' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "brand_uploads_insert_own"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'brand-uploads' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "brand_uploads_update_own"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'brand-uploads' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "brand_uploads_delete_own"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'brand-uploads' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Helper RPC: update reference_image_url for a Cast&World asset the caller owns.
CREATE OR REPLACE FUNCTION public.update_asset_reference_image(
  p_kind text,
  p_asset_id uuid,
  p_url text,
  p_storage_path text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF p_kind = 'character' THEN
    UPDATE public.brand_characters
       SET reference_image_url = p_url,
           storage_path = COALESCE(p_storage_path, storage_path),
           updated_at = now()
     WHERE id = p_asset_id AND user_id = v_uid;
  ELSIF p_kind = 'prop' THEN
    UPDATE public.brand_props
       SET reference_image_url = p_url,
           storage_path = COALESCE(p_storage_path, storage_path),
           updated_at = now()
     WHERE id = p_asset_id AND user_id = v_uid;
  ELSIF p_kind = 'building' THEN
    UPDATE public.brand_buildings
       SET reference_image_url = p_url,
           storage_path = COALESCE(p_storage_path, storage_path),
           updated_at = now()
     WHERE id = p_asset_id AND user_id = v_uid;
  ELSIF p_kind = 'location' THEN
    UPDATE public.brand_locations
       SET reference_image_url = p_url,
           storage_path = COALESCE(p_storage_path, storage_path),
           updated_at = now()
     WHERE id = p_asset_id AND user_id = v_uid;
  ELSE
    RAISE EXCEPTION 'invalid kind: %', p_kind;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_asset_reference_image(text, uuid, text, text) TO authenticated;
