/**
 * Datenmodell-Helfer für die Overlay-Ebene des Director's Cut (v407).
 * Enthält Standard-Boxen je Bausteinart und die verlustfreie Migration
 * von Alt-Overlays (Rasterposition + Größenstufe) auf das neue Modell.
 */
import type {
  OverlayBox,
  OverlayKind,
  OverlayStyle,
  TextOverlay,
} from '@/types/directors-cut';

/** Relative Schriftgrade der Alt-Stufen (bezogen auf Canvas-Breite, 1080px-Referenz). */
export const LEGACY_FONT_SIZE_REL: Record<string, number> = {
  sm: 24 / 1080,
  md: 36 / 1080,
  lg: 48 / 1080,
  xl: 72 / 1080,
};

export const DEFAULT_OVERLAY_BOX: Record<OverlayKind, OverlayBox> = {
  text: { x: 0.1, y: 0.42, w: 0.8, h: 0.16 },
  lowerThird: { x: 0.06, y: 0.68, w: 0.5, h: 0.14 },
  banner: { x: 0, y: 0.8, w: 1, h: 0.12 },
  badge: { x: 0.72, y: 0.08, w: 0.2, h: 0.2 },
  card: { x: 0.08, y: 0.14, w: 0.42, h: 0.24 },
  cta: { x: 0.3, y: 0.78, w: 0.4, h: 0.11 },
  ticker: { x: 0, y: 0.9, w: 1, h: 0.08 },
  logo: { x: 0.82, y: 0.05, w: 0.13, h: 0.09 },
  callout: { x: 0.5, y: 0.3, w: 0.36, h: 0.1 },
  quote: { x: 0.12, y: 0.28, w: 0.76, h: 0.34 },
  progress: { x: 0, y: 0.96, w: 1, h: 0.02 },
};

/** Position aus dem Alt-Raster in eine relative Box übersetzen. */
export function boxFromLegacyPosition(overlay: TextOverlay): OverlayBox {
  const w = 0.7;
  const h = 0.14;
  if (overlay.position === 'custom' && overlay.customPosition) {
    return {
      x: Math.min(1 - w, Math.max(0, overlay.customPosition.x / 100 - w / 2)),
      y: Math.min(1 - h, Math.max(0, overlay.customPosition.y / 100 - h / 2)),
      w,
      h,
    };
  }
  const map: Record<string, [number, number]> = {
    top: [0.5, 0.1],
    center: [0.5, 0.5],
    bottom: [0.5, 0.9],
    topLeft: [0.05 + w / 2, 0.1],
    topRight: [0.95 - w / 2, 0.1],
    centerLeft: [0.05 + w / 2, 0.5],
    centerRight: [0.95 - w / 2, 0.5],
    bottomLeft: [0.05 + w / 2, 0.9],
    bottomRight: [0.95 - w / 2, 0.9],
  };
  const [cx, cy] = map[overlay.position] ?? [0.5, 0.5];
  return {
    x: Math.min(1 - w, Math.max(0, cx - w / 2)),
    y: Math.min(1 - h, Math.max(0, cy - h / 2)),
    w,
    h,
  };
}

export function resolveOverlayStyle(style: OverlayStyle): Required<
  Pick<OverlayStyle, 'color' | 'fontFamily'>
> &
  OverlayStyle {
  return {
    ...style,
    color: style.color || '#ffffff',
    fontFamily: style.fontFamily || 'Inter, sans-serif',
  };
}

/** Relativer Schriftgrad eines Overlays (fontSizeRel schlägt die Alt-Stufe). */
export function overlayFontRel(overlay: TextOverlay): number {
  if (typeof overlay.style.fontSizeRel === 'number' && overlay.style.fontSizeRel > 0) {
    return overlay.style.fontSizeRel;
  }
  return LEGACY_FONT_SIZE_REL[overlay.style.fontSize] ?? LEGACY_FONT_SIZE_REL.md;
}

/**
 * Hebt ein Overlay verlustfrei auf das v407-Modell an.
 * Bereits migrierte Overlays bleiben unverändert.
 */
export function upgradeOverlay(overlay: TextOverlay): TextOverlay {
  const kind: OverlayKind = overlay.kind ?? 'text';
  const box = overlay.box ?? (kind === 'text' ? boxFromLegacyPosition(overlay) : DEFAULT_OVERLAY_BOX[kind]);
  return {
    ...overlay,
    kind,
    box,
    enter: overlay.enter ?? overlay.animation,
    exit: overlay.exit ?? 'none',
    style: {
      ...overlay.style,
      fontSizeRel: overlay.style.fontSizeRel ?? LEGACY_FONT_SIZE_REL[overlay.style.fontSize] ?? LEGACY_FONT_SIZE_REL.md,
      align: overlay.style.align ?? 'center',
      opacity: overlay.style.opacity ?? 1,
    },
  };
}

export function upgradeOverlays(overlays: TextOverlay[] = []): TextOverlay[] {
  return overlays.map(upgradeOverlay);
}

/** True, wenn das Overlay über den neuen Grafik-Renderer laufen muss. */
export function isGraphicOverlay(overlay: TextOverlay): boolean {
  return Boolean((overlay.kind && overlay.kind !== 'text') || overlay.box);
}
