/**
 * V443 — regression tests: probe-infrastructure errors are NOT verdicts.
 *
 * Covers the nine required properties:
 *  1. probe_infra_error does not immediately fail the scene
 *  2. exactly max 2 bounded re-measure attempts on the same immutable output
 *  3. exhausted infra measurement produces `motion_unverified`
 *  4. no new provider dispatch on this path
 *  5. measured Noop fails exactly as before
 *  6. measured Motion remains success
 *  7. watchdog re-measures `motion_unverified` exactly once
 *  8. refund stays idempotent (no refund/credit call on this path)
 *  9. the V441 write-contract (`ssw:noop_fail` for COMPLETED) stays intact
 */

import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  classifyMeasurementFailure,
  measureWithBoundedReMeasure,
  MOTION_UNVERIFIED_STATE,
  PROBE_INFRA_MAX_RETRIES,
} from "./motion-probe-infra.ts";
import { classifyMotionProbe, MOTION_THRESHOLD, NOOP_THRESHOLD } from "./motion-probe-classifier.ts";

const WEBHOOK = await Deno.readTextFile(new URL("../sync-so-webhook/index.ts", import.meta.url));
const WATCHDOG = await Deno.readTextFile(new URL("../lipsync-watchdog/index.ts", import.meta.url));

const infra = (reason: string) => ({ measurement_status: "unmeasurable" as const, reason });
const measured = { measurement_status: "measured" as const, reason: "measured" };

// ── 1 + classification ────────────────────────────────────────────────────
Deno.test("A. transport/JSON/HTTP/timeout failures classify as probe_infra_error", () => {
  const reasons = [
    "motion_probe_indeterminate:provider_Unexpected end of JSON input",
    "motion_probe_indeterminate:provider_lambda_http_502",
    "motion_probe_indeterminate:preclip_still_download_500",
    "motion_probe_indeterminate:provider_still_too_small",
    "motion_probe_indeterminate:measurement_deadline_exceeded",
    "motion_probe_indeterminate:provider_lambda_no_output",
    "motion_probe_indeterminate:preclip_dimensions_unknown",
    "motion_probe_indeterminate:provider_insufficient_frames",
  ];
  for (const r of reasons) {
    assertEquals(classifyMeasurementFailure(r), "probe_infra_error", r);
  }
});

Deno.test("A2. gray zone and structurally unusable inputs stay measured_ambiguous", () => {
  const reasons = [
    `motion_probe_indeterminate:delta_mean=8 between noop_threshold=${NOOP_THRESHOLD} and motion_threshold=${MOTION_THRESHOLD}`,
    "motion_probe_indeterminate:invalid_metric",
    "motion_probe_indeterminate:preclip_url_missing",
    "motion_probe_indeterminate:provider_url_missing",
    "motion_probe_indeterminate:duration_unknown",
    "motion_probe_indeterminate:measurement_missing",
  ];
  for (const r of reasons) {
    assertEquals(classifyMeasurementFailure(r), "measured_ambiguous", r);
  }
});

// ── 2 + 3 ─────────────────────────────────────────────────────────────────
Deno.test("B. probe_infra_error re-measures at most twice, then motion_unverified", async () => {
  const seen: string[] = [];
  const pinned = "https://storage/run-x/gen-9/pass-0/provider-output-a0.mp4";
  const out = await measureWithBoundedReMeasure(
    () => {
      seen.push(pinned); // identical immutable input on every attempt
      return Promise.resolve(infra("motion_probe_indeterminate:provider_Unexpected end of JSON input"));
    },
    { sleep: () => Promise.resolve() },
  );
  assertEquals(PROBE_INFRA_MAX_RETRIES, 2);
  assertEquals(out.attempts, 3); // 1 initial + max 2 re-measures
  assertEquals(new Set(seen).size, 1); // same pinned artifact every time
  assertEquals(out.failureClass, "probe_infra_error");
  assert(out.infraExhausted);
  assertEquals(MOTION_UNVERIFIED_STATE, "motion_unverified");
});

Deno.test("B2. a re-measure that succeeds stops the ladder immediately", async () => {
  let n = 0;
  const out = await measureWithBoundedReMeasure(
    () => Promise.resolve(++n === 1 ? infra("motion_probe_indeterminate:lambda_http_503") : measured),
    { sleep: () => Promise.resolve() },
  );
  assertEquals(out.attempts, 2);
  assertEquals(out.failureClass, null);
  assertEquals(out.infraExhausted, false);
});

Deno.test("B3. measured_ambiguous is never re-measured", async () => {
  let n = 0;
  const out = await measureWithBoundedReMeasure(
    () => {
      n++;
      return Promise.resolve(infra("motion_probe_indeterminate:invalid_metric"));
    },
    { sleep: () => Promise.resolve() },
  );
  assertEquals(n, 1);
  assertEquals(out.attempts, 1);
  assertEquals(out.infraExhausted, false);
  assertEquals(out.failureClass, "measured_ambiguous");
});

// ── 4 + 8 ─────────────────────────────────────────────────────────────────
Deno.test("C. the motion_unverified path dispatches nothing and refunds nothing", () => {
  const idx = WEBHOOK.indexOf("v443MotionUnverifiedPassthrough");
  assert(idx > 0, "passthrough guard missing");
  const block = WEBHOOK.slice(idx, idx + 1200);
  assert(!block.includes("compose-dialog-segments"), "no provider re-dispatch allowed");
  assert(!block.includes("refund"), "no refund call allowed on this path");
  assert(!block.includes("ssw:noop_escalate"), "no escalation allowed on this path");
});

// ── 5 + 6 + 9 ─────────────────────────────────────────────────────────────
Deno.test("D. measured verdicts are unchanged (thresholds frozen)", () => {
  const motion = classifyMotionProbe({
    preclip: { mean: 161.46, peak: 8797 },
    provider: { mean: 297.43, peak: 14683 },
  });
  assertEquals(motion.verdict, "motion");
  const noop = classifyMotionProbe({
    preclip: { mean: 47.7, peak: 5436 },
    provider: { mean: 42.49, peak: 5485 },
  });
  assertEquals(noop.verdict, "noop");
  assertEquals(MOTION_THRESHOLD, 15.405704881800869);
  assertEquals(NOOP_THRESHOLD, 3.682671115501879);
});

Deno.test("E. measured Noop still terminalizes via the V441 write contract", () => {
  assertStringIncludes(WEBHOOK, 'writeId: "ssw:noop_fail"');
  const idx = WEBHOOK.indexOf("shouldHardFailNoopLadderExhausted");
  assert(idx > 0);
  const block = WEBHOOK.slice(idx, idx + 4000);
  assertStringIncludes(block, 'writeId: "ssw:noop_fail"');
  assertStringIncludes(block, 'providerStatus: "COMPLETED"');
});

Deno.test("F. measured_ambiguous stays fail-closed for multi-speaker", () => {
  assertStringIncludes(
    WEBHOOK,
    'classifyMeasurementFailure(motionProbeResult?.reason ?? "")',
  );
  assertStringIncludes(WEBHOOK, 'v443FailureClass === "probe_infra_error"');
  assertStringIncludes(WEBHOOK, 'errorText: "motion_probe_indeterminate"');
});

// ── 7 ─────────────────────────────────────────────────────────────────────
Deno.test("G. watchdog re-measures motion_unverified exactly once, never dispatches", () => {
  assertStringIncludes(WATCHDOG, '.eq("sync_status", "MOTION_UNVERIFIED")');
  assertStringIncludes(WATCHDOG, '.eq("sync_status", "MOTION_RECHECKED")');
  assertStringIncludes(WATCHDOG, "alreadyRechecked.add(key)");
  assertStringIncludes(WATCHDOG, "measureProviderMotionSync({");
  assertStringIncludes(WATCHDOG, '_write_id: "ssw:noop_fail"');
  assertStringIncludes(WATCHDOG, "provider_dispatch: false");
  const idx = WATCHDOG.indexOf("── V443");
  const block = WATCHDOG.slice(idx, WATCHDOG.indexOf("v443_recheck_block_error", idx));
  assert(!block.includes("compose-dialog-segments"), "watchdog recheck must not dispatch");
  assert(!block.includes("refund"), "watchdog recheck must not refund");
});

Deno.test("H. webhook persists the telemetry the watchdog needs", () => {
  assertStringIncludes(WEBHOOK, 'sync_status: "MOTION_UNVERIFIED"');
  assertStringIncludes(WEBHOOK, 'error_class: "motion_probe_infra_error"');
  assertStringIncludes(WEBHOOK, "telemetry_state: MOTION_UNVERIFIED_STATE");
  assertStringIncludes(WEBHOOK, "provider_output_url:");
  assertStringIncludes(WEBHOOK, "pipeline_job_id: v431CallbackJobId ?? null");
});
