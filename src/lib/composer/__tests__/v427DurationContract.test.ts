/**
 * v427B — guards the duration contract.
 *
 * The constants are lifted verbatim from the productive timing logic in
 * `compose-twoshot-audio`. If someone changes one of them, that is a quality
 * and cost change, not a refactor — this test makes it loud.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../../../..");
const CONTRACT = resolve(ROOT, "supabase/functions/_shared/v427-duration-contract.ts");
const AUDIO = resolve(ROOT, "supabase/functions/compose-twoshot-audio/index.ts");

const contractSrc = readFileSync(CONTRACT, "utf8");
const audioSrc = readFileSync(AUDIO, "utf8");

describe("v427 duration contract — frozen values", () => {
  it("keeps the productive tail padding at 300 ms", () => {
    expect(contractSrc).toContain("export const TAIL_PADDING_MS = 300;");
  });

  it("keeps grace, cap, step and inter-speaker pause unchanged", () => {
    expect(contractSrc).toContain("export const OVERFLOW_GRACE_MS = 300;");
    expect(contractSrc).toContain("export const MAX_EXTEND_MS = 5_000;");
    expect(contractSrc).toContain("export const DURATION_STEP_MS = 100;");
    expect(contractSrc).toContain("export const INTER_SPEAKER_PAUSE_MS = 250;");
  });

  it("keeps the provider windows the backend enforces", () => {
    expect(contractSrc).toContain('"ai-hailuo": { buckets: [6_000, 10_000]');
    expect(contractSrc).toContain('"ai-happyhorse": { buckets: [], minMs: 3_000, maxMs: 15_000 }');
    expect(contractSrc).toContain('"ai-seedance25": { buckets: [], minMs: 4_000, maxMs: 30_000 }');
  });
});

describe("v427 duration contract — no lip-sync coupling", () => {
  it("imports nothing (pure arithmetic module)", () => {
    expect(/^\s*import\s/m.test(contractSrc)).toBe(false);
  });
});

describe("compose-twoshot-audio uses the named constants", () => {
  it("no longer hardcodes the timing literals", () => {
    expect(audioSrc).toContain("v427-duration-contract.ts");
    expect(audioSrc).toContain("const OVERFLOW_GRACE_SEC = OVERFLOW_GRACE_MS / 1000;");
    expect(audioSrc).toContain("const MAX_EXTEND_SEC = MAX_EXTEND_MS / 1000;");
    expect(audioSrc).toContain("const INTER_SPEAKER_PAUSE_SEC = INTER_SPEAKER_PAUSE_MS / 1000;");
    expect(audioSrc).not.toContain("Math.ceil((spokenSec + 0.30)");
  });
});
