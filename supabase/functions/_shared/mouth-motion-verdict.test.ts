import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  decodePngLumaGrid,
  normaliseFrameOutput,
  MOVED_MIN_SCORE,
} from "./mouth-motion-verdict.ts";
import { encode as encodePng } from "npm:fast-png@6.2.0";
import { awsFrameProbeAvailable, extractStillUrl } from "./aws-frame-probe.ts";

Deno.test("normaliseFrameOutput accepts string, array and FileOutput shapes", () => {
  assertEquals(normaliseFrameOutput("https://cdn/x.jpg"), "https://cdn/x.jpg");
  assertEquals(normaliseFrameOutput(["https://cdn/a.jpg"]), "https://cdn/a.jpg");
  assertEquals(normaliseFrameOutput({ url: () => "https://cdn/b.jpg" }), "https://cdn/b.jpg");
  assertEquals(normaliseFrameOutput({ url: "https://cdn/c.jpg" }), "https://cdn/c.jpg");
  assertEquals(normaliseFrameOutput(null), null);
  assertEquals(normaliseFrameOutput({ url: "not-a-url" }), null);
});

Deno.test("extractStillUrl reads every Remotion Lambda still response shape", () => {
  assertEquals(extractStillUrl({ output: "https://s3/a.png" }), "https://s3/a.png");
  assertEquals(extractStillUrl({ url: "https://s3/b.png" }), "https://s3/b.png");
  assertEquals(extractStillUrl({ publicUrl: "https://s3/c.png" }), "https://s3/c.png");
  assertEquals(extractStillUrl({ errorMessage: "boom" }), null);
  assertEquals(extractStillUrl(null), null);
});

Deno.test("awsFrameProbeAvailable requires AWS creds + serve url", () => {
  const full: Record<string, string> = {
    AWS_ACCESS_KEY_ID: "a",
    AWS_SECRET_ACCESS_KEY: "b",
    REMOTION_SERVE_URL: "https://serve",
  };
  assert(awsFrameProbeAvailable((n) => full[n]));
  assert(!awsFrameProbeAvailable((n) => ({ ...full, REMOTION_SERVE_URL: "" })[n]));
  assert(!awsFrameProbeAvailable(() => undefined));
});

Deno.test("v347 guard: no Replicate/lucataco in the lip-sync frame path", async () => {
  const files = [
    "./mouth-motion-verdict.ts",
    "./aws-frame-probe.ts",
  ];
  for (const f of files) {
    const src = await Deno.readTextFile(new URL(f, import.meta.url));
    // Comments may mention the ban; executable references must not exist.
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "")
      .replace(/^\s*\*.*$/gm, "");
    assert(!code.includes("lucataco"), `${f} must not reference lucataco`);
    assert(!code.includes("api.replicate.com"), `${f} must not call api.replicate.com`);
    assert(!code.includes("REPLICATE_API_KEY"), `${f} must not read a Replicate credential`);
  }
});

Deno.test("motion threshold stays a positive luminance delta", () => {
  assert(MOVED_MIN_SCORE > 0 && MOVED_MIN_SCORE < 20);
});

Deno.test("v352 Edge-safe PNG decoder samples luminance without native codecs", () => {
  const width = 4;
  const height = 4;
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = 255;
    data[i * 4 + 1] = 0;
    data[i * 4 + 2] = 0;
    data[i * 4 + 3] = 255;
  }
  const png = encodePng({ width, height, data, channels: 4, depth: 8 });
  const grid = decodePngLumaGrid(png, { x: 0, y: 0, w: 1, h: 1 });
  assertEquals(grid.length, 48 * 32);
  assert(Math.abs(grid[0] - 54.213) < 0.01);
});

Deno.test("v352 guard: webhook motion probe must not import native ImageScript", async () => {
  const src = await Deno.readTextFile(new URL("./mouth-motion-verdict.ts", import.meta.url));
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  assert(!code.toLowerCase().includes("imagescript"));
  assert(code.includes('npm:fast-png@6.2.0'));
});

Deno.test("v348 still payload carries the Remotion version", async () => {
  const src = await Deno.readTextFile(new URL("./aws-frame-probe.ts", import.meta.url));
  assert(src.includes("version: REMOTION_STILL_VERSION"), "still payload must send `version`");
  assert(src.includes("x-amz-function-error"), "lambda answers must be logged with forensics");
});

Deno.test("v348 mux gate blocks only measured `static` passes", async () => {
  const src = await Deno.readTextFile(
    new URL("../render-sync-segments-audio-mux/index.ts", import.meta.url),
  );
  // Extract the gate predicate area and assert the blocking condition.
  assert(
    src.includes("if (staticPasses.length > 0 && !forceRemux)"),
    "only static passes may block the mux",
  );
  assert(
    !src.includes("if (unverifiedPasses.length > 0 && !forceRemux)"),
    "an unavailable measurement must never block the mux",
  );
  assert(
    !src.includes("motion_verdict_unavailable"),
    "the `measurement outage` failure code must be gone",
  );
});

