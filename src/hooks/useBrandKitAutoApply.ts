import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type {
  AssemblyConfig,
  ColorGradingPreset,
  GlobalTextOverlay,
  WatermarkConfig,
} from '@/types/video-composer';

/**
 * Brand Kit shape (subset of brand_kits table) used by the Composer
 * Auto-Apply feature.
 */
export interface BrandKit {
  id: string;
  brand_name: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  accent_color: string | null;
  logo_url: string | null;
  font_pairing: { heading?: string; body?: string } | null;
  mood: string | null;
  brand_tone: string | null;
}

/** Map a brand mood string to one of the Composer color-grading presets. */
function moodToColorGrading(mood: string | null | undefined): ColorGradingPreset | undefined {
  if (!mood) return undefined;
  const m = mood.toLowerCase();
  if (m.includes('cinematic') || m.includes('dramatic') || m.includes('warm')) return 'cinematic-warm';
  if (m.includes('cool') || m.includes('tech') || m.includes('blue')) return 'cool-blue';
  if (m.includes('vintage') || m.includes('retro')) return 'vintage-film';
  if (m.includes('bold') || m.includes('energetic') || m.includes('high')) return 'high-contrast';
  if (m.includes('moody') || m.includes('dark') || m.includes('luxury')) return 'moody-dark';
  return undefined;
}

/** Fetch all brand kits for the current user (newest first). */
export function useBrandKits() {
  return useQuery({
    queryKey: ['composer-brand-kits'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [] as BrandKit[];
      const { data, error } = await supabase
        .from('brand_kits')
        .select('id, brand_name, primary_color, secondary_color, accent_color, logo_url, font_pairing, mood, brand_tone')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as BrandKit[];
    },
    staleTime: 60_000,
  });
}

export interface BrandApplyOptions {
  applyWatermark?: boolean;
  applyTextColors?: boolean;
  applyFonts?: boolean;
  applyColorGrading?: boolean;
}

const DEFAULT_OPTS: Required<BrandApplyOptions> = {
  applyWatermark: true,
  applyTextColors: true,
  applyFonts: true,
  applyColorGrading: true,
};

/**
 * Apply a brand kit to an existing AssemblyConfig.
 * Returns a NEW AssemblyConfig — does not mutate the input.
 */
export function applyBrandKitToAssembly(
  config: AssemblyConfig,
  kit: BrandKit,
  options: BrandApplyOptions = {}
): AssemblyConfig {
  const opts = { ...DEFAULT_OPTS, ...options };
  const next: AssemblyConfig = { ...config };

  // 1) Watermark — set logo URL + brand name as text fallback
  if (opts.applyWatermark) {
    const existingWm: WatermarkConfig | undefined = config.watermark;
    next.watermark = {
      enabled: true,
      text: kit.brand_name || existingWm?.text || '',
      position: existingWm?.position ?? 'bottom-right',
      size: existingWm?.size ?? 'medium',
      opacity: existingWm?.opacity ?? 0.75,
    };
  }

  // 2) Text overlays — recolor + refont (preserve text + position + animation)
  if ((opts.applyTextColors || opts.applyFonts) && Array.isArray(config.globalTextOverlays)) {
    const headingFont = kit.font_pairing?.heading;
    const primary = kit.primary_color;
    next.globalTextOverlays = config.globalTextOverlays.map((overlay): GlobalTextOverlay => ({
      ...overlay,
      ...(opts.applyTextColors && primary ? { color: primary } : {}),
      ...(opts.applyFonts && headingFont ? { fontFamily: headingFont } : {}),
    }));
  }

  // 3) Color grading — only override if currently 'none' (don't stomp explicit user choice)
  if (opts.applyColorGrading) {
    const mapped = moodToColorGrading(kit.mood);
    if (mapped && (config.colorGrading === 'none' || !config.colorGrading)) {
      next.colorGrading = mapped;
    }
  }

  return next;
}

/** Hook providing the apply function in a React-friendly callback. */
export function useBrandKitAutoApply() {
  const apply = useCallback(
    (config: AssemblyConfig, kit: BrandKit, options?: BrandApplyOptions) =>
      applyBrandKitToAssembly(config, kit, options),
    []
  );
  return { apply };
}
