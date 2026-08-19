/**
 * FA-4 v408 — Pre-deploy blocker correction: executable tests.
 *
 * P1-1 non-NOOP retry scope leakage, P1-2 positively confirmed snapshot
 * persistence. Every case drives the SAME production helpers used by
 * `compose-dialog-segments` against injected fakes (RPC, bbox upload,
 * provider call) — no source-string assertions.
 *
 * Run: deno test -A supabase/functions/_shared/fa4-v408-predeploy.test.ts
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

const BOX: [number, number, number, number] = [461, 411, 819, 565];
const BOXES: ([number, number, number, number] | null)[] = [BOX, BOX, null, BOX];
const SCENE_ID = "e658509d-cdeb-40f7-bd33-98e74144fdc5";
const PASS_IDX = 2;

const freshWireInput = {
  bbox: BOX,
  bounding_boxes: BOXES,
  wants_url_transport: true,
};

const snapshotOf = (): ProviderWireSnapshot =>
  buildProviderWireSnapshot({
    videoUrl: "https://cdn.test/preclip-s11-p3.mp4",
    audioUrl: "https://cdn.test/s11-p3-tight.wav",
    bbox: BOX,
    boundingBoxes: BOXES,
    frameCount: 4,
    dispatchFps: 25,
    voicedWindows: [[0.0, 0.08]],
    syncMode: "cut_off",
    model: "sync-3",
    speakerIdx: 2,
    segmentId: "seg-s11-t4",
    runId: "8b0f659d-0000-4000-8000-000000000000",
    plateGeneration: 3,
  });

type RpcFn = (
  fn: string,
  args: Record<string, unknown>,
) => Promise<{ data?: unknown; error?: { message?: string } | null }>;

interface Deps {
  rpc: RpcFn;
  uploadBoundingBoxes: (boxes: unknown) => Promise<{ url: string | null }>;
}
interface Input {
  isRetry: boolean;
  isMultiSpeaker: boolean;
  payloadModel: string;
  retryVariant: string;
  noopAutoEscalation: boolean;
  pass: Record<string, unknown>;
  freshWireInput: typeof freshWireInput | null;
}
interface Result {
  contractActive: boolean;
  failed: string | null;
  providerCalls: number;
  rpcCalls: number;
  legacyPathUsed: boolean;
  asdKeys: string[] | null;
}

/** Mirrors the production dispatch order of index.ts. */
async function runDispatch(input: Input, deps: Deps): Promise<Result> {
  const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const rpc: RpcFn = async (fn, args) => {
    rpcCalls.push({ fn, args });
    return await deps.rpc(fn, args);
  };
  let providerCalls = 0;
  const done = (
    over: Partial<Result>,
  ): Result => ({
    contractActive: false,
    failed: null,
    providerCalls,
    rpcCalls: rpcCalls.length,
    legacyPathUsed: false,
    asdKeys: null,
    ...over,
  });

  const noopCandidate = isV407NoopRetryCandidate({
    isMultiSpeaker: input.isMultiSpeaker,
    noopAutoEscalation: input.noopAutoEscalation,
    retryVariant: input.retryVariant,
  });
  const noopGate = noopCandidate
    ? gateFrozenNoopRetry(resolveFrozenProviderInput(input.pass))
    : null;
  if (noopGate && !noopGate.ok) {
    return done({ contractActive: true, failed: noopGate.reason });
  }
  const frozen = noopGate?.ok ? noopGate.snapshot : null;

  const freshContract = !frozen && isV407FreshWireContract({
    isRetry: input.isRetry,
    isMultiSpeaker: input.isMultiSpeaker,
    payloadModel: input.payloadModel,
    retryVariant: input.retryVariant,
    hasDispatchBox: Array.isArray(input.freshWireInput?.bbox),
    canonicalBoxesAvailable: (input.freshWireInput?.bounding_boxes?.length ?? 0) > 0,
  });
  const contractActive = freshContract || !!frozen;

  if (!contractActive) {
    providerCalls++; // pre-v406 payload path — untouched
    return done({ contractActive: false, legacyPathUsed: true });
  }

  let snapshot: ProviderWireSnapshot;
  if (frozen) {
    snapshot = frozen;
  } else {
    snapshot = snapshotOf();
    const persisted = await persistFrozenProviderInput(rpc, {
      sceneId: SCENE_ID,
      passIdx: PASS_IDX,
      snapshot,
    });
    if (!persisted.ok) {
      return done({ contractActive, failed: "v408_snapshot_persist_unconfirmed" });
    }
  }

  let uploadedUrl: string | null = null;
  const wantsUrl = !frozen && input.freshWireInput?.wants_url_transport === true;
  if (wantsUrl) {
    try {
      uploadedUrl = (await deps.uploadBoundingBoxes(snapshot.bounding_boxes)).url;
    } catch {
      uploadedUrl = null;
    }
  }
  const transport = resolveAsdTransport({
    frozen: !!frozen,
    wantsUrlTransport: wantsUrl,
    uploadedUrl,
  });
  if (!transport.ok) return done({ contractActive, failed: transport.reason });

  const wire = buildProviderWire(snapshot, {
    asdTransport: transport.transport,
    boundingBoxesUrl: transport.boundingBoxesUrl,
  });
  toSyncGeneratePayload(wire, { webhookUrl: "https://hook.test/sync" });
  providerCalls++;
  return done({
    contractActive,
    providerCalls,
    asdKeys: Object.keys(wire.active_speaker_detection).sort(),
  });
}

/** Faithful fake of the installed RPC: returns the complete dialog_shots. */
const echoRpc = (mutate?: (frozen: any) => void): RpcFn => async (_fn, args) => {
  const frozen = JSON.parse(
    JSON.stringify(((args as any)._patch ?? {}).provider_input_frozen),
  );
  mutate?.(frozen);
  const passes: unknown[] = [];
  passes[(args as any)._pass_idx as number] = { provider_input_frozen: frozen };
  return { data: { passes }, error: null };
};

const deps = (over: Partial<Deps> = {}): Deps => ({
  rpc: echoRpc(),
  uploadBoundingBoxes: async () => ({ url: "https://cdn.test/asd/s11-p3.json" }),
  ...over,
});

const fresh = (over: Partial<Input> = {}): Input => ({
  isRetry: false,
  isMultiSpeaker: true,
  payloadModel: "sync-3",
  retryVariant: "bbox-url-pro",
  noopAutoEscalation: false,
  pass: {},
  freshWireInput,
  ...over,
});

/* ═══ P1-1 — retry scope ══════════════════════════════════════════════ */

Deno.test("P1-1.1 fresh multi-speaker bbox first dispatch → contract active", async () => {
  const res = await runDispatch(fresh(), deps());
  assertEquals(res.contractActive, true);
  assertEquals(res.failed, null);
  assertEquals(res.providerCalls, 1);
  assertEquals(res.asdKeys, ["auto_detect", "bounding_boxes_url"]);
});

Deno.test("P1-1.2 advance-like non-retry fresh pass → contract may be active", async () => {
  // advance:true fan-out is NOT a retry
  const res = await runDispatch(fresh({ isRetry: false }), deps());
  assertEquals(res.contractActive, true);
  assertEquals(res.providerCalls, 1);
});

Deno.test("P1-1.3 ordinary retry (bbox-url-pro) → contract INACTIVE, legacy path, 0 RPC", async () => {
  const res = await runDispatch(
    fresh({ isRetry: true, noopAutoEscalation: false, retryVariant: "bbox-url-pro" }),
    deps(),
  );
  assertEquals(res.contractActive, false);
  assertEquals(res.legacyPathUsed, true);
  assertEquals(res.rpcCalls, 0);
  assertEquals(res.providerCalls, 1);
});

Deno.test("P1-1.4 ordinary retry, non-NOOP variant → contract inactive", async () => {
  for (const variant of ["bbox-url-pro", "coords-pro-box"]) {
    const res = await runDispatch(
      fresh({ isRetry: true, noopAutoEscalation: false, retryVariant: variant }),
      deps(),
    );
    assertEquals(res.contractActive, false, variant);
    assertEquals(res.legacyPathUsed, true, variant);
    assertEquals(res.rpcCalls, 0, variant);
  }
});

Deno.test("P1-1.5 explicit NOOP retry → frozen contract active, snapshot required", async () => {
  const withSnap = await runDispatch(
    fresh({
      isRetry: true,
      noopAutoEscalation: true,
      retryVariant: "coords-pro-box",
      freshWireInput: null,
      pass: { provider_input_frozen: snapshotOf() },
    }),
    deps(),
  );
  assertEquals(withSnap.contractActive, true);
  assertEquals(withSnap.failed, null);
  assertEquals(withSnap.providerCalls, 1);
  assertEquals(withSnap.asdKeys, ["auto_detect", "bounding_boxes"]);
  assertEquals(withSnap.rpcCalls, 0);

  const without = await runDispatch(
    fresh({
      isRetry: true,
      noopAutoEscalation: true,
      retryVariant: "coords-pro-box",
      freshWireInput: null,
      pass: {},
    }),
    deps(),
  );
  assertEquals(without.failed, "noop_retry_frozen_input_missing");
  assertEquals(without.providerCalls, 0);
});

/* ═══ P1-2 — confirmed persistence ════════════════════════════════════ */

Deno.test("A exact installed RPC keys _scene_id/_pass_idx/_patch", async () => {
  const seen: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const rpc: RpcFn = async (fn, args) => {
    seen.push({ fn, args });
    return await echoRpc()(fn, args);
  };
  const res = await runDispatch(fresh(), deps({ rpc }));
  assertEquals(res.providerCalls, 1);
  assertEquals(seen.length, 1);
  assertEquals(seen[0].fn, "update_dialog_pass_slot");
  assertEquals(Object.keys(seen[0].args).sort(), ["_pass_idx", "_patch", "_scene_id"]);
  assert(!("p_scene_id" in seen[0].args));
  assert(!("p_pass_idx" in seen[0].args));
  assert(!("p_patch" in seen[0].args));
});

Deno.test("B returned dialog_shots with exact snapshot → exactly 1 provider dispatch", async () => {
  const res = await runDispatch(fresh(), deps());
  assertEquals(res.failed, null);
  assertEquals(res.providerCalls, 1);
});

Deno.test("C data=null → 0 provider calls", async () => {
  const res = await runDispatch(fresh(), deps({ rpc: async () => ({ data: null, error: null }) }));
  assertEquals(res.failed, "v408_snapshot_persist_unconfirmed");
  assertEquals(res.providerCalls, 0);
});

Deno.test("D missing passes / missing pass slot → 0 provider calls", async () => {
  const noPasses = await runDispatch(
    fresh(),
    deps({ rpc: async () => ({ data: { id: "x" }, error: null }) }),
  );
  assertEquals(noPasses.providerCalls, 0);
  assertEquals(noPasses.failed, "v408_snapshot_persist_unconfirmed");

  const noSlot = await runDispatch(
    fresh(),
    deps({ rpc: async () => ({ data: { passes: [{}, {}] }, error: null }) }),
  );
  assertEquals(noSlot.providerCalls, 0);
  assertEquals(noSlot.failed, "v408_snapshot_persist_unconfirmed");
});

Deno.test("E missing / incomplete provider_input_frozen → 0 provider calls", async () => {
  const missing = await runDispatch(
    fresh(),
    deps({
      rpc: async (_f, args) => {
        const passes: unknown[] = [];
        passes[(args as any)._pass_idx as number] = { some_other_field: 1 };
        return { data: { passes }, error: null };
      },
    }),
  );
  assertEquals(missing.providerCalls, 0);

  const incomplete = await runDispatch(
    fresh(),
    deps({ rpc: echoRpc((f) => { delete f.audio_url; }) }),
  );
  assertEquals(incomplete.providerCalls, 0);
  assertEquals(incomplete.failed, "v408_snapshot_persist_unconfirmed");
});

Deno.test("F persisted snapshot mismatch → 0 provider calls", async () => {
  const audioDiff = await runDispatch(
    fresh(),
    deps({ rpc: echoRpc((f) => { f.audio_url = "https://cdn.test/OTHER.wav"; }) }),
  );
  assertEquals(audioDiff.providerCalls, 0);
  assertEquals(audioDiff.failed, "v408_snapshot_persist_unconfirmed");

  const boxesDiff = await runDispatch(
    fresh(),
    deps({ rpc: echoRpc((f) => { f.bounding_boxes = [BOX]; }) }),
  );
  assertEquals(boxesDiff.providerCalls, 0);

  const genDiff = await runDispatch(
    fresh(),
    deps({ rpc: echoRpc((f) => { f.plate_generation = 99; }) }),
  );
  assertEquals(genDiff.providerCalls, 0);
});

Deno.test("G rpc error → 0 provider calls", async () => {
  const res = await runDispatch(
    fresh(),
    deps({ rpc: async () => ({ data: null, error: { message: "boom" } }) }),
  );
  assertEquals(res.providerCalls, 0);
  assertEquals(res.failed, "v408_snapshot_persist_unconfirmed");
});

Deno.test("H rpc throw → 0 provider calls", async () => {
  const res = await runDispatch(
    fresh(),
    deps({ rpc: () => Promise.reject(new Error("network")) }),
  );
  assertEquals(res.providerCalls, 0);
  assertEquals(res.failed, "v408_snapshot_persist_unconfirmed");
});
