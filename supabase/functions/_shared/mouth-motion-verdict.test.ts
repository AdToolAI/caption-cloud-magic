import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { normaliseFrameOutput, MOVED_MIN_SCORE } from "./mouth-motion-verdict.ts";
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
