/**
 * V435 — harness contract tests.
 *
 * Two things must hold before any Samuel cross-test result is trustworthy:
 *   1. a cell whose pinned bytes do not re-hash to the recorded sha256 is
 *      REFUSED, never measured;
 *   2. only the predeclared interpretation rules may produce a cause — every
 *      other shape is UNDECIDED.
 */
import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
// @ts-ignore — plain ESM harness, no type declarations by design.
import {
  V435_STATUS,
  V435_CELLS,
  verifyPinBytes,
  gateCell,
  interpretCells,
  madSeparation,
  selectPin,
} from "../../scripts/calibration/v435/cross-test.mjs";

const bytes = new Uint8Array([1, 2, 3, 4, 5]);
const good = createHash("sha256").update(bytes).digest("hex");

describe("V435 sha256 gate", () => {
  it("accepts bytes matching the recorded pin", () => {
    const r = verifyPinBytes({ sha256: good, byte_size: 5 }, bytes);
    expect(r.status).toBe(V435_STATUS.OK);
  });

  it("refuses on sha256 mismatch", () => {
    const r = verifyPinBytes({ sha256: "0".repeat(64), byte_size: 5 }, bytes);
    expect(r.status).toBe(V435_STATUS.REFUSED);
    expect(r.reason).toBe("sha256_mismatch");
  });

  it("refuses when the pin carries no hash", () => {
    expect(verifyPinBytes({ sha256: null }, bytes).reason).toBe("pin_missing_sha256");
  });

  it("refuses on byte-size drift even when the hash field looks valid", () => {
    const r = verifyPinBytes({ sha256: good, byte_size: 9 }, bytes);
    expect(r.status).toBe(V435_STATUS.REFUSED);
    expect(r.reason).toBe("byte_size_mismatch");
  });

  it("refuses empty payloads", () => {
    expect(verifyPinBytes({ sha256: good }, new Uint8Array()).reason).toBe("empty_bytes");
  });

  it("propagates a single refusal to the whole cell", () => {
    const cell = gateCell("A", [
      { status: V435_STATUS.OK },
      { status: V435_STATUS.REFUSED, reason: "sha256_mismatch" },
    ]);
    expect(cell.status).toBe(V435_STATUS.REFUSED);
    expect(cell.reason).toBe("sha256_mismatch");
  });

  it("reports a cell without pins as missing, not ok", () => {
    expect(gateCell("B", []).status).toBe(V435_STATUS.MISSING);
  });
});

describe("V435 predeclared interpretation rules", () => {
  it("exposes exactly four authorized cells", () => {
    expect(V435_CELLS).toEqual(["A", "B", "C", "D"]);
  });

  it("A+B no-op, C motion => preclip/face-window trigger", () => {
    expect(
      interpretCells({ A: "noop", B: "noop", C: "motion", D: "noop" }).verdict,
    ).toBe("PRECLIP");
  });

  it("A+C no-op, B motion => audio/turn trigger", () => {
    expect(
      interpretCells({ A: "noop", B: "motion", C: "noop", D: "noop" }).verdict,
    ).toBe("AUDIO/TURN");
  });

  it("A differing from D => provider sporadic, and it outranks input rules", () => {
    const r = interpretCells({ A: "noop", B: "noop", C: "motion", D: "motion" });
    expect(r.verdict).toBe("PROVIDER-SPORADIC");
  });

  it("returns UNDECIDED instead of inventing a cause", () => {
    expect(interpretCells({ A: "motion", B: "motion", C: "motion", D: "motion" }).verdict)
      .toBe("UNDECIDED");
  });

  it("returns UNDECIDED on an indeterminate or incomplete label set", () => {
    expect(interpretCells({ A: "noop", B: "indeterminate", C: "motion", D: "noop" }).verdict)
      .toBe("UNDECIDED");
    expect(interpretCells({ A: "noop", B: "noop", C: "motion" } as never).verdict)
      .toBe("UNDECIDED");
  });
});

describe("V435 MAD-ratio evidence", () => {
  it("reports clean separation without granting authority", () => {
    const r = madSeparation([
      { cell: "A", label: "noop", mad_ratio: 1.30 },
      { cell: "C", label: "motion", mad_ratio: 1.68 },
    ]);
    expect(r.separated).toBe(true);
    expect(r.authority).toBe("telemetry_only");
  });

  it("reports overlap as not separated", () => {
    const r = madSeparation([
      { cell: "A", label: "noop", mad_ratio: 1.80 },
      { cell: "C", label: "motion", mad_ratio: 1.70 },
    ]);
    expect(r.separated).toBe(false);
  });

  it("needs both classes before claiming anything", () => {
    expect(madSeparation([{ cell: "A", label: "noop", mad_ratio: 1.3 }]).separated).toBe(false);
  });
});

describe("V435 pin selection", () => {
  const pins = [
    { kind: "preclip", pass_idx: 2, attempt: 0, run_id: "r1", generation: 4, sha256: good },
    { kind: "provider-output", pass_idx: 2, attempt: 0, run_id: "r1", generation: 4, sha256: good },
    { kind: "provider-output", pass_idx: 2, attempt: 1, run_id: "r1", generation: 4, sha256: good },
  ];

  it("selects by kind, pass and attempt", () => {
    expect(selectPin(pins, { kind: "provider-output", passIdx: 2, attempt: 1 })).toBe(pins[2]);
  });

  it("returns null rather than a near match from another run", () => {
    expect(selectPin(pins, { kind: "preclip", passIdx: 2, runId: "r2" })).toBeNull();
  });
});
