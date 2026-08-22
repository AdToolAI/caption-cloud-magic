import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { framingSuffixFor } from "./anchor-min-face-size.ts";
import { classifyAnchorSeams } from "./anchor-seam-probe.ts";
import { detectGridIntent } from "./detectGridIntent.ts";

Deno.test("v454: negative grid language never opts into a grid", () => {
  const prompt = "One shared environment. NO split-screen, no grid layout, no 2x2 grid, no collage.";
  assertEquals(detectGridIntent(prompt).gridRequested, false);
});

Deno.test("v454: explicit customer grid requests remain supported", () => {
  assertEquals(detectGridIntent("Compose the four portraits as a 2x2 grid layout."), {
    gridRequested: true,
    gridStyle: "2x2",
  });
});

Deno.test("v454: four-person face-size retry contains no panel vocabulary", () => {
  const suffix = framingSuffixFor("tight_ensemble", 4).toLowerCase();
  for (const forbidden of ["2x2", "2×2", "quadrant", "cell", "panel", "grid"]) {
    assertEquals(suffix.includes(forbidden), false);
  }
});

function image(width: number, height: number, pixel: (x: number, y: number) => number): {
  width: number;
  height: number;
  bitmap: Uint8Array;
} {
  const bitmap = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const value = pixel(x, y);
      const offset = (y * width + x) * 4;
      bitmap[offset] = value;
      bitmap[offset + 1] = value;
      bitmap[offset + 2] = value;
      bitmap[offset + 3] = 255;
    }
  }
  return { width, height, bitmap };
}

Deno.test("v454: dark 2x2 divider seams are blocked", () => {
  const fixture = image(120, 80, (x, y) => {
    if (Math.abs(x - 60) <= 1 || Math.abs(y - 40) <= 1) return 0;
    const left = x < 60;
    const top = y < 40;
    return left === top ? 225 : 90;
  });
  assertEquals(classifyAnchorSeams(fixture).isPanel, true);
});

Deno.test("v454: continuous shared scene is not a seam layout", () => {
  const fixture = image(120, 80, (x, y) => Math.round(60 + x * 0.8 + y * 0.4));
  assertEquals(classifyAnchorSeams(fixture).isPanel, false);
});