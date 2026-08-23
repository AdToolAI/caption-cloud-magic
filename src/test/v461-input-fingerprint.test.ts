import { describe, expect, it } from "vitest";
import {
  buildDispatchVideoTelemetry,
  computeInputFingerprint,
  evaluateNoopRedispatch,
  isTransportOnlyVariant,
  objectPathOf,
} from "../../supabase/functions/_shared/v461-input-fingerprint";

const semantic = {
  videoUrl: "https://x.supabase.co/storage/v1/object/sign/lipsync-plates/u/preclip-0.mp4?token=aaa",
  audioUrl: "https://x.supabase.co/storage/v1/object/sign/ai-videos/u/turn-0.wav?token=bbb",
  audioDurSec: 3.4,
  frameCount: 102,
  dispatchFps: 30,
  boundingBoxes: [[160, 0, 556, 513], [160, 0, 556, 513]] as number[][],
  coordinateSpace: "clip",
  model: "sync-3",
  syncMode: "cut_off",
  speakerIdx: 0,
};

describe("V461 B — semantic input fingerprint", () => {
  it("ignores rotating signed-URL tokens", () => {
    expect(objectPathOf(semantic.videoUrl)).toBe("lipsync-plates/u/preclip-0.mp4");
    const a = computeInputFingerprint(semantic).semantic;
    const b = computeInputFingerprint({
      ...semantic,
      videoUrl: semantic.videoUrl.replace("token=aaa", "token=zzz"),
    }).semantic;
    expect(a).toBe(b);
  });

  it("is identical for bbox-url-pro and coords-pro-box (Stufe-1 finding)", () => {
    const url = computeInputFingerprint(semantic, {
      asdTransport: "url",
      retryVariant: "bbox-url-pro",
    });
    const inline = computeInputFingerprint(semantic, {
      asdTransport: "inline",
      retryVariant: "coords-pro-box",
    });
    expect(inline.semantic).toBe(url.semantic);
    expect(inline.transport).not.toBe(url.transport);
  });

  it("changes when the boxes, the asset or the audio change", () => {
    const base = computeInputFingerprint(semantic).semantic;
    expect(
      computeInputFingerprint({ ...semantic, boundingBoxes: [[10, 10, 100, 100]] }).semantic,
    ).not.toBe(base);
    expect(
      computeInputFingerprint({
        ...semantic,
        videoUrl: semantic.videoUrl.replace("preclip-0", "preclip-1"),
      }).semantic,
    ).not.toBe(base);
    expect(computeInputFingerprint({ ...semantic, audioDurSec: 4.1 }).semantic).not.toBe(base);
  });

  it("refuses a transport-only rung with an unchanged semantic input", () => {
    const fp = computeInputFingerprint(semantic).semantic;
    expect(isTransportOnlyVariant("coords-pro-box")).toBe(true);
    const d = evaluateNoopRedispatch({
      nextVariant: "coords-pro-box",
      plannedSemanticFingerprint: fp,
      seenSemanticFingerprints: [fp],
    });
    expect(d.allow).toBe(false);
    expect(d.code).toBe("semantic_input_unchanged");
  });

  it("keeps the rung available when the semantic input actually changed", () => {
    const d = evaluateNoopRedispatch({
      nextVariant: "coords-pro-box",
      plannedSemanticFingerprint: "newfingerprint",
      seenSemanticFingerprints: ["oldfingerprint"],
    });
    expect(d.allow).toBe(true);
  });

  it("fails open when no fingerprint was recorded", () => {
    const d = evaluateNoopRedispatch({
      nextVariant: "coords-pro-box",
      plannedSemanticFingerprint: null,
      seenSemanticFingerprints: [],
    });
    expect(d.allow).toBe(true);
    expect(d.code).toBe("fingerprint_unknown");
  });
});

describe("V461 C — honest dispatch telemetry", () => {
  it("reports the pre-clip geometry, never the plate dimensions", () => {
    const t = buildDispatchVideoTelemetry({
      url: semantic.videoUrl,
      probeBytes: 470_000,
      probeContentType: "video/mp4",
      preclipOutputSize: 720,
      width: null,
      height: null,
    });
    expect(t.width).toBe(720);
    expect(t.height).toBe(720);
    expect(t.bytes).toBe(470_000);
    expect(t.source).toBe("preclip_geometry");
    expect(t.width).not.toBe(1284);
    expect(t.height).not.toBe(718);
  });

  it("reports unknown rather than guessing", () => {
    const t = buildDispatchVideoTelemetry({ url: semantic.videoUrl });
    expect(t.width).toBeNull();
    expect(t.height).toBeNull();
    expect(t.bytes).toBeNull();
    expect(t.source).toBe("unknown");
    expect(t.object_path).toBe("lipsync-plates/u/preclip-0.mp4");
  });
});
