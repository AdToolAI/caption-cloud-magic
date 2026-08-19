# FA-4 S11 Independent Acceptance Audit — Result and Next Step

Read-only audit of the completed S11 retest (scene `e658509d…`, run `8b0f659d…`, gen 3, reset `dd5461f2…`). No code, deploy, render, provider call, or DB mutation was performed.

## Verdict

- TECHNICAL: PASS
- VISUAL: FAIL (T2 Samuel)
- OVERALL: BLOCKED

`FA-4 CONTROLLED S11 RETEST = BLOCKED — P1 visual no-op on T2 (Samuel, turn ab0ba4bd…, pass_idx 2, provider job 366c44c4…): mouth region is statistically indistinguishable from the silent baseline (motion ratio 0.93x) while the turn carries speech audio; the v404 motion-gate record for exactly this pass is not recoverable from any persisted row or from the log window → STOP`

## Technical evidence (all confirmed)

- New reset epoch is cleanly separable: all attempt_no=2 rows carry `rs3_reset_id=dd5461f2…`, `ledger_source=v431_rs3_reset_rearm`, `run 8b0f659d`, `gen 3`. Prior history is attempt_no=1 (2026-08-17 gen 2 run b9acfae3; 2026-08-18 gen 3 run 8b0f659d).
- Exactly 6 turn-backed `sync_segment` jobs in the new epoch, set-equal to the 6 canonical turn IDs; no stabilizer/non-turn segments; `replaced_by` null everywhere; no duplicate live attempt; no NOOP replacement job.
- Exactly one NEW `audio_mux` for the epoch (`fdb3fc7c…`, dispatched 20:46:39Z, finished 20:47:03Z); the attempt_1 mux (`5ce34629…`) is not reused.
- Terminal semantics: `lip_sync_status=done`, `pipeline_state=complete`, `twoshot_stage=done`, `dialog_shots.status=done`; `processed_video_url == clip_url == dialog_shots.final_url` = the `vhsc7ic38g` muxed MP4.
- v410 runtime: BOOT marker `v410-fa4-no-media-io-under-dialog-lock-final` present in-run; every observed callback logs `speaker_cardinality distinct=4 total_passes=6 observed=6 class=multi`; every observed measurement is `phase=pre_lock status=measured` — no catch-up round, no media I/O under `withDialogLock`.
- Corrected pass↔turn mapping (previous report had this wrong): pass0=T1 Sarah, pass1=T5 Sarah, pass2=T2 Samuel, pass3=T6 Samuel, pass4=T3 Matthew, pass5=T4 Kay.
- Motion-gate values available: pass0 141.60, pass3 122.09, pass4 45.80, pass5 15.99 (threshold 15.4057) — so the borderline value belongs to T4 Kay, not T6. pass1 and pass2 gate records are UNAVAILABLE (log window truncated at 20:46:42Z; `syncso_dispatch_log.motion_verdict/motion_score` are null for this epoch; `dialog_shots.passes[]` persists no motion fields).

## Visual evidence (objective, from the existing MP4 only)

Final MP4: 15.083 s, 1284x718, 30 fps, h264 + aac, 8,974,274 bytes.
Mouth-region temporal difference per detected face, per speaking window, against the same face's silent-tail baseline (10.9–14.8 s):

```text
turn         mean   p90    max   ratio vs own silent baseline
T1 Sarah     4.51   8.72  14.64   3.90x   speaking
T2 Samuel    1.14   2.15   2.60   0.93x   STATIC  <-- failure
T3 Matthew   2.49   6.00   7.80   2.22x   speaking
T4 Kay       2.48   5.27   7.69   1.81x   speaking
T5 Sarah     3.97   7.64  11.06   3.43x   speaking
T6 Samuel    4.06  10.22  13.19   3.32x   speaking
```

Frame strips confirm the numbers: T1, T3, T4, T5, T6 show open/closed articulation; T2 shows a closed, unchanging mouth across the whole 1.97–3.50 s window. No wrong-mouth activation on a non-speaking face, no identity swap (slot1 is the same Samuel face in T2 and T6), no double faces, no mask seams or reprojection artifacts observed. Audio carries six distinct speech segments matching the turn windows (T2 rms 0.0417, so audio is present while the mouth is static); voice-identity matching by ear is not reliably assessable from measurements alone — limitation noted.

## Proposed next step (decision needed, no repair performed)

1. Confirm the classification: T2 is a provider-side no-op that the v404 gate either scored above threshold or did not record. Requires recovering the pass2 measurement from provider-side output (`…-lipsync-pass-3.mp4`) by comparing it against its own preclip input — read-only, no render, no dispatch.
2. Only after that: decide whether the gap is a gate-sensitivity issue (delta measured on the wrong region/interval) or a persistence issue (gate telemetry not durably stored, which is why pass1/pass2 evidence is unrecoverable).
3. No fix should be designed before step 1 names the cause.
