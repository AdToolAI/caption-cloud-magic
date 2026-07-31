import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { decidePreclipTrust, decideProbeUnavailablePolicy } from "./preclip-trust.ts";

Deno.test("v336: trusted isolated preclip may dispatch without JPEG probe", () => {
  const trust = decidePreclipTrust({
    renderSucceeded: true,
    faceShare: 0.31,
    faceShareFloor: 0.24,
    geometrySuspicious: false,
    ambiguityRisk: "clean",
    crop: { x: 100, y: 80, size: 240 },
    siblingCenters: [[500, 180]],
  });
  assertEquals(trust.trusted, true);
  assertEquals(decideProbeUnavailablePolicy({
    isMultiSpeakerContext: true,
    preclipTrusted: trust.trusted,
    geometrySuspect: false,
  }).code, "trusted_preclip_without_probe");
});

Deno.test("v336: sibling in crop makes missing probe fail closed", () => {
  const trust = decidePreclipTrust({
    renderSucceeded: true,
    faceShare: 0.31,
    faceShareFloor: 0.24,
    geometrySuspicious: false,
    ambiguityRisk: "clean",
    crop: { x: 100, y: 80, size: 240 },
    siblingCenters: [[250, 180]],
  });
  assertEquals(trust.reason, "sibling_inside_crop");
  assertEquals(decideProbeUnavailablePolicy({
    isMultiSpeakerContext: true,
    preclipTrusted: trust.trusted,
    geometrySuspect: false,
  }).code, "untrusted_multispeaker_without_probe");
});

Deno.test("v336: multi-speaker full plate without probe remains blocked", () => {
  const decision = decideProbeUnavailablePolicy({
    isMultiSpeakerContext: true,
    preclipTrusted: false,
    geometrySuspect: false,
  });
  assertEquals(decision.ok, false);
  assertEquals(decision.code, "untrusted_multispeaker_without_probe");
});

Deno.test("v336: suspicious geometry without probe remains blocked", () => {
  const decision = decideProbeUnavailablePolicy({
    isMultiSpeakerContext: false,
    preclipTrusted: false,
    geometrySuspect: true,
  });
  assertEquals(decision.ok, false);
  assertEquals(decision.code, "geometry_suspect_without_probe");
});

Deno.test("v336: ordinary single-speaker missing probe remains non-blocking", () => {
  const decision = decideProbeUnavailablePolicy({
    isMultiSpeakerContext: false,
    preclipTrusted: false,
    geometrySuspect: false,
  });
  assertEquals(decision.ok, true);
  assertEquals(decision.code, "probe_unavailable");
});

Deno.test("v338: small plate box is recovered by valid isolated final crop", () => {
  const trust = decidePreclipTrust({
    renderSucceeded: true,
    faceShare: 0.2428700769578995,
    faceShareFloor: 0.24,
    geometrySuspicious: true,
    geometryReason: "box_too_small",
    ambiguityRisk: "clean",
    crop: { x: 558, y: 118, size: 94 },
    siblingCenters: [[429, 158], [730, 302]],
  });
  assertEquals(trust.trusted, true);
  assertEquals(trust.reason, "constructed_single_face_preclip_small_box_recovered");
  assertEquals(decideProbeUnavailablePolicy({
    isMultiSpeakerContext: true,
    preclipTrusted: trust.trusted,
    geometrySuspect: false,
  }).code, "trusted_preclip_without_probe");
});

Deno.test("v338: small plate box remains blocked below face-share floor", () => {
  const trust = decidePreclipTrust({
    renderSucceeded: true,
    faceShare: 0.239,
    faceShareFloor: 0.24,
    geometrySuspicious: true,
    geometryReason: "box_too_small",
    ambiguityRisk: "clean",
    crop: { x: 558, y: 118, size: 94 },
    siblingCenters: [],
  });
  assertEquals(trust.trusted, false);
  assertEquals(trust.reason, "face_share_below_floor");
});

Deno.test("v338: missing detector box remains fail-closed", () => {
  const trust = decidePreclipTrust({
    renderSucceeded: true,
    faceShare: 0.31,
    faceShareFloor: 0.24,
    geometrySuspicious: true,
    geometryReason: "no_bbox",
    ambiguityRisk: "clean",
    crop: { x: 100, y: 80, size: 240 },
    siblingCenters: [],
  });
  assertEquals(trust.trusted, false);
  assertEquals(trust.reason, "geometry_no_bbox");
});

Deno.test("v338: invalid final crop remains fail-closed", () => {
  const trust = decidePreclipTrust({
    renderSucceeded: true,
    faceShare: 0.31,
    faceShareFloor: 0.24,
    geometrySuspicious: false,
    geometryReason: "ok",
    ambiguityRisk: "clean",
    crop: { x: 100, y: 80, size: 0 },
    siblingCenters: [],
  });
  assertEquals(trust.trusted, false);
  assertEquals(trust.reason, "invalid_crop");
});

Deno.test("v338: recovered small box is still blocked when sibling is inside", () => {
  const trust = decidePreclipTrust({
    renderSucceeded: true,
    faceShare: 0.31,
    faceShareFloor: 0.24,
    geometrySuspicious: true,
    geometryReason: "box_too_small",
    ambiguityRisk: "clean",
    crop: { x: 100, y: 80, size: 240 },
    siblingCenters: [[250, 180]],
  });
  assertEquals(trust.trusted, false);
  assertEquals(trust.reason, "sibling_inside_crop");
});