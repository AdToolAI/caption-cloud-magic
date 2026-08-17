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

/**
 * Universal Content Creator subtitle placement — the SINGLE source of truth
 * shared by `SubtitleLayer` (segment renderer), `PrecisionSubtitleOverlay`
 * (word-level renderer) and the styling panel preview, so switching the
 * animation never moves the subtitle vertically.
 */
export const UCC_SUBTITLE_TOP_INSET = '8%';
export const UCC_SUBTITLE_BOTTOM_INSET = '10%';
export const UCC_SUBTITLE_MAX_WIDTH = '84%';

export type UccSubtitlePosition = 'top' | 'center' | 'bottom';

/**
 * Vertical placement inside a flex container with `flexDirection: column`
 * (Remotion's `AbsoluteFill` default). Horizontal centering must ALWAYS come
 * from `alignItems: 'center'` — never from `justifyContent`.
 */
export function getUccSubtitleFlexPlacement(position?: UccSubtitlePosition) {
  switch (position) {
    case 'top':
      return { justifyContent: 'flex-start' as const, paddingTop: UCC_SUBTITLE_TOP_INSET, paddingBottom: 0 };
    case 'center':
      return { justifyContent: 'center' as const, paddingTop: 0, paddingBottom: 0 };
    default:
      return { justifyContent: 'flex-end' as const, paddingTop: 0, paddingBottom: UCC_SUBTITLE_BOTTOM_INSET };
  }
}

/** Absolute-positioned variant (used by the word-level overlay). */
export function getUccSubtitleAbsolutePlacement(position?: UccSubtitlePosition): {
  style: { top?: string; bottom?: string; left: string };
  transform: string;
} {
  switch (position) {
    case 'top':
      return { style: { top: UCC_SUBTITLE_TOP_INSET, left: '50%' }, transform: 'translateX(-50%)' };
    case 'center':
      return { style: { top: '50%', left: '50%' }, transform: 'translate(-50%, -50%)' };
    default:
      return { style: { bottom: UCC_SUBTITLE_BOTTOM_INSET, left: '50%' }, transform: 'translateX(-50%)' };
  }
}

/** Version marker — bump on every subtitle-related change to verify bundle freshness */
export const SUBTITLE_RENDER_VERSION = 'v2026-08-17-ucc-subtitle-position-fix';

