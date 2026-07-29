/**
 * Sensor-Baseline-Grade — dezenter Micro-Contrast/Saturation, der bei ALLEN
 * Export-Renderpfaden auf Video-/Image-Backgrounds liegt.
 *
 * Zählt NICHT als Cinematic-FX (kein Mood/Grain/Vignette/KenBurns/Parallax/
 * Overlay/SceneFX) — sie ist Teil des Encode-Floors, damit UCC-Export und
 * Director's-Cut-Export nicht sichtbar auseinanderlaufen.
 *
 * Siehe:
 *   mem://architecture/render/global-export-quality-floor
 *   mem://architecture/video-composer/raw-media-invariant
 *
 * Preview: NICHT anwenden — die Live-Vorschau soll den echten Rohframe zeigen.
 */
export const SENSOR_BASELINE_GRADE_FILTER = 'contrast(1.03) saturate(1.05)';

/**
 * Reiht die Sensor-Baseline vor einen bestehenden CSS-`filter:`-String ein.
 * Leerer/undefined-Input → nur die Baseline. Verhindert doppelte Whitespace.
 */
export function prependSensorBaseline(existing?: string | null): string {
  const base = SENSOR_BASELINE_GRADE_FILTER;
  const extra = (existing ?? '').trim();
  return extra ? `${base} ${extra}` : base;
}
