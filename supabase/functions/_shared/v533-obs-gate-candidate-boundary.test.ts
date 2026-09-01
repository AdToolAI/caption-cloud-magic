/**
 * V533-OBS — GATE / CANDIDATE BOUNDARY OBSERVABILITY
 *
 * Three verdicts bracket the face-gate fan-out and every V530 candidate:
 *   `gate_fanout_start`, `v530_candidate_done`, `gate_fanout_done`.
 *
 * They are telemetry. Nothing in the pipeline may branch on them, no
 * threshold, provider, timeout, lock or schema moves because of them, and a
 * failing recorder must be invisible to the dispatcher.
 *
 * This suite proves:
 *   A. the candidate/fan-out semantics with a faithful loop harness, and
 *   B. that the runtime file wires exactly this contract and nothing else.
 */

import { assert, assertEquals } from "jsr:@std/assert@1";

const RUNTIME_PATH = new URL("../compose-dialog-segments/index.ts", import.meta.url);
const SRC = await Deno.readTextFile(RUNTIME_PATH);

// ── A. Loop harness — mirrors the instrumented gateOne candidate loop ──────

type Validation = { ok: boolean; faceVisible: boolean };
type Candidate = {
  frame: number;
  validation: Validation;
  v523Refuses?: boolean;
  v530?: {
    ok: boolean;
    decodeCompleted?: boolean;
    stillBytes?: number | null;
    decodeMs?: number | null;
    stillDims?: { width: number; height: number } | null;
  };
};

type Obs = { verdict: string; details: Record<string, unknown> };

function makeObserver(opts: { throws?: boolean; memory?: () => Record<string, number> } = {}) {
  const rows: Obs[] = [];
  const memory = opts.memory ?? (() => ({}));
  const observe = async (verdict: string, details: Record<string, unknown>) => {
    try {
      if (opts.throws) throw new Error("recorder down");
      rows.push({ verdict, details });
    } catch {
      // doubly fail-open
    }
    await Promise.resolve();
  };
  return { rows, observe, memory };
}

async function gateOne(
  pass: { idx: number; candidates: Candidate[] },
  obs: ReturnType<typeof makeObserver>,
): Promise<{ accepted: boolean; acceptedFrame: number | null; visited: number }> {
  let accepted = false;
  let acceptedFrame: number | null = null;
  let v533CandidateIdx = -1;
  let visited = 0;
  for (const c of pass.candidates) {
    v533CandidateIdx++;
    visited++;
    const v = c.validation;
    if (v.ok && !v.faceVisible) continue;

    const v530 = c.v530 ?? { ok: false };
    await obs.observe("v530_candidate_done", {
      pass_idx: pass.idx,
      candidate_index: v533CandidateIdx,
      gate_frame: c.frame,
      v530_frame: c.frame,
      v530_ok: v530.ok === true,
      decode_completed: (v530 as any).decodeCompleted === true,
      still_bytes: Number.isFinite((v530 as any).stillBytes) ? Number((v530 as any).stillBytes) : null,
      still_w: Number.isFinite(v530.stillDims?.width) ? Number(v530.stillDims?.width) : null,
      still_h: Number.isFinite(v530.stillDims?.height) ? Number(v530.stillDims?.height) : null,
      decode_ms: Number.isFinite((v530 as any).decodeMs) ? Number((v530 as any).decodeMs) : null,
      elapsed_ms: 1,
      ...obs.memory(),
    });

    if (c.v523Refuses) continue;
    accepted = true;
    acceptedFrame = c.frame;
    break;
  }
  return { accepted, acceptedFrame, visited };
}

const okVal: Validation = { ok: true, faceVisible: true };
const invisible: Validation = { ok: true, faceVisible: false };

async function fanout(passes: Array<{ idx: number; candidates: Candidate[] }>, obs: ReturnType<typeof makeObserver>) {
  await obs.observe("gate_fanout_start", { pass_count: passes.length, elapsed_ms: 0, ...obs.memory() });
  const results = await Promise.all(passes.map((p) => gateOne(p, obs)));
  await obs.observe("gate_fanout_done", { pass_count: passes.length, elapsed_ms: 2, ...obs.memory() });
  return results;
}

/** Gen31 shape: 6 passes, one of which needs two candidates → 7 candidates. */
function gen31Passes() {
  const single = (idx: number, frame: number) => ({ idx, candidates: [{ frame, validation: okVal, v530: { ok: true, decodeCompleted: true, decodeMs: 3, stillBytes: 100, stillDims: { width: 1284, height: 718 } } }] });
  const passes = [0, 1, 2, 3, 5].map((i, n) => single(i, 100 + n));
  passes.splice(4, 0, {
    idx: 4,
    candidates: [
      { frame: 113, validation: okVal, v523Refuses: true, v530: { ok: true, decodeCompleted: true, decodeMs: 4, stillBytes: 120, stillDims: { width: 1284, height: 718 } } },
      { frame: 118, validation: okVal, v530: { ok: true, decodeCompleted: true, decodeMs: 4, stillBytes: 120, stillDims: { width: 1284, height: 718 } } },
    ],
  });
  return passes;
}

Deno.test("V533-OBS 1 — 6 passes / 7 candidates emit exactly 9 observations", async () => {
  const obs = makeObserver();
  await fanout(gen31Passes(), obs);
  assertEquals(obs.rows.filter((r) => r.verdict === "gate_fanout_start").length, 1);
  assertEquals(obs.rows.filter((r) => r.verdict === "v530_candidate_done").length, 7);
  assertEquals(obs.rows.filter((r) => r.verdict === "gate_fanout_done").length, 1);
  assertEquals(obs.rows.length, 9);
});

Deno.test("V533-OBS 2 — candidate_index resets per pass", async () => {
  const obs = makeObserver();
  await fanout(gen31Passes(), obs);
  const byPass = new Map<number, number[]>();
  for (const r of obs.rows.filter((x) => x.verdict === "v530_candidate_done")) {
    const p = Number(r.details.pass_idx);
    byPass.set(p, [...(byPass.get(p) ?? []), Number(r.details.candidate_index)]);
  }
  for (const idxs of byPass.values()) assertEquals(idxs, idxs.map((_, i) => i));
  assertEquals(byPass.get(4), [0, 1]);
});

Deno.test("V533-OBS 3 — candidates skipped by (v.ok && !v.faceVisible) still increment the index", async () => {
  const obs = makeObserver();
  const res = await gateOne({
    idx: 0,
    candidates: [
      { frame: 10, validation: invisible },
      { frame: 20, validation: okVal, v530: { ok: true, decodeCompleted: true } },
    ],
  }, obs);
  assertEquals(res.acceptedFrame, 20);
  assertEquals(obs.rows.length, 1);
  assertEquals(obs.rows[0].details.candidate_index, 1);
  assertEquals(obs.rows[0].details.gate_frame, 20);
});

Deno.test("V533-OBS 4 — V523 refusal still continues to the next candidate", async () => {
  const obs = makeObserver();
  const res = await gateOne({
    idx: 1,
    candidates: [
      { frame: 30, validation: okVal, v523Refuses: true, v530: { ok: true, decodeCompleted: true } },
      { frame: 40, validation: okVal, v530: { ok: true, decodeCompleted: true } },
    ],
  }, obs);
  assertEquals(res.accepted, true);
  assertEquals(res.acceptedFrame, 40);
  assertEquals(obs.rows.map((r) => r.details.candidate_index), [0, 1]);
});

Deno.test("V533-OBS 5 — normal first-candidate break is unchanged", async () => {
  const obs = makeObserver();
  const res = await gateOne({
    idx: 2,
    candidates: [
      { frame: 50, validation: okVal, v530: { ok: true, decodeCompleted: true } },
      { frame: 60, validation: okVal },
    ],
  }, obs);
  assertEquals(res.visited, 1);
  assertEquals(res.acceptedFrame, 50);
  assertEquals(obs.rows.length, 1);
});

Deno.test("V533-OBS 6 — successful V530 reports ok/decode_completed/finite decode_ms", async () => {
  const obs = makeObserver();
  await gateOne({
    idx: 0,
    candidates: [{ frame: 70, validation: okVal, v530: { ok: true, decodeCompleted: true, decodeMs: 12.5, stillBytes: 4096, stillDims: { width: 1284, height: 718 } } }],
  }, obs);
  const d = obs.rows[0].details;
  assertEquals(d.v530_ok, true);
  assertEquals(d.decode_completed, true);
  assert(Number.isFinite(d.decode_ms as number));
  assertEquals(d.still_bytes, 4096);
  assertEquals(d.still_w, 1284);
  assertEquals(d.still_h, 718);
});

Deno.test("V533-OBS 7 — pre-decode failure reports false/false and null numbers", async () => {
  const obs = makeObserver();
  await gateOne({ idx: 0, candidates: [{ frame: 80, validation: okVal, v530: { ok: false } }] }, obs);
  const d = obs.rows[0].details;
  assertEquals(d.v530_ok, false);
  assertEquals(d.decode_completed, false);
  assertEquals(d.still_bytes, null);
  assertEquals(d.decode_ms, null);
  assertEquals(d.still_w, null);
  assertEquals(d.still_h, null);
});

Deno.test("V533-OBS 8 — a throwing recorder changes neither gate return nor candidate count", async () => {
  const good = makeObserver();
  const bad = makeObserver({ throws: true });
  const a = await fanout(gen31Passes(), good);
  const b = await fanout(gen31Passes(), bad);
  assertEquals(b, a);
  assertEquals(bad.rows.length, 0);
});

Deno.test("V533-OBS 9 — throwing Deno.memoryUsage still emits observations without memory fields", async () => {
  const obs = makeObserver({
    memory: () => {
      try {
        throw new Error("memoryUsage unavailable");
      } catch {
        return {};
      }
    },
  });
  await fanout(gen31Passes(), obs);
  assertEquals(obs.rows.length, 9);
  for (const r of obs.rows) {
    assert(!("rss" in r.details));
    assert(!("heap_used" in r.details));
    assert(!("external" in r.details));
  }
});

Deno.test("V533-OBS 10 — details carry no URLs, payloads, base64, image bytes or provider bodies", async () => {
  const obs = makeObserver({ memory: () => ({ rss: 1, heap_used: 2, external: 3 }) });
  await fanout(gen31Passes(), obs);
  const allowed = new Set([
    "pass_idx", "candidate_index", "gate_frame", "v530_frame", "v530_ok", "decode_completed",
    "still_bytes", "still_w", "still_h", "decode_ms", "elapsed_ms", "pass_count",
    "rss", "heap_used", "external",
  ]);
  for (const r of obs.rows) {
    for (const [k, v] of Object.entries(r.details)) {
      assert(allowed.has(k), `unexpected telemetry key ${k}`);
      assert(v === null || typeof v === "number" || typeof v === "boolean", `non-scalar value for ${k}`);
    }
    const blob = JSON.stringify(r.details);
    assert(!/https?:\/\//i.test(blob));
    assert(!/base64|data:image|portrait|payload|arrayBuffer/i.test(blob));
  }
});

// ── B. Runtime-source contract ────────────────────────────────────────────

Deno.test("V533-OBS 11 — exactly three new verdict literals in the runtime file", () => {
  for (const v of ["gate_fanout_start", "v530_candidate_done", "gate_fanout_done"]) {
    assertEquals(SRC.split(`"${v}"`).length - 1, 1, `verdict ${v} must appear exactly once`);
  }
  const verdicts = [...SRC.matchAll(/v533Observe\(\s*"([a-z0-9_]+)"/g)].map((m) => m[1]).sort();
  assertEquals(verdicts, ["gate_fanout_done", "gate_fanout_start", "v530_candidate_done"]);
  // No business branch consumes a V533 field or verdict.
  assert(!/if\s*\([^)]*v533/.test(SRC));
  assert(!/v533CandidateIdx\s*[<>=!]/.test(SRC));
  for (const f of ["candidate_index", "decode_completed", "gate_fanout_start", "gate_fanout_done"]) {
    assert(!new RegExp(`(if|while|switch)\\s*\\([^)]*${f}`).test(SRC), `${f} must not gate control flow`);
  }
});

Deno.test("V533-OBS 12 — V531-OBS and V532-A wiring untouched", () => {
  for (const v of ["motion_measure_start", "motion_measure_done", "motion_measure_error", "apply_not_confirmed", "lock_phase_io_rounds_exhausted"]) {
    assert(!SRC.includes(v), `${v} belongs to V531-OBS handlers, not this file`);
  }
  const watchdog = Deno.readTextFileSync(new URL("../lipsync-watchdog/index.ts", import.meta.url));
  const webhook = Deno.readTextFileSync(new URL("../sync-so-webhook/index.ts", import.meta.url));
  assert(watchdog.includes("apply_not_confirmed"));
  for (const v of ["motion_measure_start", "motion_measure_done", "motion_measure_error", "lock_phase_io_rounds_exhausted"]) {
    assert(webhook.includes(v), `V531-OBS verdict ${v} missing from sync-so-webhook`);
  }
  assert(!watchdog.includes("v533"));
  assert(!webhook.includes("v533"));
  // V532-A telemetry still present and unchanged in shape.
  assert(SRC.includes("v532a_target_partial"));
});

Deno.test("V533-OBS 13 — frozen V530 structure kept; only the V530 decode is instrumented", () => {
  assert(SRC.includes("const v530TargetFaces = async (frameNumber: number): Promise<V530Target> =>"));
  assert(SRC.includes("if (v.ok && !v.faceVisible) continue;"));
  assert(SRC.includes("const gateResults = await Promise.all(builtPasses.map((p: any) => gateOne(p)));"));
  assert(SRC.includes("frameCandidatesForTurn"));
  // Exactly one instrumented decode, and it is the V530 one.
  const decodes = [...SRC.matchAll(/jpegDecodeV526\.decode\(/g)].length;
  assert(decodes >= 2, "both V530 and V526-B decodes must still exist");
  assertEquals(SRC.split("v533DecodeStart").length - 1, 2);
  const v530Idx = SRC.indexOf("const v530TargetFaces");
  const instrumented = SRC.indexOf("v533DecodeStart");
  assert(instrumented > v530Idx, "instrumentation must sit inside v530TargetFaces");
  assertEquals(SRC.split("v533CandidateIdx++").length - 1, 1);
});
