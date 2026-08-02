import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

Deno.test("v395 — exact preclip mouth gate fails closed", async () => {
  const gate = await Deno.readTextFile(new URL("./syncso-face-gate.ts", import.meta.url));
  assert(gate.includes('? { ok: false, code: "probe_unavailable", reason: "exact_preclip_probe_unavailable:no_aws_credentials" }'));
  assert(gate.includes('? { ok: false, code: "probe_unavailable", reason: "exact_preclip_probe_unavailable:no_video_url" }'));
  assert(gate.includes("timestamp: 0.05"));
});

Deno.test("v395 — plate-only diagnostics remain non-blocking", async () => {
  const gate = await Deno.readTextFile(new URL("./syncso-face-gate.ts", import.meta.url));
  assertEquals(gate.includes(': { ok: true, code: "skipped", reason: "no_aws_credentials" }'), true);
  assertEquals(gate.includes(': { ok: true, code: "skipped", reason: "no_video_url" }'), true);
});

Deno.test("v395 — webhook terminal passthrough uses central failure helper", async () => {
  const webhook = await Deno.readTextFile(new URL("../sync-so-webhook/index.ts", import.meta.url));
  assert(webhook.includes("await failLipSync({"));
  assert(webhook.includes('dialog_shots.status="rendering"'));
});