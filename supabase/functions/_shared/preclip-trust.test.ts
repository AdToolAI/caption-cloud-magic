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