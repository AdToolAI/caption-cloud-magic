# V435 — Immutable Calibration Bootstrap + Samuel Cross-Test

**Gate verdict:** `V435 = FAIL/BLOCKED — Phase 1 not executable: no owner session obtainable; pins = no (0 rows); cross-test NOT RUN` → STOP

Date: 2026-08-22. HEAD at gate start: `cb8701985b11513db71a41da2181b92d23efb47a`, worktree clean.

---

## 1. Identity / preconditions (all confirmed)

| Check | Result |
|---|---|
| V434 modules present | yes — `v434-immutable-artifact.ts`, `v434-mad-ratio.ts`, `v434-motion-roi.ts`, `v434-calibration-manifest.ts` |
| `v434_artifact_pins` table exists | yes |
| `v434_artifact_pins` row count before Phase 1 | **0** |
| Deployed `sync-so-webhook` carries the pin path | yes (`recordV434Pin`, provider-output pin at the rehost site) |
| Deployed `compose-dialog-segments` carries the pin path | yes (pre-clip pin after `preclipResult`) |
| `scripts/calibration/v434/manifest.json` | 6 samples, **all** `legacy_non_reproducible`; no reproducible sample |

### Gap found and closed before Phase 1 (instrumentation only)

`compose-dialog-segments` pinned the pre-clip but wrote the pin **only** into the scene JSON
(`pass._v434_preclip_pin`) — not into `v434_artifact_pins`. A run would therefore have produced
provider-output rows without matching pre-clip rows, and gate step 7 (both kinds, in the table)
could never have been satisfied. Also, the table had no `attempt` column, so cell D (second
attempt on identical inputs) would have been indistinguishable from cell A.

Fixed, additively and telemetry-only:

- migration: `v434_artifact_pins` + `attempt`, `purpose` (default `production`), `cell`, `notes`,
  plus an index on `(scene_id, run_id, generation, pass_idx, kind)`;
- `compose-dialog-segments`: mirrors the pre-clip pin into `v434_artifact_pins` inside a
  `try/catch` that can only log — the dispatch path cannot branch on it;
- `sync-so-webhook`: records `attempt` and `purpose` on the provider-output pin row.

Both functions redeployed. No gate, threshold, provider selection, retry rung, dispatch, mux,
state machine or continuity behaviour was touched.

---

## 2. Samuel identity mapping (structural, not fuzzy)

Reference scene `e658509d-cdeb-40f7-bd33-98e74144fdc5` (project `035273d7…`, owner
`8948d3d9…` / bestofproducts4u@gmail.com), state `complete`, `plate_generation = 3`,
`active_run_id = 8b0f659d-7e40-41e5-9761-e870709824ff`, 6 turns / 6 passes / 4 speakers.

| Turn (1-based) | order | characterId | Name | slot | pass idx |
|---|---|---|---|---|---|
| T1 | 0 | 5c81f9bf… | Sarah Dusatko | 0 | 0 |
| **T2** | 1 | **483f9cdc…** | **Samuel Dusatko** | 1 | **2** |
| T3 | 2 | 54d90504… | Matthew Dusatko | 2 | 4 |
| T4 | 3 | c65de5c6… | Kay Mark | 3 | 5 |
| T5 | 4 | 5c81f9bf… | Sarah Dusatko | 0 | 1 |
| **T6** | 5 | **483f9cdc…** | **Samuel Dusatko** | 1 | **3** |

T2 and T6 are the same character id in the same locked slot (`assignmentLock` slot 1,
`v277_anchor_rekognition_complete`) — the A/B/C/D mapping is derivable by id, no name matching
required. This satisfies the gate's "no fuzzy identity substitution" condition **for the historic
run**; it must be re-derived from the fresh run once one exists.

The historic run also re-confirms the V433 finding directly: every pass input/output sits at a
mutable key (`lipsync-plates/shared/<sceneId>/p<N>-preclip-<hash>.mp4`,
`ai-videos/composer/<uid>/<sceneId>-lipsync-pass-<N>.mp4`) — no run/generation/attempt qualifier.

---

## 3. Phase 1 — BLOCKED (no evidence fabricated)

Phase 1 requires one controlled run through the **normal production path**. Starting it requires
`reset-lipsync-scene`, which authenticates the caller as the scene owner and refuses anything
else:

- anon key → `401 {"error":"unauthenticated"}`;
- no owner session is available (`LOVABLE_BROWSER_AUTH_STATUS=signed_out`), and minting a session
  for a specific user requires an approval channel that is not available in this execution
  context.

The only remaining ways to start a run would have been (a) forcing scene state via direct SQL, or
(b) invoking the dispatcher outside the sanctioned reset path. Both are explicitly forbidden by
this gate ("do not introduce a special dispatch path") and both would have reproduced exactly the
methodological error V433 uncovered. **No run was started; no fallback to mutable historical
artifacts was made.**

Consequence, per gate step 7: `v434_artifact_pins` is still empty → **Phase 2 must not start**,
and it did not.

### What unblocks it

One click by the scene owner in the app: open the reference scene → *Reset & retry lip-sync*.
That is the normal production path and now produces, per pass, one `preclip` and one
`provider-output` row in `v434_artifact_pins` with `run_id`, `generation`, `pass_idx`, `attempt`,
immutable key/url, `sha256` and `byte_size`. Phase 2 can then run without any further code change.

---

## 4. Phase 2 harness (built, not yet fed)

`scripts/calibration/v435/cross-test.mjs`:

- reads **only** exported `v434_artifact_pins` rows; no mutable URL is accepted;
- `verify` re-downloads each pinned object and compares sha256 **and** byte size; any drift
  returns `refused` — the cell is never measured, never labelled, never enters the manifest;
- `gateCell` propagates a single refusal to the whole cell, and reports a pin-less cell as
  `missing` (never `ok`);
- `interpret` applies only the predeclared rules, in this precedence:
  1. `A !== D` → `PROVIDER-SPORADIC` (sporadic provider behaviour outranks input conclusions,
     because with an unstable provider no input-conditioning inference is sound);
  2. A+B no-op, C motion → `PRECLIP`;
  3. A+C no-op, B motion → `AUDIO/TURN`;
  4. anything else, or any indeterminate/missing label → `UNDECIDED`;
- `madSeparation` reports whether MAD-ratio separates the human-labelled classes and always
  stamps `authority: "telemetry_only"`. It exports no threshold.

Cells, once pins exist (all four use the fresh run's pins only):

| Cell | Video input | Audio input |
|---|---|---|
| A | Samuel T2 pre-clip pin | T2 audio (baseline reproduction) |
| B | Samuel T2 pre-clip pin | audio of the demonstrably successful Samuel turn (T6) |
| C | pre-clip pin of the successful Samuel turn (T6) | T2 audio |
| D | Samuel T2 pre-clip pin | T2 audio, second provider attempt |

Per cell to capture: input/output keys + sha256, geometry-coupled mouth ROI actually used,
MAD-ratio, legacy v404 ΔMean (telemetry only), provider job/attempt id, mouth-strip contact sheet,
human label. Cross-test outputs must be pinned under `purpose='calibration'` with the `cell`
column set, so they can never be confused with production evidence.

---

## 5. Calibration manifest delta

**None.** No sample was added, because no reproducible sample exists yet. The six S11 samples stay
`legacy_non_reproducible` and are never promoted. Derivation still reports
`insufficient_samples` (0 reproducible per class), which remains the correct state.

Documented acceptance criteria for a future *authoritative* gate (unchanged, restated):
multiple speakers, multiple crop sizes, multiple turn lengths, ≥3 clean human-labelled samples per
class as an absolute minimum, and zero class overlap.

---

## 6. Verification

- `tsgo --noEmit`: clean.
- Tests: 53 passed / 53 (18 new V435 harness tests, 25 V434 tests, **10 frozen-contract tests
  unchanged and green**).
- No frontend publish or deploy. The only production-affecting actions were the additive migration
  and the two telemetry-only edge-function redeploys. Zero provider calls were made.

---

## 7. Verdict

`V435 = FAIL/BLOCKED — Phase 1 (controlled reference run) not executable in this context: owner
authentication unavailable; pins = no (0 rows); cross-test NOT RUN. Instrumentation gap closed and
harness + rules landed, so one owner-triggered reset now yields complete Phase-1 evidence.` → STOP
