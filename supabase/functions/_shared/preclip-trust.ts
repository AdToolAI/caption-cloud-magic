/**
 * v336 — Explicit trust contract for server-rendered single-face preclips.
 *
 * Trust is derived only from construction evidence. It never fabricates a
 * detector face count. A missing post-render JPEG may be tolerated only when
 * every invariant below proves that the crop isolates the intended face.
 */

export interface PreclipTrustInput {
  renderSucceeded: boolean;
  faceShare: number | null | undefined;
  faceShareFloor: number;
  geometrySuspicious: boolean;
  ambiguityRisk?: string | null;
  crop?: { x: number; y: number; size: number } | null;
  siblingCenters?: Array<[number, number]> | null;
}

export interface PreclipTrustDecision {
  trusted: boolean;
  reason: string;
  siblingInsideCrop: boolean;
}

export function decidePreclipTrust(input: PreclipTrustInput): PreclipTrustDecision {
  const crop = input.crop;
  const siblingInsideCrop = Boolean(crop && input.siblingCenters?.some(([x, y]) =>
    x >= crop.x && x <= crop.x + crop.size && y >= crop.y && y <= crop.y + crop.size
  ));
  const share = Number(input.faceShare);

  if (!input.renderSucceeded) return { trusted: false, reason: "render_not_successful", siblingInsideCrop };
  if (!Number.isFinite(share)) return { trusted: false, reason: "face_share_unavailable", siblingInsideCrop };
  if (share < input.faceShareFloor) return { trusted: false, reason: "face_share_below_floor", siblingInsideCrop };
  if (input.geometrySuspicious) return { trusted: false, reason: "geometry_suspicious", siblingInsideCrop };
  if (input.ambiguityRisk && input.ambiguityRisk !== "clean") {
    return { trusted: false, reason: `ambiguity_${input.ambiguityRisk}`, siblingInsideCrop };
  }
  if (siblingInsideCrop) return { trusted: false, reason: "sibling_inside_crop", siblingInsideCrop };
  return { trusted: true, reason: "constructed_single_face_preclip", siblingInsideCrop };
}

export type ProbeUnavailablePolicyCode =
  | "trusted_preclip_without_probe"
  | "untrusted_multispeaker_without_probe"
  | "geometry_suspect_without_probe"
  | "probe_unavailable";

export function decideProbeUnavailablePolicy(input: {
  isMultiSpeakerContext: boolean;
  preclipTrusted: boolean;
  geometrySuspect: boolean;
}): { ok: boolean; code: ProbeUnavailablePolicyCode; reason: string } {
  if (input.isMultiSpeakerContext && input.preclipTrusted && !input.geometrySuspect) {
    return {
      ok: true,
      code: "trusted_preclip_without_probe",
      reason: "Constructively isolated single-face preclip; post-render probe unavailable.",
    };
  }
  if (input.isMultiSpeakerContext) {
    return {
      ok: false,
      code: "untrusted_multispeaker_without_probe",
      reason: "Multi-speaker input has no verifiable isolated-face preclip; blind dispatch rejected.",
    };
  }
  if (input.geometrySuspect) {
    return {
      ok: false,
      code: "geometry_suspect_without_probe",
      reason: "Crop geometry is suspicious and no probe is available; blind dispatch rejected.",
    };
  }
  return { ok: true, code: "probe_unavailable", reason: "Probe unavailable in single-speaker context." };
}