/**
 * V457 — Preclip-Crop enthält Dispatch-Box.
 *
 * Der Preclip-Ausschnitt muss den gepaddeten Dispatch-Kasten vollständig
 * enthalten. Die Projektion ist deterministisch (Intervallprojektion),
 * idempotent und wird auf der finalen Integer-Geometrie verifiziert.
 */
import { describe, it, expect } from "vitest";
import {
  computeMouthCenteredCrop,
  projectCropToContain,
  normalizeContainBox,
} from "../computeMouthCenteredCrop";

const contains = (
  c: { x: number; y: number; size: number },
  b: [number, number, number, number],
) => c.x <= b[0] && c.y <= b[1] && c.x + c.size >= b[2] && c.y + c.size >= b[3];

describe("V457 projectCropToContain", () => {
  it("repariert die exakte Produktionsgeometrie der Szene be60d106 (7px nach oben)", () => {
    const target: [number, number, number, number] = [219, 149, 302, 258];
    const r = projectCropToContain({ x: 185, y: 156, size: 153 }, target, 1284, 718);
    expect(r.containsTarget).toBe(true);
    expect(r.reason).toBe("projected");
    expect(r.shiftPx).toEqual({ x: 0, y: -7 });
    expect(r.sizeGrown).toBe(false);
    expect(r.sizeGrownPx).toBe(0);
    expect(r.crop).toEqual({ x: 185, y: 149, size: 153 });
    expect(contains(r.crop, target)).toBe(true);
  });

  it("ist idempotent: enthält der Crop das Target bereits, bewegt sich nichts", () => {
    const target: [number, number, number, number] = [219, 149, 302, 258];
    const once = projectCropToContain({ x: 185, y: 149, size: 153 }, target, 1284, 718);
    expect(once.shiftPx).toEqual({ x: 0, y: 0 });
    expect(once.sizeGrown).toBe(false);
    expect(once.reason).toBe("already_contained");

    const twice = projectCropToContain(once.crop, target, 1284, 718);
    expect(twice.crop).toEqual(once.crop);
    expect(twice.shiftPx).toEqual({ x: 0, y: 0 });
    expect(twice.reason).toBe("already_contained");
  });

  it("lässt die Größe genau einmal wachsen, wenn das Target größer als der Crop ist", () => {
    const target: [number, number, number, number] = [200, 100, 400, 340];
    const r = projectCropToContain({ x: 210, y: 150, size: 160 }, target, 1284, 718);
    expect(r.sizeGrown).toBe(true);
    expect(r.crop.size).toBe(240);
    expect(r.sizeGrownPx).toBe(80);
    expect(contains(r.crop, target)).toBe(true);
    const again = projectCropToContain(r.crop, target, 1284, 718);
    expect(again.sizeGrown).toBe(false);
    expect(again.crop).toEqual(r.crop);
  });

  it("Containment gilt auf den finalen Integer-Koordinaten", () => {
    const target: [number, number, number, number] = [11, 13, 97, 121];
    const r = projectCropToContain({ x: 40.6, y: 60.4, size: 110.2 }, target, 640, 360);
    expect(Number.isInteger(r.crop.x)).toBe(true);
    expect(Number.isInteger(r.crop.y)).toBe(true);
    expect(Number.isInteger(r.crop.size)).toBe(true);
    expect(r.containsTarget).toBe(true);
    expect(contains(r.crop, target)).toBe(true);
  });

  it("Impossible-Case: containBox ragt über die Plate hinaus → kein Maskieren", () => {
    const target: [number, number, number, number] = [600, 100, 900, 300];
    const r = projectCropToContain({ x: 500, y: 100, size: 200 }, target, 800, 400);
    expect(r.containsTarget).toBe(false);
    expect(r.reason).toBe("contain_box_outside_plate");
    expect(r.crop).toEqual({ x: 500, y: 100, size: 200 });
    expect(r.shiftPx).toEqual({ x: 0, y: 0 });
  });

  it("Impossible-Case: containBox größer als die kurze Plate-Kante", () => {
    const target: [number, number, number, number] = [10, 0, 700, 360];
    const r = projectCropToContain({ x: 0, y: 0, size: 360 }, target, 1280, 360);
    expect(r.containsTarget).toBe(false);
    expect(r.reason).toBe("contain_box_outside_plate");
  });

  it("normalizeContainBox weist degenerierte Kästen zurück", () => {
    expect(normalizeContainBox(null)).toBeNull();
    expect(normalizeContainBox([10, 10, 10, 40])).toBeNull();
    expect(normalizeContainBox([1.4, 2.6, 30.2, 40.7])).toEqual([1, 3, 30, 41]);
  });
});

describe("V457 computeMouthCenteredCrop mit containBox", () => {
  it("liefert ohne containBox unveränderte Geometrie (Regression)", () => {
    const base = computeMouthCenteredCrop({
      face: { bbox: [500, 200, 700, 500], center: [600, 350], mouth: [600, 440] },
      plateWidth: 1284,
      plateHeight: 718,
    });
    expect(base.containsTarget).toBeNull();
    expect(base.containReason).toBe("no_contain_box");
    expect(base.shiftPx).toEqual({ x: 0, y: 0 });
    expect(base.sizeGrown).toBe(false);
  });

  it("enthält den gepaddeten Dispatch-Kasten und bleibt mundnah", () => {
    const face: [number, number, number, number] = [225, 155, 296, 252];
    const containBox: [number, number, number, number] = [219, 149, 302, 258];
    const withBox = computeMouthCenteredCrop({
      face: { bbox: face, center: [260, 203], mouth: [261, 232] },
      plateWidth: 1284,
      plateHeight: 718,
      containBox,
    });
    expect(withBox.containsTarget).toBe(true);
    expect(contains(withBox.crop, containBox)).toBe(true);
  });

  it("Mund-Anker am oberen Plate-Rand liefert weiterhin gültigen Crop", () => {
    const containBox: [number, number, number, number] = [40, 0, 180, 130];
    const r = computeMouthCenteredCrop({
      face: { bbox: [46, 2, 174, 124], center: [110, 63], mouth: [110, 100] },
      plateWidth: 640,
      plateHeight: 360,
      containBox,
    });
    expect(r.containsTarget).toBe(true);
    expect(r.crop.x).toBeGreaterThanOrEqual(0);
    expect(r.crop.y).toBeGreaterThanOrEqual(0);
    expect(r.crop.x + r.crop.size).toBeLessThanOrEqual(640);
    expect(r.crop.y + r.crop.size).toBeLessThanOrEqual(360);
    expect(contains(r.crop, containBox)).toBe(true);
  });
});
