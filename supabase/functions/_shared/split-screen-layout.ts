/**
 * split-screen-layout.ts — V445
 *
 * Pure classifier for the anti-split-screen contract (Anchor Audit v9).
 *
 * A quad/triptych "panel" plate puts every face on the SAME baseline. The
 * previous detector required all three signals simultaneously
 * (y-spread <= 5%, gap-spread <= 8%, height-spread <= 10%) and therefore
 * missed the production S11 panel plate, whose face centers were
 * `176/283, 486/278, 804/285, 1135/276` (y-spread 1.2%, gap-spread ~3.3%,
 * but height-spread above the old 10% bound).
 *
 * V447: N=2 wird zusätzlich über die Spaltenmitten-Regel erkannt.
 *
 * V445 rule (N >= 3):
 *   ySpreadPct <= 5%  AND  (xGapSpreadPct <= 15%  OR  heightSpreadPct <= 15%)
 *
 * Everything else about the gate is unchanged: a hit blocks dispatch before
 * any provider call and takes the existing idempotent v117 refund path.
 */

export interface SplitScreenBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SplitScreenMetrics {
  faces: number;
  ySpreadPct: number;
  gapSpreadPct: number;
  hSpreadPct: number;
}

export interface SplitScreenVerdict {
  isSplitScreen: boolean;
  metrics: SplitScreenMetrics | null;
  /** Stable, human readable reason string used as the block error class detail. */
  reason: string | null;
}

export const SPLIT_SCREEN_THRESHOLDS = {
  /** Faces sit on the same baseline. */
  ySpreadPct: 0.05,
  /** Evenly distributed panels. */
  gapSpreadPct: 0.15,
  /** Equally sized panels. */
  hSpreadPct: 0.15,
  /** V447 — N=2: maximale Abweichung von den Spaltenmitten W/4 bzw. 3W/4. */
  twoPanelColumnTolerancePct: 0.06,
} as const;

export function classifySplitScreenLayout(
  boxes: Array<SplitScreenBox | null | undefined>,
  plateWidth: number,
  plateHeight: number,
): SplitScreenVerdict {
  const empty: SplitScreenVerdict = { isSplitScreen: false, metrics: null, reason: null };
  if (!Array.isArray(boxes) || boxes.length < 2) return empty;
  if (!Number.isFinite(plateWidth) || !Number.isFinite(plateHeight)) return empty;
  if (plateWidth <= 0 || plateHeight <= 0) return empty;

  const valid = boxes.filter((b): b is SplitScreenBox =>
    !!b &&
    Number.isFinite(b.x) && Number.isFinite(b.y) &&
    Number.isFinite(b.width) && Number.isFinite(b.height) &&
    b.width > 0 && b.height > 0
  );
  // Partial detection is not evidence of a panel layout — fail open here,
  // the v117 coverage gate owns the "faces missing" case.
  if (valid.length < 2 || valid.length !== boxes.length) return empty;

  const centers = valid
    .map((b) => ({ cx: b.x + b.width / 2, cy: b.y + b.height / 2, h: b.height }))
    .sort((a, b) => a.cx - b.cx);

  const ys = centers.map((c) => c.cy);
  const yMean = ys.reduce((a, b) => a + b, 0) / ys.length;
  const ySpreadPct = Math.max(...ys.map((y) => Math.abs(y - yMean))) / plateHeight;

  const gaps: number[] = [];
  for (let i = 1; i < centers.length; i++) gaps.push(centers[i].cx - centers[i - 1].cx);
  const gapMean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  const gapSpreadPct = gapMean > 0
    ? Math.max(...gaps.map((g) => Math.abs(g - gapMean))) / gapMean
    : 1;

  const hs = centers.map((c) => c.h);
  const hMean = hs.reduce((a, b) => a + b, 0) / hs.length;
  const hSpreadPct = hMean > 0
    ? Math.max(...hs.map((h) => Math.abs(h - hMean))) / hMean
    : 1;

  const metrics: SplitScreenMetrics = {
    faces: centers.length,
    ySpreadPct,
    gapSpreadPct,
    hSpreadPct,
  };

  const sameBaseline = ySpreadPct <= SPLIT_SCREEN_THRESHOLDS.ySpreadPct;

  // V447 — Zwei-Personen-Collage. Bei N=2 ist `gapSpreadPct` per Definition 0
  // (ein einziger Abstand) und damit kein Signal. Der klassische Zweispalter
  // erkennt sich daran, dass beide Gesichter exakt in den Spaltenmitten
  // (W/4 und 3W/4) sitzen, gleich groß sind und auf einer Linie liegen.
  if (centers.length === 2) {
    const idealLeft = plateWidth * 0.25;
    const idealRight = plateWidth * 0.75;
    const leftOff = Math.abs(centers[0].cx - idealLeft) / plateWidth;
    const rightOff = Math.abs(centers[1].cx - idealRight) / plateWidth;
    const columnAligned = leftOff <= SPLIT_SCREEN_THRESHOLDS.twoPanelColumnTolerancePct &&
      rightOff <= SPLIT_SCREEN_THRESHOLDS.twoPanelColumnTolerancePct;
    const equalHeights = hSpreadPct <= SPLIT_SCREEN_THRESHOLDS.hSpreadPct;
    if (sameBaseline && columnAligned && equalHeights) {
      return {
        isSplitScreen: true,
        metrics,
        reason:
          `split_screen_layout(faces=2, ` +
          `y_spread=${(ySpreadPct * 100).toFixed(1)}%, ` +
          `col_off=${(Math.max(leftOff, rightOff) * 100).toFixed(1)}%, ` +
          `h_spread=${(hSpreadPct * 100).toFixed(1)}%)`,
      };
    }
    return { isSplitScreen: false, metrics, reason: null };
  }

  const evenlySpaced = gapSpreadPct <= SPLIT_SCREEN_THRESHOLDS.gapSpreadPct;
  const equallySized = hSpreadPct <= SPLIT_SCREEN_THRESHOLDS.hSpreadPct;

  if (sameBaseline && (evenlySpaced || equallySized)) {
    return {
      isSplitScreen: true,
      metrics,
      reason:
        `split_screen_layout(faces=${metrics.faces}, ` +
        `y_spread=${(ySpreadPct * 100).toFixed(1)}%, ` +
        `gap_spread=${(gapSpreadPct * 100).toFixed(1)}%, ` +
        `h_spread=${(hSpreadPct * 100).toFixed(1)}%)`,
    };
  }
  return { isSplitScreen: false, metrics, reason: null };
}
