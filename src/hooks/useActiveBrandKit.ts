import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface ActiveBrandKit {
  id: string;
  brand_name: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  accent_color: string | null;
  mood: string | null;
  logo_url: string | null;
}

/**
 * Returns the user's currently active brand kit (is_active = true), if any.
 * Used by Picture Studio for the "Brand-Kit Lock" feature in Phase C.
 */
export function useActiveBrandKit() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['active-brand-kit', user?.id],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async (): Promise<ActiveBrandKit | null> => {
      if (!user) return null;
      const { data, error } = await supabase
        .from('brand_kits')
        .select('id, brand_name, primary_color, secondary_color, accent_color, mood, logo_url')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return (data as ActiveBrandKit | null) ?? null;
    },
  });
}

/** Convert hex color "#RRGGBB" → {r,g,b} */
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = hex.replace('#', '').match(/^([0-9a-f]{6})$/i);
  if (!m) return null;
  const v = parseInt(m[1], 16);
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
}

/** Color distance (Euclidean in RGB) — simple but sufficient for a 0–100 score. */
function colorDistance(a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }): number {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

/**
 * Quick CI-Match score (0–100) by sampling an image and comparing dominant
 * pixel colors against the brand palette. Runs entirely in the browser
 * via a small <canvas> — no edge-function call.
 */
export async function computeCIMatchScore(
  imageUrl: string,
  palette: string[]
): Promise<number> {
  const cleanPalette = palette.filter(Boolean);
  if (!cleanPalette.length) return 0;
  const paletteRgb = cleanPalette.map(hexToRgb).filter(Boolean) as Array<{ r: number; g: number; b: number }>;
  if (!paletteRgb.length) return 0;

  return new Promise<number>((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const W = 64, H = 64;
        const canvas = document.createElement('canvas');
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(0);
        ctx.drawImage(img, 0, 0, W, H);
        const { data } = ctx.getImageData(0, 0, W, H);

        let totalScore = 0;
        let samples = 0;
        // Sample every 4th pixel for speed
        for (let i = 0; i < data.length; i += 16) {
          const px = { r: data[i], g: data[i + 1], b: data[i + 2] };
          // Find nearest palette color
          let minDist = Infinity;
          for (const pc of paletteRgb) {
            const d = colorDistance(px, pc);
            if (d < minDist) minDist = d;
          }
          // Map distance (max ≈ 441) → 0..1 closeness
          const closeness = Math.max(0, 1 - minDist / 200);
          totalScore += closeness;
          samples++;
        }
        const avg = samples > 0 ? totalScore / samples : 0;
        resolve(Math.round(avg * 100));
      } catch (err) {
        console.warn('[CI-Score] failed:', err);
        resolve(0);
      }
    };
    img.onerror = () => resolve(0);
    img.src = imageUrl;
  });
}
