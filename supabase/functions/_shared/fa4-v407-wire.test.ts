/**
 * FA-4 v407 — Final Wire-Parity correction: executable failure-injection tests.
 *
 * These are NOT source-string assertions. Every case runs the SAME production
 * helpers `compose-dialog-segments` uses (contract gates, snapshot persistence,
 * ASD transport resolution, wire construction) against injected fakes for the
 * RPC, the bounding-box upload and the provider call.
 *
 * Run: deno test -A supabase/functions/_shared/fa4-v407-wire.test.ts
 */
import { assert, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  buildProviderWire,
  buildProviderWireSnapshot,
  gateFrozenNoopRetry,
  isV407FreshWireContract,
  isV407NoopRetryCandidate,
  persistFrozenProviderInput,
  type ProviderWireSnapshot,
  resolveAsdTransport,
  resolveFrozenProviderInput,
  toSyncGeneratePayload,
} from "./provider-wire-snapshot.ts";

const FRAMES = 4;
const BOX: [number, number, number, number] = [461, 411, 819, 565];
const BOXES: ([number, number, number, number] | null)[] = [BOX, BOX, null, BOX];

const freshWireInput = {
  bbox: BOX,
  bounding_boxes: BOXES,
  frame_count: FRAMES,
  dispatch_fps: 25,
  voiced_windows: [[0.0, 0.08]] as Array<[number, number]>,
  wants_url_transport: true,
};

const snapshotOf = (): ProviderWireSnapshot =>
  buildProviderWireSnapshot({
    videoUrl: "https://cdn.test/preclip-s11-p3.mp4",
    audioUrl: "https://cdn.test/s11-p3-tight.wav",
    bbox: freshWireInput.bbox,
    boundingBoxes: freshWireInput.bounding_boxes,
    frameCount: freshWireInput.frame_count,
    dispatchFps: freshWireInput.dispatch_fps,
    voicedWindows: freshWireInput.voiced_windows,
    syncMode: "cut_off",
    model: "sync-3",
    speakerIdx: 2,
    segmentId: "seg-s11-t4",
    runId: "8b0f659d-0000-4000-8000-000000000000",
    plateGeneration: 3,
  });

/* ── Harness: mirrors the production dispatch order of index.ts ───────────
 * 1 contract gate → 2 snapshot (build|frozen) → 3 persist → 4 bbox upload
 * → 5 ASD transport → 6 wire → 7 provider call.
 */
interface HarnessDeps {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data?: unknown; error?: { message?: string } | null }>;
  uploadBoundingBoxes: (boxes: unknown) => Promise<{ url: string | null }>;
  providerCall: (payload: Record<string, unknown>) => Promise<void>;
}
interface HarnessInput {
  isMultiSpeaker: boolean;
  payloadModel: string;
  retryVariant: string;
  noopAutoEscalation: boolean;
  isRetry?: boolean;
  pass: Record<string, unknown>;
  freshWireInput: typeof freshWireInput | null;
}
interface HarnessResult {
  contractActive: boolean;
  failed: string | null;
  providerCalls: number;
  asdKeys: string[] | null;
  wire: ReturnType<typeof buildProviderWire> | null;
  uploadedJson: unknown;
  legacyPathUsed: boolean;
}

async function runDispatch(input: HarnessInput, deps: HarnessDeps): Promise<HarnessResult> {
  let providerCalls = 0;
  let uploadedJson: unknown = null;
  const call = async (payload: Record<string, unknown>) => {
    providerCalls++;
    await deps.providerCall(payload);
  };

  const noopCandidate = isV407NoopRetryCandidate({
    isMultiSpeaker: input.isMultiSpeaker,
    noopAutoEscalation: input.noopAutoEscalation,
    retryVariant: input.retryVariant,
  });
  const noopGate = noopCandidate ? gateFrozenNoopRetry(resolveFrozenProviderInput(input.pass)) : null;
  if (noopGate && !noopGate.ok) {
    return {
      contractActive: true,
      failed: noopGate.reason,
      providerCalls: 0,
      asdKeys: null,
      wire: null,
      uploadedJson: null,
      legacyPathUsed: false,
    };
  }
  const frozen = noopGate?.ok ? noopGate.snapshot : null;

  const freshContract = !frozen && isV407FreshWireContract({
    isRetry: (input as any).isRetry === true,
    isMultiSpeaker: input.isMultiSpeaker,
    payloadModel: input.payloadModel,
    retryVariant: input.retryVariant,
    hasDispatchBox: Array.isArray(input.freshWireInput?.bbox),
    canonicalBoxesAvailable: (input.freshWireInput?.bounding_boxes?.length ?? 0) > 0,
  });
  const contractActive = freshContract || !!frozen;

  if (!contractActive) {
    // pre-v406 payload path — untouched, no snapshot required.
    await call({ model: input.payloadModel, legacy: true });
    return {
      contractActive: false,
      failed: null,
      providerCalls,
      asdKeys: null,
      wire: null,
      uploadedJson: null,
      legacyPathUsed: true,
    };
  }

  let snapshot: ProviderWireSnapshot;
  if (frozen) {
    snapshot = frozen;
  } else {
    snapshot = snapshotOf();
    const persisted = await persistFrozenProviderInput(deps.rpc, {
      sceneId: "e658509d-cdeb-40f7-bd33-98e74144fdc5",
      passIdx: 2,
      snapshot,
    });
    if (!persisted.ok) {
      return {
        contractActive,
        failed: "v407_snapshot_persist_failed",
        providerCalls: 0,
        asdKeys: null,
        wire: null,
        uploadedJson: null,
        legacyPathUsed: false,
      };
    }
  }

  let uploadedUrl: string | null = null;
  const wantsUrl = !frozen && input.freshWireInput?.wants_url_transport === true;
  if (wantsUrl) {
    try {
      const up = await deps.uploadBoundingBoxes(snapshot.bounding_boxes);
      uploadedJson = { bounding_boxes: snapshot.bounding_boxes };
      uploadedUrl = up.url;
    } catch {
      uploadedUrl = null;
    }
  }

  const transport = resolveAsdTransport({ frozen: !!frozen, wantsUrlTransport: wantsUrl, uploadedUrl });
  if (!transport.ok) {
    return {
      contractActive,
      failed: transport.reason,
      providerCalls: 0,
      asdKeys: null,
      wire: null,
      uploadedJson,
      legacyPathUsed: false,
    };
  }

  const wire = buildProviderWire(snapshot, {
    asdTransport: transport.transport,
    boundingBoxesUrl: transport.boundingBoxesUrl,
  });
  await call(toSyncGeneratePayload(wire, { webhookUrl: "https://hook.test/sync" }));

  return {
    contractActive,
    failed: null,
    providerCalls,
    asdKeys: Object.keys(wire.active_speaker_detection).sort(),
    wire,
    uploadedJson,
    legacyPathUsed: false,
  };
}

const okDeps = (over: Partial<HarnessDeps> = {}): HarnessDeps & { rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> } => {
  const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const base: HarnessDeps = {
    rpc: async (fn, args) => {
      rpcCalls.push({ fn, args });
      // v408: the installed RPC returns the complete dialog_shots JSONB.
      const patch = (args as any)._patch ?? {};
      const passes: unknown[] = [];
      passes[(args as any)._pass_idx as number] = {
        provider_input_frozen: patch.provider_input_frozen,
      };
      return { data: { passes }, error: null };
    },
    uploadBoundingBoxes: async () => ({ url: "https://cdn.test/asd/s11-p3.json" }),
    providerCall: async () => {},
  };
  return Object.assign(base, over, { rpcCalls });
};

const freshInput = (): HarnessInput => ({
  isMultiSpeaker: true,
  payloadModel: "sync-3",
  retryVariant: "bbox-url-pro",
  noopAutoEscalation: false,
  pass: {},
  freshWireInput,
});

const retryInput = (pass: Record<string, unknown>): HarnessInput => ({
  isMultiSpeaker: true,
  payloadModel: "sync-3",
  retryVariant: "coords-pro-box",
  noopAutoEscalation: true,
  isRetry: true,
  pass,
  freshWireInput: null,
});

/* ── A — persist success: exact RPC keys + exactly one provider call ───── */
Deno.test("A: snapshot persist success → exact RPC param keys, exactly 1 provider call", async () => {
  const deps = okDeps();
  const res = await runDispatch(freshInput(), deps);
  assertEquals(res.failed, null);
  assertEquals(res.providerCalls, 1);
  assertEquals(deps.rpcCalls.length, 1);
  assertEquals(deps.rpcCalls[0].fn, "update_dialog_pass_slot");
  assertEquals(Object.keys(deps.rpcCalls[0].args).sort(), ["_pass_idx", "_patch", "_scene_id"]);
  const args = deps.rpcCalls[0].args as Record<string, unknown>;
  assert(!("p_scene_id" in args), "legacy p_scene_id key must not be sent");
  assert(!("p_pass_idx" in args), "legacy p_pass_idx key must not be sent");
  assert(!("p_patch" in args), "legacy p_patch key must not be sent");
  assertEquals(typeof args._scene_id, "string");
  assertEquals(args._pass_idx, 2);
  assert((args._patch as any).provider_input_frozen);
});

/* ── B — persist failure: zero provider calls ─────────────────────────── */
Deno.test("B: snapshot persist failure → 0 provider calls", async () => {
  const deps = okDeps({ rpc: async () => ({ error: { message: "boom" } }) });
  const res = await runDispatch(freshInput(), deps);
  assertEquals(res.failed, "v407_snapshot_persist_failed");
  assertEquals(res.providerCalls, 0);
});

Deno.test("B2: persist throw → 0 provider calls", async () => {
  const deps = okDeps({ rpc: () => Promise.reject(new Error("network")) });
  const res = await runDispatch(freshInput(), deps);
  assertEquals(res.failed, "v407_snapshot_persist_failed");
  assertEquals(res.providerCalls, 0);
});

/* ── C — fresh bbox upload failure: fail closed, NO inline fallback ───── */
Deno.test("C: fresh bbox upload throws → 0 provider calls, no inline fallback", async () => {
  const deps = okDeps({ uploadBoundingBoxes: () => Promise.reject(new Error("storage down")) });
  const res = await runDispatch(freshInput(), deps);
  assertEquals(res.failed, "v407_bbox_url_transport_failed");
  assertEquals(res.providerCalls, 0);
  assertEquals(res.wire, null);
});

Deno.test("C2: fresh bbox upload returns null url → 0 provider calls", async () => {
  const deps = okDeps({ uploadBoundingBoxes: async () => ({ url: null }) });
  const res = await runDispatch(freshInput(), deps);
  assertEquals(res.failed, "v407_bbox_url_transport_failed");
  assertEquals(res.providerCalls, 0);
});

/* ── D — fresh success: URL transport only ────────────────────────────── */
Deno.test("D: fresh success → ASD keys exactly auto_detect + bounding_boxes_url", async () => {
  const res = await runDispatch(freshInput(), okDeps());
  assertEquals(res.asdKeys, ["auto_detect", "bounding_boxes_url"]);
  assertEquals(res.providerCalls, 1);
  assertEquals(
    (res.wire!.active_speaker_detection as any).bounding_boxes_url,
    "https://cdn.test/asd/s11-p3.json",
  );
  // uploaded JSON is byte-equal to the frozen canonical boxes
  assertEquals(res.uploadedJson, { bounding_boxes: snapshotOf().bounding_boxes });
});

/* ── E — NOOP retry success: frozen reuse, inline transport ───────────── */
Deno.test("E: NOOP retry success → same frozen audio/video/boxes, inline ASD", async () => {
  const frozen = snapshotOf();
  const fresh = await runDispatch(freshInput(), okDeps());
  const deps = okDeps();
  const res = await runDispatch(retryInput({ provider_input_frozen: frozen }), deps);
  assertEquals(res.failed, null);
  assertEquals(res.providerCalls, 1);
  assertEquals(res.asdKeys, ["auto_detect", "bounding_boxes"]);
  assertEquals(deps.rpcCalls.length, 0, "retry must not re-persist a snapshot");
  assertEquals(res.wire!.audio_url, fresh.wire!.audio_url);
  assertEquals(res.wire!.video_url, fresh.wire!.video_url);
  assertEquals(
    (res.wire!.active_speaker_detection as any).bounding_boxes,
    (fresh.uploadedJson as any).bounding_boxes,
  );
  // Matrix H — deep equality of everything except the ASD transport.
  const strip = (w: any) => {
    const { active_speaker_detection: _asd, ...core } = w;
    return core;
  };
  assertEquals(strip(res.wire), strip(fresh.wire));
});

/* ── F — missing / incomplete snapshot on NOOP retry ──────────────────── */
Deno.test("F: NOOP retry with missing snapshot → 0 provider calls", async () => {
  const res = await runDispatch(retryInput({}), okDeps());
  assertEquals(res.failed, "noop_retry_frozen_input_missing");
  assertEquals(res.providerCalls, 0);
});

Deno.test("F2: NOOP retry with incomplete snapshot → 0 provider calls", async () => {
  const incomplete = { ...snapshotOf() } as any;
  delete incomplete.audio_url;
  const res = await runDispatch(retryInput({ provider_input_frozen: incomplete }), okDeps());
  assertEquals(res.failed, "noop_retry_frozen_input_missing");
  assertEquals(res.providerCalls, 0);
});

Deno.test("F3: NOOP retry with non sync-3 frozen model → 0 provider calls", async () => {
  const wrongModel = { ...snapshotOf(), model: "lipsync-2-pro" };
  const res = await runDispatch(retryInput({ provider_input_frozen: wrongModel }), okDeps());
  assertEquals(res.failed, "noop_retry_frozen_model_mismatch");
  assertEquals(res.providerCalls, 0);
});

Deno.test("F4: NOOP activation never depends on recomputed geometry or model", () => {
  // No dispatchBox, no canonical boxes, no payloadModel — still a candidate.
  assert(isV407NoopRetryCandidate({
    isMultiSpeaker: true,
    noopAutoEscalation: true,
    retryVariant: "coords-pro-box",
  }));
  // Fresh gate, in contrast, requires both geometry inputs.
  assertEquals(
    isV407FreshWireContract({
      isMultiSpeaker: true,
      payloadModel: "sync-3",
      retryVariant: "bbox-url-pro",
      hasDispatchBox: false,
      canonicalBoxesAvailable: true,
    }),
    false,
  );
});

/* ── G — single speaker: contract inactive, legacy path intact ────────── */
Deno.test("G: single-speaker fresh → v407 contract inactive, legacy path dispatches", async () => {
  const deps = okDeps();
  const res = await runDispatch({ ...freshInput(), isMultiSpeaker: false }, deps);
  assertEquals(res.contractActive, false);
  assertEquals(res.failed, null);
  assertEquals(res.legacyPathUsed, true);
  assertEquals(res.providerCalls, 1);
  assertEquals(deps.rpcCalls.length, 0, "single speaker must not persist a snapshot");
});

/* ── H — non-bbox path outside the contract ───────────────────────────── */
Deno.test("H: non-bbox multi-speaker path → no v407 snapshot regression", async () => {
  const deps = okDeps();
  const res = await runDispatch(
    { ...freshInput(), retryVariant: "coords-pro", freshWireInput: null },
    deps,
  );
  assertEquals(res.contractActive, false);
  assertEquals(res.failed, null);
  assertEquals(res.providerCalls, 1);
  assertEquals(deps.rpcCalls.length, 0);
});
