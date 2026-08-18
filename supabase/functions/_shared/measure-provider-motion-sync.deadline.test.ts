/**
 * FA-4 v404 P1-C — global wall-clock deadline tests (deterministic).
 *
 * No real Lambda invokes: `renderStill` / `probeDims` / `now` are injected.
 * Run: deno test supabase/functions/_shared/measure-provider-motion-sync.deadline.test.ts
 */
import { assert, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import jpeg from "npm:jpeg-js@0.4.4";
import {
  MEASUREMENT_DEADLINE_MS,
  measureProviderMotionSync,
  remainingBudgetMs,
  type MeasurementBudget,
} from "./measure-provider-motion-sync.ts";

const W = 1280;
const H = 720;

/** Deterministic synthetic still: constant grey + per-frame delta. */
function still(seed: number): Uint8Array {
  const data = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    const v = (100 + ((seed * 17 + i) % 40)) & 0xff;
    data[i * 4] = v;
    data[i * 4 + 1] = v;
    data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  return new Uint8Array(jpeg.encode({ data, width: W, height: H }, 85).data);
}

const CACHE = new Map<number, Uint8Array>();
function cachedStill(seed: number): Uint8Array {
  const hit = CACHE.get(seed);
  if (hit) return hit;
  const bytes = still(seed);
  CACHE.set(seed, bytes);
  return bytes;
}

interface Harness {
  clock: { t: number };
  budgets: number[];
}

function harness(costPerStill: number, probeCost = 0): Harness & {
  args: Parameters<typeof measureProviderMotionSync>[0];
} {
  const clock = { t: 1_000_000 };
  const budgets: number[] = [];
  return {
    clock,
    budgets,
    args: {
      preclipUrl: "https://example.test/preclip.mp4",
      providerOutputUrl: "https://example.test/provider.mp4",
      durationSeconds: 4,
      preclipDims: { width: 720, height: 720 },
      providerDims: { width: 720, height: 720 },
      now: () => clock.t,
      probeDims: async (_u: string) => {
        clock.t += probeCost;
        return { width: 720, height: 720 };
      },
      renderStill: (
        _u: string,
        _t: number,
        f: number,
        budget: MeasurementBudget,
      ): Promise<Uint8Array> => {
        budgets.push(budget.remainingMs);
        clock.t += costPerStill;
        return Promise.resolve(cachedStill(f));
      },
    },
  };
}

Deno.test("A. all operations well inside the budget → measured", async () => {
  const h = harness(100);
  const r = await measureProviderMotionSync(h.args);
  assertEquals(r.measurement_status, "measured", r.reason);
  assert(typeof r.deltaMean === "number");
});

Deno.test("B. preclip consumes almost the whole budget → provider has none → unmeasurable deadline", async () => {
  // 6 stills × 4600 ms = 27600 ms → the preclip stage already overruns.
  const h = harness(4600);
  const r = await measureProviderMotionSync(h.args);
  assertEquals(r.measurement_status, "unmeasurable");
  assertEquals(r.reason, "motion_probe_indeterminate:measurement_deadline_exceeded");
});

Deno.test("C. a hanging still is cut by the global root abort → unmeasurable deadline", async () => {
  const clock = { t: 0 };
  const r = await measureProviderMotionSync({
    preclipUrl: "https://example.test/a.mp4",
    providerOutputUrl: "https://example.test/b.mp4",
    durationSeconds: 4,
    preclipDims: { width: 720, height: 720 },
    providerDims: { width: 720, height: 720 },
    deadlineMs: 60,
    now: () => (clock.t += 5),
    renderStill: (_u, _t, _f, budget) =>
      new Promise<Uint8Array>((_res, rej) => {
        budget.signal.addEventListener("abort", () => rej(new Error("aborted")), { once: true });
      }),
  });
  assertEquals(r.measurement_status, "unmeasurable");
  assertEquals(r.reason, "motion_probe_indeterminate:measurement_deadline_exceeded");
});

Deno.test("D. no request ever receives the full deadline again once budget was spent", async () => {
  const h = harness(1000);
  await measureProviderMotionSync(h.args);
  assert(h.budgets.length > 1, "expected several still invokes");
  assertEquals(h.budgets[0] <= MEASUREMENT_DEADLINE_MS, true);
  for (let i = 1; i < h.budgets.length; i++) {
    assert(
      h.budgets[i] < h.budgets[0],
      `budget #${i} (${h.budgets[i]}) must be smaller than the first (${h.budgets[0]})`,
    );
    assert(h.budgets[i] <= MEASUREMENT_DEADLINE_MS);
  }
});

Deno.test("E. the total run can never reach 2 × the deadline", async () => {
  const h = harness(3000);
  const start = h.clock.t;
  await measureProviderMotionSync(h.args);
  const elapsed = h.clock.t - start;
  assert(
    elapsed < 2 * MEASUREMENT_DEADLINE_MS,
    `elapsed ${elapsed} must stay below ${2 * MEASUREMENT_DEADLINE_MS}`,
  );
});

Deno.test("E2. budgeted dimension probe cannot outlive the deadline", async () => {
  const clock = { t: 0 };
  const r = await measureProviderMotionSync({
    preclipUrl: "https://example.test/a.mp4",
    providerOutputUrl: "https://example.test/b.mp4",
    durationSeconds: 4,
    deadlineMs: 50,
    now: () => clock.t,
    probeDims: () => new Promise(() => {/* never resolves */}),
    renderStill: () => Promise.resolve(cachedStill(1)),
  });
  assertEquals(r.measurement_status, "unmeasurable");
  assertEquals(r.reason, "motion_probe_indeterminate:measurement_deadline_exceeded");
});

Deno.test("remainingBudgetMs is a pure subtraction", () => {
  assertEquals(remainingBudgetMs(100, 27100), 27000);
  assertEquals(remainingBudgetMs(27100, 27100), 0);
  assert(remainingBudgetMs(30000, 27100) < 0);
});
