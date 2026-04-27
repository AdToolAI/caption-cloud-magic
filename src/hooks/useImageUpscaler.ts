import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type UpscaleFactor = 2 | 4;

interface UpscaleParams {
  imageUrl: string;
  imageId?: string;
  factor: UpscaleFactor;
  prompt?: string;
}

interface UpscaleResult {
  id?: string;
  url: string;
  previewUrl: string;
  factor: UpscaleFactor;
  parentId: string | null;
}

/**
 * Hook for AI image upscaling (2x or 4x) via Replicate clarity-upscaler.
 * Wallet-debited; surfaces INSUFFICIENT_CREDITS / NO_WALLET via redirect.
 */
export function useImageUpscaler() {
  const [upscalingId, setUpscalingId] = useState<string | null>(null);
  const navigate = useNavigate();

  const upscale = async ({ imageUrl, imageId, factor, prompt }: UpscaleParams): Promise<UpscaleResult | null> => {
    setUpscalingId(imageId || imageUrl);
    try {
      const { data, error } = await supabase.functions.invoke('upscale-image', {
        body: { imageUrl, imageId, factor, prompt },
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

      if (data?.error) {
        throw new Error(data.error);
      }

      if (data?.image) {
        const sym = data.currency === 'USD' ? '$' : '€';
        toast.success(`Upscale ${factor}× fertig! Verbleibend: ${sym}${(data.newBalance ?? 0).toFixed(2)}`);
        return data.image as UpscaleResult;
      }
      return null;
    } catch (err: any) {
      console.error('[useImageUpscaler] error:', err);
      toast.error(err.message || 'Upscaling fehlgeschlagen');
      return null;
    } finally {
      setUpscalingId(null);
    }
  };

  return {
    upscale,
    upscalingId,
    isUpscaling: upscalingId !== null,
  };
}
