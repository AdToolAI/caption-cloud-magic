import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { verifyFaceBeforeDispatch } from "./syncso-face-gate.ts";
import { mouthRectFromPass } from "./mouth-motion-verdict.ts";

Deno.test("v395 — exact preclip mouth gate fails closed without AWS", async () => {
  const previousAccess = Deno.env.get("AWS_ACCESS_KEY_ID");
  const previousSecret = Deno.env.get("AWS_SECRET_ACCESS_KEY");
  try {
    Deno.env.delete("AWS_ACCESS_KEY_ID");
    Deno.env.delete("AWS_SECRET_ACCESS_KEY");
    const result = await verifyFaceBeforeDispatch({
      videoUrl: "https://example.test/preclip.mp4",
      frameNumber: 1,
      coord: [360, 360],
      requireMouth: true,
    });
    assertEquals(result.ok, false);
    assertEquals(result.code, "probe_unavailable");
    assert(result.reason?.startsWith("exact_preclip_probe_unavailable:"));
  } finally {
    if (previousAccess) Deno.env.set("AWS_ACCESS_KEY_ID", previousAccess);
    if (previousSecret) Deno.env.set("AWS_SECRET_ACCESS_KEY", previousSecret);
  }
});

Deno.test("v395 — plate-only diagnostic remains non-blocking without AWS", async () => {
  const previousAccess = Deno.env.get("AWS_ACCESS_KEY_ID");
  const previousSecret = Deno.env.get("AWS_SECRET_ACCESS_KEY");
  try {
    Deno.env.delete("AWS_ACCESS_KEY_ID");
    Deno.env.delete("AWS_SECRET_ACCESS_KEY");
    const result = await verifyFaceBeforeDispatch({
      videoUrl: "https://example.test/plate.mp4",
      frameNumber: 1,
      coord: [100, 100],
      requireMouth: false,
    });
    assertEquals(result.ok, true);
    assertEquals(result.code, "skipped");
  } finally {
    if (previousAccess) Deno.env.set("AWS_ACCESS_KEY_ID", previousAccess);
    if (previousSecret) Deno.env.set("AWS_SECRET_ACCESS_KEY", previousSecret);
  }
});

Deno.test("v395 — persisted normalized mouth geometry is authoritative", () => {
  const rect = mouthRectFromPass({
    mouth_rect: { x: 0.31, y: 0.58, w: 0.24, h: 0.16 },
    preclip_crop: { x: 100, y: 100, size: 300 },
  });
  assertEquals(rect, { x: 0.31, y: 0.58, w: 0.24, h: 0.16 });
});

Deno.test("v395 — webhook terminal passthrough uses central failure helper", async () => {
  const webhook = await Deno.readTextFile(new URL("../sync-so-webhook/index.ts", import.meta.url));
  assert(webhook.includes("await failLipSync({"));
  assert(webhook.includes('dialog_shots.status="rendering"'));
});