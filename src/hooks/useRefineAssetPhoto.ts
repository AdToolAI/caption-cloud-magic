// useRefineAssetPhoto
// ------------------------------------------------------------------
// Single hook powering the "upload a photo → AI cleans it into a
// canonical Cast & World asset" flow. Works for characters, props,
// buildings and locations. For character/prop/building the refined
// solid-white-background image is passed through the client-side
// `removeBackground()` helper so the final `reference_image_url`
// carries a real transparent PNG cutout.

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { removeBackground, loadImage } from '@/lib/backgroundRemoval';

export type RefineKind = 'character' | 'prop' | 'building' | 'location';

const BRAND_TABLE: Record<RefineKind, string> = {
  character: 'brand_characters',
  prop: 'brand_props',
  building: 'brand_buildings',
  location: 'brand_locations',
};

const QUERY_KEY: Record<RefineKind, string> = {
  character: 'brand-characters',
  prop: 'brand-props',
  building: 'brand-buildings',
  location: 'brand-locations',
};

interface RefineInput {
  kind: RefineKind;
  file: File;
  name: string;
  description?: string;
  extraPrompt?: string;
}

interface RefineResult {
  assetId: string;
  kind: RefineKind;
  referenceImageUrl: string;
}

export function useRefineAssetPhoto() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: RefineInput): Promise<RefineResult> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // 1) Upload raw photo to the private brand-uploads bucket.
      const ext = (input.file.name.split('.').pop() || 'jpg').toLowerCase();
      const uploadPath = `${user.id}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('brand-uploads')
        .upload(uploadPath, input.file, {
          contentType: input.file.type || 'image/jpeg',
          upsert: false,
        });
      if (upErr) throw upErr;

      const { data: signed } = await supabase.storage
        .from('brand-uploads')
        .createSignedUrl(uploadPath, 60 * 10);
      const sourceImageUrl = signed?.signedUrl;
      if (!sourceImageUrl) throw new Error('Could not create signed URL for upload');

      // 2) Ask the edge function to restage the photo and create the row.
      const { data, error } = await supabase.functions.invoke('refine-asset-photo', {
        body: {
          kind: input.kind,
          sourceImageUrl,
          name: input.name,
          description: input.description ?? null,
          extraPrompt: input.extraPrompt ?? null,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);

      const asset = (data as any).asset;
      const bucket = (data as any).bucket as string;
      const refinedUrl = (data as any).refined_url as string;
      const needsCutout = Boolean((data as any).needs_client_cutout);

      // 3) For cutout kinds, run client-side background removal on the
      //    solid-white refined image and overwrite the stored file with a
      //    transparent PNG. Failing here doesn't invalidate the asset —
      //    it just remains on the white background.
      let finalUrl = refinedUrl;
      let finalPath = (data as any).storage_path as string;
      if (needsCutout) {
        try {
          const refinedBlob = await (await fetch(refinedUrl)).blob();
          const img = await loadImage(refinedBlob);
          const { cutoutBlob } = await removeBackground(img, 'high');

          const cutoutPath = `${user.id}/${crypto.randomUUID()}.png`;
          const { error: upErr2 } = await supabase.storage
            .from(bucket)
            .upload(cutoutPath, cutoutBlob, { contentType: 'image/png', upsert: false });
          if (upErr2) throw upErr2;
          const { data: signed2 } = await supabase.storage
            .from(bucket)
            .createSignedUrl(cutoutPath, 60 * 60 * 24 * 365 * 5);
          const cutoutUrl = signed2?.signedUrl;
          if (!cutoutUrl) throw new Error('Could not sign cutout url');

          const { error: rpcErr } = await (supabase as any).rpc(
            'update_asset_reference_image',
            {
              p_kind: input.kind,
              p_asset_id: asset.id,
              p_url: cutoutUrl,
              p_storage_path: cutoutPath,
            },
          );
          if (rpcErr) throw rpcErr;
          finalUrl = cutoutUrl;
          finalPath = cutoutPath;
        } catch (e) {
          console.warn(
            '[useRefineAssetPhoto] background removal failed, keeping white-bg refined image:',
            e,
          );
        }
      }

      // 4) Clean up the raw upload — not needed once refinement is done.
      try {
        await supabase.storage.from('brand-uploads').remove([uploadPath]);
      } catch (e) {
        console.warn('[useRefineAssetPhoto] cleanup of raw upload failed:', e);
      }

      return {
        assetId: asset.id,
        kind: input.kind,
        referenceImageUrl: finalUrl,
      };
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: [QUERY_KEY[res.kind]] });
      qc.invalidateQueries({ queryKey: ['unified-mention-library'] });
      qc.invalidateQueries({ queryKey: ['mention-library:outfit-looks'] });
      toast.success('Asset saved to your library');
    },
    onError: (e: any) => {
      toast.error(e?.message || 'Failed to refine photo');
    },
  });
}

export const REFINE_KIND_LABEL: Record<RefineKind, string> = {
  character: 'Character',
  prop: 'Prop / Object',
  building: 'Building',
  location: 'Location',
};
