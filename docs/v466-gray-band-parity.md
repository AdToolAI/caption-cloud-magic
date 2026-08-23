# V466-A — Gray-Band Sampling Parity (READ-ONLY pre-check) + Non-Terminal Fall-Through

## Pre-check: 6 vs 16 stills on the 32 frozen pairs
Script: offline ffmpeg parity on the same cohort as V465-B1/B2a (`/tmp/v466/parity.py`).

| Metric | Result |
|---|---|
| Hard flips NOOP <-> MOVED | **0** |
| mean(score16 - score6) | +0.043 |
| max abs delta | 1.04 (COH16, MOVED → more MOVED) |
| MOVED (n=18) @ N=6 | 17 moved / 1 indeterminate |
| MOVED (n=18) @ N=16 | **18 moved / 0 indeterminate** |
| NOOP (n=14) @ N=6 and @ N=16 | identical (12 noop / 1 indeterminate / 1 moved*) |

*COH21 is the documented mislabeled NOOP from V465-B1.

Conclusion: the frozen band **2.00 / 2.65 stays valid at N=16**; higher sampling only
resolves gray cases towards their true class. No re-calibration required.

## Implementation
- `_shared/v465-verdict.ts`: `V466_GRAY_BAND_SAMPLES = 16`.
- `sync-so-webhook`: on an authoritative `indeterminate`, exactly ONE re-measure of the
  same immutable pinned output at 16 stills (no provider call, no spend). If still gray,
  the pass falls through as `motion_unverified` — non-terminal, no refund, never green —
  instead of `ssw:noop_fail`.
- `lipsync-watchdog`: mirrors the same contract for the single re-check.
- Telemetry: `v466_gray_band`, `v466_remeasured`, `v466_remeasure_samples`, `mouth_over_frame`.
