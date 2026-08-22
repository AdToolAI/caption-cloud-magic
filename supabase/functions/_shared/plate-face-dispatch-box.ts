/**
 * plate-face-dispatch-box.ts — V445
 *
 * Single source of truth for the padded plate-native face box that is
 * dispatched to the lip-sync provider AND used as the geometry source for
 * the pre-clip crop.
 *
 * Before V445 the dispatch box was padded inline in `compose-dialog-segments`
 * while `renderPassFacePreclip` sized its square crop from the *unpadded*
 * bbox. The crop could therefore be smaller than the box the containment
 * gate later checks (production S11: target 212x281 vs. crop 272x272 →
 * `preclip_identity_geometry_mismatch`). Both now derive from this function,
 * i.e. from the SAME measurement of the SAME plate.
 *
 * Padding values are unchanged (8% horizontal, 6% top, 4% bottom).
 */

export type PlateBox = [number, number, number, number];

export function buildDispatchFaceBox(
  platePassBox: unknown,
  dims: { width: number; height: number } | null | undefined,
): PlateBox | null {
  if (!dims || !Number.isFinite(dims.width) || !Number.isFinite(dims.height)) return null;
  if (dims.width <= 0 || dims.height <= 0) return null;
  if (!Array.isArray(platePassBox) || platePassBox.length !== 4) return null;

  const [bx1, by1, bx2, by2] = (platePassBox as unknown[]).map((n) => Number(n));
  if (![bx1, by1, bx2, by2].every((n) => Number.isFinite(n))) return null;

  const w = Math.max(1, bx2 - bx1);
  const h = Math.max(1, by2 - by1);
  const padX = Math.max(2, Math.round(w * 0.08));
  const padTop = Math.max(2, Math.round(h * 0.06));
  const padBottom = Math.max(2, Math.round(h * 0.04));

  const x1 = Math.max(0, Math.round(bx1 - padX));
  const y1 = Math.max(0, Math.round(by1 - padTop));
  const x2 = Math.min(dims.width, Math.round(bx2 + padX));
  const y2 = Math.min(dims.height, Math.round(by2 + padBottom));

  if (!(x2 > x1 + 4 && y2 > y1 + 4)) return null;
  return [x1, y1, x2, y2];
}

/** Stable signature used to invalidate a cached crop measured on other geometry. */
export function faceBoxSignature(box: unknown): string | null {
  if (!Array.isArray(box) || box.length !== 4) return null;
  const nums = (box as unknown[]).map((n) => Math.round(Number(n)));
  if (!nums.every((n) => Number.isFinite(n))) return null;
  return nums.join(",");
}

/**
 * Strip credentials/signatures from a URL so it can be persisted as a
 * measurement-source label in telemetry.
 */
export function sanitizeMeasureSource(url: unknown): string | null {
  const raw = typeof url === "string" ? url.trim() : "";
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return `${u.origin}${u.pathname}`;
  } catch {
    const cut = raw.split("?")[0];
    return cut.length > 0 ? cut : null;
  }
}
