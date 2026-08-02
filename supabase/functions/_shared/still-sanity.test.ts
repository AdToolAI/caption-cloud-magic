/**
 * v397 — Regressionstests: Nulltreffer vs. Messausfall.
 *
 * Belegter Produktionsfehler:
 *   face_gate_probe_unavailable:exact_preclip_face_probe_error:rekognition_zero_faces
 * Ursache 1: Rekognition meldete "0 Gesichter" als Ausfall.
 * Ursache 2: schwarze Probe-Stills wurden als Beweis für "kein Gesicht" gewertet.
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { encode as encodePng } from "npm:fast-png@6.2.0";
import { inspectStill, MIN_STILL_BYTES } from "./still-sanity.ts";

function pngResponse(bytes: Uint8Array): Response {
  return new Response(bytes, { status: 200, headers: { "content-type": "image/png" } });
}

function makePng(fill: (i: number) => [number, number, number], size = 96): Uint8Array {
  const data = new Uint8Array(size * size * 3);
  for (let i = 0; i < size * size; i++) {
    const [r, g, b] = fill(i);
    data[i * 3] = r;
    data[i * 3 + 1] = g;
    data[i * 3 + 2] = b;
  }
  return encodePng({ width: size, height: size, data, channels: 3, depth: 8 });
}

async function withFetch<T>(res: () => Response, fn: () => Promise<T>): Promise<T> {
  const orig = globalThis.fetch;
  globalThis.fetch = (() => Promise.resolve(res())) as typeof fetch;
  try {
    return await fn();
  } finally {
    globalThis.fetch = orig;
  }
}

Deno.test("v397: schwarzes Still ist ein Messausfall, kein 'kein Gesicht'", async () => {
  // Reines Schwarz komprimiert extrem gut — mit Rauschen unter der
  // Blank-Schwelle bleibt das PNG gross genug für den Bytecheck.
  const png = makePng((i) => {
    const n = i % 3; // stddev deutlich < MIN_LUMA_STDDEV
    return [n, n, n];
  }, 256);
  const out = await withFetch(() => pngResponse(png), () => inspectStill("https://s3/x.png"));
  assert(!out.usable, `expected unusable, got ${JSON.stringify(out)}`);
  assert(out.code === "still_black" || out.code === "still_too_small", out.code);
});

Deno.test("v397: Bild mit echtem Inhalt ist auswertbar", async () => {
  const png = makePng((i) => {
    const v = (i * 37) % 256;
    return [v, 255 - v, (v * 3) % 256];
  }, 256);
  const out = await withFetch(() => pngResponse(png), () => inspectStill("https://s3/y.png"));
  assertEquals(out.usable, true);
  assertEquals(out.code, "ok");
  assert((out.lumaStdDev ?? 0) > 3.5);
});

Deno.test("v397: winziges Still gilt als leer", async () => {
  const tiny = new Uint8Array(MIN_STILL_BYTES - 1);
  const out = await withFetch(() => pngResponse(tiny), () => inspectStill("https://s3/z.png"));
  assertEquals(out.usable, false);
  assertEquals(out.code, "still_too_small");
});

Deno.test("v397: HTTP-Fehler ist Ausfall, kein Befund", async () => {
  const out = await withFetch(
    () => new Response("nope", { status: 403 }),
    () => inspectStill("https://s3/forbidden.png"),
  );
  assertEquals(out.usable, false);
  assertEquals(out.code, "still_fetch_failed");
});

Deno.test("v397: Detector meldet Nulltreffer nicht mehr als Fehler", async () => {
  const src = await Deno.readTextFile(
    new URL("./face-detect-mediapipe.ts", import.meta.url),
  );
  // Der alte Ausfall-Zweig darf nicht zurückkehren.
  assert(
    !/error:\s*"rekognition_zero_faces"/.test(src),
    "zero faces must not be reported as an error again",
  );
  assert(/zeroFaces:\s*true/.test(src), "zeroFaces flag missing");
});

Deno.test("v397: Gate braucht Konsens für no_face und kennt still_blank", async () => {
  const src = await Deno.readTextFile(new URL("./syncso-face-gate.ts", import.meta.url));
  assert(/zeroCount >= 2/.test(src), "no_face must require two agreeing stills");
  assert(/"still_blank"/.test(src), "still_blank code missing");
  assert(/"probe_degraded"/.test(src), "probe_degraded code missing");
  assert(/inspectStill/.test(src), "gate must inspect stills before judging");
});
