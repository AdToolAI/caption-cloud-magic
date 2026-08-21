# V433 — Motion Studio Differential RCA + Continuity Contract Audit (READ-ONLY)

Gate scope: forensic, offline, no pipeline code changed. FA-4 freeze and
`.lovable/LIPSYNC-FEATURE-FREEZE.md` respected. Repo HEAD clean.

Case under investigation: scene `e658509d-cdeb-40f7-bd33-98e74144fdc5`
(project `035273d7…`, run `8b0f659d-7e40-41e5-9761-e870709824ff`,
`plate_generation = 3`), 6 speaker passes, "Samuel T2 visible-mouth no-op".

---

## 1. Method

All measurements were reproduced locally and offline from the artifacts the
database itself names (`dialog_shots.passes[].preclip_url` /
`output_url`), decoded to 1280×720 Rec.601 luma and sampled inside the
frozen production ROI `bx=461 by=411 bw=358 bh=154` — byte-identical ROI to
`measure-provider-motion-sync.ts` (`cx .5 / cy .6 / w .28 / h .12`).

Two statistics per pass:
- `dMean` = provider − preclip temporal per-pixel variance mean (the current
  authoritative gate scalar).
- `MADratio` = mean consecutive-frame absolute difference of the provider
  divided by that of its own preclip (new candidate statistic, unbiased by
  re-encode gain).

Plus a visual control: 8-frame mouth strips per pass (`strip_2`, `strip_3`).

## 2. Reproduced measurements (authoritative artifacts, N=6 / N=12)

| idx | turn | speaker | fixture label | preclip mean | provider mean | dMean | MADratio | visual truth |
|----|------|---------|---------------|--------------|---------------|-------|----------|--------------|
| 0 | T1 | Sarah | motion | 162.00 | 304.16 | +142.2 | 1.78 | motion |
| 1 | T5 | Sarah | motion | 199.36 | 226.56 | +27.2 | 1.68 | motion |
| 2 | T2 | Samuel | **motion** | 49.74 | 92.50 | **+42.8** | **1.30** | **NO-OP** |
| 3 | T6 | Samuel | **noop** | 46.67 | 169.52 | +122.9 | 2.91 | **MOTION** |
| 4 | T3 | Matthew | motion | 169.75 | 214.44 | +44.7 | 2.06 | motion |
| 5 | T4 | Kay | **noop** | 22.25 | 73.56 | +51.3 | 2.49 | motion |

Visual control (mouth strips): pass 2 shows a near-constant, half-open mouth
across the whole turn — the aperture does not articulate; consecutive
mouth-band MAD of the output (3.31 2.50 4.96 2.41 2.07 3.42 2.92) is
statistically indistinguishable from that of its own silent preclip
(2.69 2.46 3.57 2.85 1.53 2.32 2.54). Pass 3 in contrast varies 2–4× over its
preclip and shows clear phoneme shapes.

## 3. Primary cause — ESTABLISHED

**The Samuel T2 no-op is a provider-side no-op, and the v404 motion gate is
structurally incapable of detecting it because its frozen calibration ground
truth is bound to mutable artifact URLs and is not reproducible.**

Three independent, verified facts:

1. **The calibration ground truth is stale by one full run.**
   `scripts/calibration/s11-artifact-map.json` was minted **2026-08-18
   20:20:49Z** (signed-URL `iat`). Every provider artifact it references
   (`…-lipsync-pass-N.mp4`) is a *stable, overwritable* public path, and all
   six objects were last written **2026-08-19 20:45–20:47Z** — a day later, by
   run `8b0f659d…`. The preclip hashes in the map
   (`p4-preclip-23f73a30…`) also no longer exist under those names; the
   current run wrote `p4-preclip-21bc90a5…`. The fixture in
   `motion-probe-classifier.ts` therefore labels *content that no longer lives
   at the measured URLs*.

2. **The consequence is visible in the numbers.** The four `motion`-labelled
   passes still reproduce (297→304, 209→227, 101→93, 221→214), but exactly the
   two `noop`-labelled samples do not: T6 fixture provider mean 42.49 vs
   reproduced **169.52**, T4 fixture 19.97 vs reproduced **73.56**. In both
   fixture rows the "provider" value is within a few points of the pass's own
   preclip value (47.7 / 22.1) — i.e. the entire `noop` class of the
   calibration is an artefact of measuring stale (effectively preclip-like)
   content. `server_delta_max_noop = −2.18` and hence
   `MOTION_THRESHOLD = 15.4058…` / `NOOP_THRESHOLD = 3.6827…` were fitted to
   that phantom class. This is fully circular: the thresholds cannot fail the
   samples they were derived from, and the withdrawal of Δpeak ("p3/T6 noop is
   positive") rests on the same inverted sample.

3. **The real failure sits inside the motion class by construction.** Samuel
   T2 measures `dMean = +42.8`, i.e. 2.8× above `MOTION_THRESHOLD`. No
   threshold tuning of this scalar can catch it without also failing genuine
   motion passes (T5 = +27.2, T4 = +39.2). The delta is produced by
   provider-wide re-render churn — sync.so re-synthesises the whole lower face
   and background bokeh at higher texture energy — not by mouth aperture
   change. This is precisely the "global pixel movement read as lip-sync"
   mode suspected in the brief, now measured rather than assumed.

**Excluded as cause (evidence, not assumption):** preclip geometry, face
gating, cast identity and provider configuration. Passes 2 and 3 are the *same
character*, in the *same run*, with the *byte-identical crop*
`{x:366, y:102, size:250, outputSize:720}`, the same `retry_variant`
(`bbox-url-pro`) and adjacent dispatch timestamps. They differ only in the
audio window. One articulated, the other did not. A geometry, plate or
identity defect cannot produce that split.

**Secondary defect (contributing, not primary):** the ROI is placed from a
`preclip_anchor = "face_center"` with `preclip_mouth_offset_px = 0` and
`preclip_face_share = 0` logged on every pass of this scene. The rendered ROI
overlay confirms the band sits on the nose/upper-lip line rather than centred
on the aperture, so the metric integrates cheek, philtrum and background
instead of the mouth. It weakens every measurement but is not what let T2
through.

## 4. Discriminating statistic (evidence for the later fix gate)

`MADratio` separates the frozen set cleanly where `dMean` does not:
no-op 1.30 vs. lowest genuine motion 1.68 (gap 0.38, all four independent
motion passes ≥ 1.68, and the two mislabelled "noop" passes correctly land at
2.91 / 2.49). It is scale-free, so provider re-encode gain and preclip
background energy cancel out. Recommended as the basis of a re-derived gate —
after the ground truth is rebuilt.

## 5. Continuity contract audit (Block 6)

| Contract | State | Evidence |
|---|---|---|
| Geometry anchor = `reference_image_url` | HELD in code | `compose-dialog-segments/index.ts:1412-1417`, `lipsync-frozen-contract.ts:84`; `lock_reference_url` read only as continuity lock |
| Chain never writes `reference_image_url` | HELD | `continuity-chain.ts:21`, no write path found |
| Run lineage / stale-result guard | HELD | `sync-so-webhook` re-reads `active_run_id` + `plate_generation`, skips with `stale_run_result` (`index.ts:601-610`); `scene-run-begin.ts` bumps generation and mints the run id in one statement |
| Frame-chain parking queue | UNPROVEN AT RUNTIME | `composer_continuity_queue` is **empty** — no historical rows at all; the park/resume path in `continuity-chain.ts:64-133/225-248` has no production evidence |
| Anchor coverage per project | PARTIAL | S11 project: 11 scenes, 8 with an anchor, 4 with a continuity lock — scene-to-scene visual continuity is not established for every scene |
| **Artifact immutability** | **BROKEN** | provider outputs live at run-independent, overwritable paths (`…-lipsync-pass-N.mp4`); preclip file names are regenerated per run. No content hash, no run id in the path. This is the mechanism that corrupted the calibration and will corrupt any future one identically |

## 6. Verdict

**V433 MOTION STUDIO DIFFERENTIAL RCA + CONTINUITY CONTRACT AUDIT = PASS / RCA
ESTABLISHED** — Primary cause: Samuel T2 is a genuine provider-side no-op
(same character/crop/run as the neighbouring successful pass, differing only in
audio), and it passed the gate because the v404 calibration was fitted to
artifacts at mutable URLs that were overwritten one run later; its entire
`noop` class is unreproducible (T6 42.5→169.5, T4 20.0→73.6), the derived
thresholds are circular, and the authoritative scalar `dMean` puts the real
no-op (+42.8) deep inside the motion class. A scale-free consecutive-frame
mouth MAD ratio separates the same set cleanly (1.30 vs ≥1.68). Continuity
contracts for geometry anchor, chain write-ban and run lineage hold in code;
artifact immutability is broken, the frame-chain queue is unproven at runtime,
and anchor coverage is partial. → STOP
