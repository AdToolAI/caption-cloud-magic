/**
 * Shared subtitle rendering constants — used by both
 * DirectorsCutVideo (export) and DirectorsCutPreviewPlayer (studio preview).
 * Keep in sync to avoid visual discrepancies.
 */

export const SUBTITLE_FONT_SIZE_MAP: Record<string, string> = {
  small: '28px',
  medium: '40px',
  large: '52px',
  xl: '68px',
};

export const SUBTITLE_DEFAULT_BG = 'rgba(0,0,0,0.75)';
export const SUBTITLE_DEFAULT_COLOR = '#FFFFFF';
export const SUBTITLE_DEFAULT_FONT_FAMILY = 'Inter';
export const SUBTITLE_DEFAULT_FONT_SIZE = 'medium';
export const SUBTITLE_BOTTOM_PADDING = '12%';
export const SUBTITLE_TOP_PADDING = '8%';
export const SUBTITLE_Z_INDEX = 200;

/** Version marker — bump on every subtitle-related change to verify bundle freshness */
export const SUBTITLE_RENDER_VERSION = 'v2026-04-13b';
