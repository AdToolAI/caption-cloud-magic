import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type EditMode = 'inpaint' | 'outpaint';

interface MagicEditParams {
  imageUrl: string;
  imageId?: string;
  mode: EditMode;
  prompt: string;
  maskBlob?: Blob;        // For inpaint: white = edit, black = keep
  outpaintDirection?: 'left' | 'right' | 'top' | 'bottom' | 'all';
  outpaintPixels?: number;
}

interface MagicEditResult {
  id?: string;
  url: string;
  previewUrl: string;
  mode: EditMode;
  parentId: string | null;
}

/**
 * Hook for AI Magic Edit (Inpaint / Outpaint) via Replicate flux-fill-pro.
 * Uploads mask to storage first if provided, then calls magic-edit-image edge fn.
 */
export function useMagicEdit() {
  const [isEditing, setIsEditing] = useState(false);
  const navigate = useNavigate();

  const edit = async (params: MagicEditParams): Promise<MagicEditResult | null> => {
    setIsEditing(true);
    try {
      // 1. Upload mask if provided
      let maskUrl: string | undefined;
      if (params.maskBlob) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          toast.error('Bitte einloggen');
          return null;
        }

        const maskPath = `${user.id}/picture-studio/masks/mask-${Date.now()}.png`;
        const { error: uploadErr } = await supabase.storage
          .from('background-projects')
          .upload(maskPath, params.maskBlob, {
            contentType: 'image/png',
            upsert: false,
          });

        if (uploadErr) {
          console.error('[useMagicEdit] mask upload error:', uploadErr);
          toast.error(`Mask-Upload fehlgeschlagen: ${uploadErr.message}`);
          return null;
        }

        const { data: pub } = supabase.storage.from('background-projects').getPublicUrl(maskPath);
        maskUrl = pub.publicUrl;
      }

      // 2. Call edge function
      const { data, error } = await supabase.functions.invoke('magic-edit-image', {
        body: {
          imageUrl: params.imageUrl,
          imageId: params.imageId,
          mode: params.mode,
          prompt: params.prompt,
          maskUrl,
          outpaintDirection: params.outpaintDirection,
          outpaintPixels: params.outpaintPixels,
        },
      });

      if (error) {
        const fnError: any = error;
        if (fnError.context && typeof fnError.context.json === 'function') {
          try {
            const body = await fnError.context.json();
            if (body?.code === 'INSUFFICIENT_CREDITS' || body?.code === 'NO_WALLET') {
              toast.error(body.error);
              navigate('/ai-video-purchase-credits');
              return null;
            }
            throw new Error(body?.error || fnError.message);
          } catch (e: any) {
            throw e;
          }
        }
        throw error;
      }

      if (data?.error) throw new Error(data.error);

      if (data?.image) {
        const sym = data.currency === 'USD' ? '$' : '€';
        toast.success(
          `${params.mode === 'inpaint' ? 'Magic Edit' : 'Outpaint'} fertig! Verbleibend: ${sym}${(data.newBalance ?? 0).toFixed(2)}`
        );
        return data.image as MagicEditResult;
      }
      return null;
    } catch (err: any) {
      console.error('[useMagicEdit] error:', err);
      toast.error(err.message || 'Magic Edit fehlgeschlagen');
      return null;
    } finally {
      setIsEditing(false);
    }
  };

  return { edit, isEditing };
}
