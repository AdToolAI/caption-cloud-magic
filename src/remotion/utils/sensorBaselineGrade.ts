/**
 * Sensor-Baseline-Grade — DEAKTIVIERT (Kundenentscheidung 29.07.2026).
 *
 * Rohtreue hat Vorrang: UCC- und Director's-Cut-Export rendern pixelnah
 * zum Upload. Grade/Filter greifen nur, wenn der Kunde sie im Director's
 * Cut aktiv setzt (Mood/Grade/FX-Regler).
 *
 * Datei bleibt als History-Anker liegen. Nicht reaktivieren, ohne den
 * Kunden explizit zu fragen.
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
