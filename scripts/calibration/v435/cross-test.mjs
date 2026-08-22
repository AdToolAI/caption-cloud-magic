#!/usr/bin/env node
/**
 * V435 — offline Samuel A/B/C/D cross-test harness.
 *
 * CONTRACT
 * --------
 * 1. It reads ONLY immutable V434 pins (`v434_artifact_pins` rows, exported to
 *    JSON). It never reads a mutable production URL, and it never writes to a
 *    production scene.
 * 2. Before every measurement it re-downloads the pinned object and verifies
 *    the recorded sha256 against the actual bytes. On mismatch the cell is
 *    REFUSED (`status: "refused"`) — it is never measured, never labelled and
 *    never enters the calibration manifest.
 * 3. It is telemetry-only. It derives no threshold, changes no verdict and has
 *    no effect on the frozen FA-4 production gate.
 *
 * USAGE
 *   node scripts/calibration/v435/cross-test.mjs verify   --pins pins.json
 *   node scripts/calibration/v435/cross-test.mjs interpret --results cells.json
 *
 * `pins.json` is the raw output of:
 *   select * from public.v434_artifact_pins where scene_id = '<scene>' ;
 */

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

/** Exit reasons that are protocol outcomes, not crashes. */
export const V435_STATUS = {
  OK: "ok",
  REFUSED: "refused",
  MISSING: "missing",
};

/** The four authorized cells. Nothing else may call the provider. */
export const V435_CELLS = ["A", "B", "C", "D"];

export function sha256Hex(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Hash gate. A cell may only be measured when EVERY input pin re-hashes to the
 * sha256 recorded at pin time.
 */
export function verifyPinBytes(pin, bytes) {
  if (!pin || typeof pin.sha256 !== "string" || pin.sha256.length !== 64) {
    return { status: V435_STATUS.REFUSED, reason: "pin_missing_sha256" };
  }
  if (!bytes || bytes.length === 0) {
    return { status: V435_STATUS.REFUSED, reason: "empty_bytes" };
  }
  const actual = sha256Hex(bytes);
  if (actual !== pin.sha256) {
    return {
      status: V435_STATUS.REFUSED,
      reason: "sha256_mismatch",
      expected: pin.sha256,
      actual,
    };
  }
  if (Number.isFinite(Number(pin.byte_size)) && Number(pin.byte_size) !== bytes.length) {
    return {
      status: V435_STATUS.REFUSED,
      reason: "byte_size_mismatch",
      expected: Number(pin.byte_size),
      actual: bytes.length,
    };
  }
  return { status: V435_STATUS.OK, sha256: actual, bytes: bytes.length };
}

/**
 * A cell is measurable only when both its input pins AND its output pin pass
 * the hash gate. Any refusal propagates to the cell.
 */
export function gateCell(cellId, checks) {
  const refused = checks.find((c) => c.status === V435_STATUS.REFUSED);
  if (refused) {
    return { cell: cellId, status: V435_STATUS.REFUSED, reason: refused.reason, detail: refused };
  }
  if (checks.length === 0) {
    return { cell: cellId, status: V435_STATUS.MISSING, reason: "no_pins" };
  }
  return { cell: cellId, status: V435_STATUS.OK };
}

/**
 * PREDECLARED interpretation rules (V435 gate spec, step 12).
 * `labels` = human/visual labels per cell: "motion" | "noop" | "indeterminate".
 * No rule may be invented after the fact: anything that does not match returns
 * UNDECIDED.
 */
export function interpretCells(labels) {
  const a = labels.A;
  const b = labels.B;
  const c = labels.C;
  const d = labels.D;

  if ([a, b, c, d].some((v) => v == null)) {
    return { verdict: "UNDECIDED", reason: "incomplete_cells" };
  }
  if ([a, b, c, d].some((v) => v === "indeterminate")) {
    return { verdict: "UNDECIDED", reason: "indeterminate_label_present" };
  }

  // Sporadic provider behaviour dominates: if the same input pair produces
  // different outcomes, no input-conditioning conclusion is safe.
  if (a !== d) {
    return { verdict: "PROVIDER-SPORADIC", reason: "a_differs_from_d" };
  }
  if (a === "noop" && b === "noop" && c === "motion") {
    return { verdict: "PRECLIP", reason: "a_b_noop_c_motion" };
  }
  if (a === "noop" && c === "noop" && b === "motion") {
    return { verdict: "AUDIO/TURN", reason: "a_c_noop_b_motion" };
  }
  return { verdict: "UNDECIDED", reason: "no_predeclared_rule_matched" };
}

/**
 * MAD-ratio separation check. Evidence only — never promoted to a threshold.
 */
export function madSeparation(cells) {
  const motion = cells.filter((c) => c.label === "motion" && Number.isFinite(c.mad_ratio));
  const noop = cells.filter((c) => c.label === "noop" && Number.isFinite(c.mad_ratio));
  if (motion.length === 0 || noop.length === 0) {
    return { separated: false, reason: "need_both_classes", authority: "telemetry_only" };
  }
  const minMotion = Math.min(...motion.map((c) => c.mad_ratio));
  const maxNoop = Math.max(...noop.map((c) => c.mad_ratio));
  return {
    separated: minMotion > maxNoop,
    min_motion: minMotion,
    max_noop: maxNoop,
    margin: Number((minMotion - maxNoop).toFixed(4)),
    authority: "telemetry_only",
  };
}

/** Pin lookup by (kind, pass_idx, attempt) inside one run/generation. */
export function selectPin(pins, { kind, passIdx, attempt = 0, runId = null, generation = null }) {
  const hit = pins.find(
    (p) =>
      p.kind === kind &&
      Number(p.pass_idx) === Number(passIdx) &&
      Number(p.attempt ?? 0) === Number(attempt) &&
      (runId == null || p.run_id === runId) &&
      (generation == null || Number(p.generation) === Number(generation)),
  );
  return hit ?? null;
}

async function fetchBytes(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch_failed ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

async function cmdVerify(pinsPath) {
  const pins = JSON.parse(await readFile(pinsPath, "utf8"));
  const out = [];
  for (const pin of pins) {
    let result;
    try {
      const bytes = await fetchBytes(pin.pinned_url);
      result = verifyPinBytes(pin, bytes);
    } catch (e) {
      result = { status: V435_STATUS.REFUSED, reason: String(e.message ?? e) };
    }
    out.push({ key: pin.object_key, kind: pin.kind, pass_idx: pin.pass_idx, ...result });
    console.log(
      `[v435] ${pin.kind} pass=${pin.pass_idx} attempt=${pin.attempt ?? 0} -> ${result.status}${
        result.reason ? ` (${result.reason})` : ""
      }`,
    );
  }
  const refused = out.filter((o) => o.status === V435_STATUS.REFUSED).length;
  console.log(`[v435] verified=${out.length - refused} refused=${refused}`);
  process.exitCode = refused > 0 ? 1 : 0;
}

async function cmdInterpret(resultsPath) {
  const cells = JSON.parse(await readFile(resultsPath, "utf8"));
  const labels = Object.fromEntries(cells.map((c) => [c.cell, c.label]));
  const verdict = interpretCells(labels);
  const sep = madSeparation(cells);
  console.log(JSON.stringify({ verdict, mad_separation: sep }, null, 2));
}

const isCli = process.argv[1] && process.argv[1].endsWith("cross-test.mjs");
if (isCli) {
  const [cmd, ...rest] = process.argv.slice(2);
  const argOf = (name) => {
    const i = rest.indexOf(name);
    return i >= 0 ? rest[i + 1] : null;
  };
  if (cmd === "verify") await cmdVerify(argOf("--pins"));
  else if (cmd === "interpret") await cmdInterpret(argOf("--results"));
  else {
    console.error("usage: cross-test.mjs verify --pins <file> | interpret --results <file>");
    process.exitCode = 2;
  }
}
