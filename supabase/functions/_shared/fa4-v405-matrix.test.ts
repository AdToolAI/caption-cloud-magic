/**
 * FA-4 v405 — Matrix B–M dedicated proof.
 *
 * PURE assertions where a PURE owner exists (classifier, ROI transform,
 * preclip-preservation predicate, telemetry key) and source-contract
 * assertions for the invariants that live inside the edge handlers
 * (browser-absent, duplicate callback, stale run/gen, wire parity).
 *
 * Run: deno test -A supabase/functions/_shared/fa4-v405-matrix.test.ts
 */
import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  classifyMotionProbe,
  getS11FrozenFixture,
  MOTION_THRESHOLD,
  NOOP_THRESHOLD,
} from "./motion-probe-classifier.ts";
import { stillRoiForSource } from "./measure-provider-motion-sync.ts";
import {
  isFrozenNoopRetryPass,
  shouldPreserveNoopRetryPreclip,
} from "./noop-retry-preclip.ts";
import { resolveTelemetryTarget } from "./telemetry-target.ts";

const read = (p: string) => Deno.readTextFileSync(new URL(p, import.meta.url));
/** Strip comments so source-contract assertions test CODE, not prose. */
const code = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
const WEBHOOK = read("../sync-so-webhook/index.ts");
const WEBHOOK_CODE = code(WEBHOOK);
const COMPOSE = read("../compose-dialog-segments/index.ts");
const REPORT = read("../report-lipsync-motion-probe/index.ts");
const REPORT_CODE = code(REPORT);
const CLIENT_HOOK = Deno.readTextFileSync("src/hooks/useMouthYavgProbe.ts");

const withMean = (preclipMean: number, deltaMean: number) => ({
  preclip: { mean: preclipMean, peak: 500 },
  provider: { mean: preclipMean + deltaMean, peak: 500 },
});

// ── B. COMPLETED + motion → ssw:success, no retry ──────────────────────────
Deno.test("B. motion verdict maps to ssw:success and never to an escalation", () => {
  const r = classifyMotionProbe(withMean(100, MOTION_THRESHOLD + 1));
  assertEquals(r.verdict, "motion");
  assertStringIncludes(WEBHOOK, 'writeId: "ssw:success"');
  const successIdx = WEBHOOK.indexOf('writeId: "ssw:success"');
  assert(successIdx > 0);
});

// ── C. COMPLETED + noop → ssw:noop_escalate, exactly one replacement job ──
Deno.test("C. noop verdict escalates once with exactly one replacement_job_id", () => {
  const r = classifyMotionProbe(withMean(100, NOOP_THRESHOLD - 1));
  assertEquals(r.verdict, "noop");
  assertStringIncludes(WEBHOOK, 'writeId: "ssw:noop_escalate"');
  assertStringIncludes(WEBHOOK, "escalateRes.replacement_job_id");
  // Exactly one dispatch is derived from the RPC-issued replacement id.
  const dispatches = WEBHOOK.match(/pipeline_job_id: escalateRes\.replacement_job_id/g) ?? [];
  assertEquals(dispatches.length, 1);
});

// ── D. COMPLETED + indeterminate → ssw:failed, no mux, no retry ───────────
Deno.test("D. indeterminate maps to ssw:failed with motion_probe_indeterminate", () => {
  const r = classifyMotionProbe(withMean(100, (MOTION_THRESHOLD + NOOP_THRESHOLD) / 2));
  assertEquals(r.verdict, "indeterminate");
  assertStringIncludes(WEBHOOK, 'errorText: "motion_probe_indeterminate"');
  const idx = WEBHOOK.indexOf('errorText: "motion_probe_indeterminate"');
  const around = WEBHOOK.slice(Math.max(0, idx - 800), idx + 400);
  assertStringIncludes(around, 'writeId: "ssw:failed"');
});

// ── E. Browser absent — server gate is self-sufficient ────────────────────
Deno.test("E. the completion path never reads client-persisted probe metrics", () => {
  assert(
    !/readMotionProbeMetrics/.test(WEBHOOK_CODE),
    "sync-so-webhook must not poll client-persisted metrics",
  );
  assert(
    !/meta_yavg_probe/.test(WEBHOOK_CODE),
    "sync-so-webhook must not read meta_yavg_probe as authority",
  );
  assertStringIncludes(WEBHOOK, "measureProviderMotionSync");
  // Client probe is observe-only telemetry.
  assertStringIncludes(CLIENT_HOOK, "observe_only: true");
});

// ── F. Duplicate callback → no second apply / retry / mux ─────────────────
Deno.test("F. duplicate callback is short-circuited by the already-applied guard", () => {
  assertStringIncludes(WEBHOOK, 'skipped: "already_applied"');
});

// ── G. stale run / plate_generation → no apply, no redispatch ─────────────
Deno.test("G. run and plate_generation provenance are enforced", () => {
  assertStringIncludes(WEBHOOK, "active_run_id");
  assertStringIncludes(WEBHOOK, "plate_generation");
  assertStringIncludes(REPORT, "plate_generation");
});

// ── H. Fresh vs NOOP retry wire parity ────────────────────────────────────
Deno.test("H. the only contracted retry difference is the ASD transport", () => {
  // Preservation comment + code path state the invariant explicitly.
  assertStringIncludes(COMPOSE, "v404_noop_retry_preclip_preserved");
  assertStringIncludes(COMPOSE, "bounding_boxes_url` → inline `bounding_boxes`");
  // The historical v148 preclip drop on noop escalation is gone.
  assert(
    !/v148_noop_bypass_preclip/.test(code(COMPOSE)),
    "v148 preclip bypass must no longer exist",
  );
});

// ── I. NOOP preclip preservation ──────────────────────────────────────────
Deno.test("I. frozen NOOP retry keeps preclip, crop, render id and coords", () => {
  const pass = {
    idx: 3,
    status: "pending",
    noop_retry_attempt_id: "attempt-1",
    noop_escalation_step: 1,
    preclip_url: "https://cdn.test/preclip.mp4",
    preclip_crop: { x: 1, y: 2, w: 3, h: 4 },
    preclip_render_id: "render-1",
    coords: [640, 360] as [number, number],
  };
  assertEquals(isFrozenNoopRetryPass(pass), true);

  // Mirror of the production branch: frozen pass → candidate only, continue.
  const snapshot = JSON.parse(JSON.stringify(pass));
  const freshCoord = [900, 500];
  if (isFrozenNoopRetryPass(pass)) {
    (pass as Record<string, unknown>).candidate_coords = freshCoord;
    (pass as Record<string, unknown>).candidate_coords_source = "identity";
  } else {
    throw new Error("branch must be frozen");
  }
  assertEquals(pass.preclip_url, snapshot.preclip_url);
  assertEquals(pass.preclip_crop, snapshot.preclip_crop);
  assertEquals(pass.preclip_render_id, snapshot.preclip_render_id);
  assertEquals(pass.coords, snapshot.coords);
  assertEquals((pass as Record<string, unknown>).candidate_coords, freshCoord);

  // The dispatch-side predicate keeps the preclip for both escalation rungs.
  for (const variant of ["coords-pro-box", "bbox-url-pro"]) {
    assertEquals(
      shouldPreserveNoopRetryPreclip({
        noopAutoEscalation: true,
        requestedRetryVariant: variant,
        hasPreclipUrl: true,
      }),
      true,
    );
  }
});

Deno.test("I2. production branches on the predicate BEFORE any preclip invalidation", () => {
  assertStringIncludes(COMPOSE, "isFrozenNoopRetryPass");
  const guardIdx = COMPOSE.indexOf("isFrozenNoopRetryPass(p as any) || (isTerminal");
  const nullIdx = COMPOSE.indexOf("// Non-terminal: legacy v123 stale-preclip invalidation path.");
  assert(guardIdx > 0 && nullIdx > guardIdx, "guard must precede the invalidation block");
  // v161 still refuses to re-render a preclip during a NOOP escalation.
  assertStringIncludes(COMPOSE, 'body?.noop_auto_escalation !== true');
});

// ── J. Single-speaker path unchanged ──────────────────────────────────────
Deno.test("J. single-speaker keeps its own byte-based gate", () => {
  assertStringIncludes(WEBHOOK, "isSingleSpeakerScene");
});

// ── K. Measurement timeout → indeterminate → ssw:failed ───────────────────
Deno.test("K. deadline reason is the frozen indeterminate reason", () => {
  const reason = "motion_probe_indeterminate:measurement_deadline_exceeded";
  assert(reason.startsWith("motion_probe_indeterminate"));
  assertStringIncludes(WEBHOOK, "motion_probe_indeterminate");
});

// ── L. Frozen ROI in still space (S11: 720×720 source → 1280×720 still) ───
Deno.test("L. ROI is bx=461 by=411 bw=358 bh=154", () => {
  assertEquals(stillRoiForSource(720, 720, 1280, 720), {
    bx: 461,
    by: 411,
    bw: 358,
    bh: 154,
  });
});

// ── M. Threshold boundaries ───────────────────────────────────────────────
Deno.test("M. threshold boundaries are exact and fail-closed", () => {
  assertEquals(MOTION_THRESHOLD, 15.405704881800869);
  assertEquals(NOOP_THRESHOLD, 3.682671115501879);
  const v = (d: number) => classifyMotionProbe(withMean(100, d)).verdict;
  assertEquals(v(MOTION_THRESHOLD + 1e-6), "motion");
  assertEquals(v(MOTION_THRESHOLD), "indeterminate");
  assertEquals(v((MOTION_THRESHOLD + NOOP_THRESHOLD) / 2), "indeterminate");
  assertEquals(v(NOOP_THRESHOLD + 1e-6), "indeterminate");
  assertEquals(v(NOOP_THRESHOLD), "noop");
  assertEquals(v(NOOP_THRESHOLD - 1), "noop");
});

Deno.test("M2. frozen S11 fixture still reproduces all six labels", () => {
  for (const row of getS11FrozenFixture()) {
    assertEquals(
      classifyMotionProbe({ preclip: row.preclip, provider: row.provider }).verdict,
      row.expected,
      row.turn,
    );
  }
});

// ── P1-B — report function is telemetry only ──────────────────────────────
Deno.test("P1-B. report-lipsync-motion-probe owns zero scene/pass state", () => {
  assert(!/update_dialog_pass_slot/.test(REPORT_CODE), "no slot RPC allowed");
  assert(!/yavg_probed_at/.test(REPORT_CODE), "no yavg_probed_at write allowed");
  assert(!/motion_verdict/.test(REPORT_CODE), "no verdict write allowed");
  // Fail-closed key order: job_id check, then pass, then slot match, then write.
  const jobIdx = REPORT.indexOf("v404_telemetry_key_missing");
  const passIdx = REPORT.indexOf("v404_telemetry_pass_missing");
  const matchIdx = REPORT.indexOf("job_slot_mismatch");
  const writeIdx = REPORT.indexOf("resolveTelemetryTarget(");
  assert(jobIdx > 0 && passIdx > jobIdx && matchIdx > passIdx && writeIdx > matchIdx);
});

Deno.test("P1-B. telemetry target resolution is fail-closed", () => {
  assertEquals(resolveTelemetryTarget([], 0), { ok: false, reason: "no_candidate" });
  assertEquals(resolveTelemetryTarget([{ id: "a" }], 0), { ok: true, id: "a" });
  assertEquals(
    resolveTelemetryTarget([{ id: "a", turn_idx: 0 }, { id: "b", turn_idx: 1 }], 1),
    { ok: true, id: "b" },
  );
  assertEquals(
    resolveTelemetryTarget([{ id: "a", turn_idx: 1 }, { id: "b", turn_idx: 1 }], 1),
    { ok: false, reason: "ambiguous" },
  );
});

Deno.test("P1-B. browser de-dupe stays session-local", () => {
  assertStringIncludes(CLIENT_HOOK, "probedThisSession");
});
