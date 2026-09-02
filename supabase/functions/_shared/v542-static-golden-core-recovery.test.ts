import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildV542RecoveryDetails,
  evaluateV542Recovery,
  V542_RECOVERY_VERDICT,
} from "./v542-static-golden-core-recovery.ts";

const base = {
  speakerCount: 2,
  preclipErrorClass: "invalid_input",
  identityResolvedCount: 2,
  dynamicAttempted: true,
};

Deno.test("v542: production V536 case (2.24px conflict) is recoverable", () => {
  const d = evaluateV542Recovery({
    ...base,
    preclipError: "preclip_crop_contract_unsatisfiable:dynamic_mouth_crop_infeasible",
  });
  assertEquals(d.eligible, true);
  assertEquals(d.matchedReason, "dynamic_mouth_crop_infeasible");
});

Deno.test("v542: production no_coherent_track_samples case is recoverable", () => {
  const d = evaluateV542Recovery({
    ...base,
    preclipError: "preclip_crop_contract_unsatisfiable:no_coherent_track_samples",
  });
  assertEquals(d.eligible, true);
  assertEquals(d.matchedReason, "no_coherent_track_samples");
});

Deno.test("v542: incomplete identity lock never recovers", () => {
  const d = evaluateV542Recovery({
    ...base,
    identityResolvedCount: 1,
    preclipError: "dynamic_mouth_crop_infeasible",
  });
  assertEquals(d.eligible, false);
  assertEquals(d.reason, "identity_lock_incomplete");
});

Deno.test("v542: missing identity evidence never recovers", () => {
  const d = evaluateV542Recovery({
    ...base,
    identityResolvedCount: null,
    preclipError: "dynamic_mouth_crop_infeasible",
  });
  assertEquals(d.eligible, false);
  assertEquals(d.reason, "identity_lock_incomplete");
});

Deno.test("v542: 3+ speaker cohort stays untouched", () => {
  const d = evaluateV542Recovery({
    ...base,
    speakerCount: 4,
    identityResolvedCount: 4,
    preclipError: "dynamic_mouth_crop_infeasible",
  });
  assertEquals(d.eligible, false);
  assertEquals(d.reason, "speaker_cohort_not_two");
});

Deno.test("v542: single speaker cohort stays untouched", () => {
  const d = evaluateV542Recovery({
    ...base,
    speakerCount: 1,
    identityResolvedCount: 1,
    preclipError: "dynamic_mouth_crop_infeasible",
  });
  assertEquals(d.eligible, false);
  assertEquals(d.reason, "speaker_cohort_not_two");
});

Deno.test("v542: unrelated failures are not recoverable", () => {
  for (
    const err of [
      "preclip_poll_timeout",
      "face_repair_identity_unresolved",
      "v464_asd_contract_invalid",
      null,
    ]
  ) {
    const d = evaluateV542Recovery({ ...base, preclipError: err });
    assertEquals(d.eligible, false, `unexpected recovery for ${err}`);
  }
});

Deno.test("v542: infrastructure error classes keep their own path", () => {
  for (const cls of ["dispatch_uncertain", "dispatch_failed", "lambda_failed", "poll_timeout"]) {
    const d = evaluateV542Recovery({
      ...base,
      preclipErrorClass: cls,
      preclipError: "dynamic_mouth_crop_infeasible",
    });
    assertEquals(d.eligible, false);
    assertEquals(d.reason, `error_class_not_recoverable:${cls}`);
  }
});

Deno.test("v542: no dynamic attempt means no recovery", () => {
  const d = evaluateV542Recovery({
    ...base,
    dynamicAttempted: false,
    preclipError: "dynamic_mouth_crop_infeasible",
  });
  assertEquals(d.eligible, false);
  assertEquals(d.reason, "no_dynamic_attempt");
});

Deno.test("v542: telemetry is scalar-only and names the static source", () => {
  const details = buildV542RecoveryDetails({
    passIdx: 2,
    totalPasses: 4,
    matchedReason: "dynamic_mouth_crop_infeasible",
    outcome: "recovered",
    speakerCount: 2,
    identityResolvedCount: 2,
  });
  assertEquals(details.crop_source, "static_golden_core");
  assertEquals(details.full_plate_fallback, false);
  assertEquals(details.outcome, "recovered");
  assertEquals(details.pass_idx, 2);
  assertEquals(details.total_passes, 4);
  const serialized = JSON.stringify(details);
  assertEquals(/https?:\/\//.test(serialized), false);
  assertEquals(/base64|bbox|image/i.test(serialized), false);
});

Deno.test("v542: refused static attempt is reported honestly", () => {
  const details = buildV542RecoveryDetails({
    passIdx: 3,
    totalPasses: 4,
    matchedReason: "no_coherent_track_samples",
    outcome: "static_also_refused",
    speakerCount: 2,
    identityResolvedCount: 2,
  });
  assertEquals(details.outcome, "static_also_refused");
  assertEquals(V542_RECOVERY_VERDICT, "v542_static_golden_core_recovery");
});
