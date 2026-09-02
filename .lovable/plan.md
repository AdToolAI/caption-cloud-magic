# V537 Production Verification — Evidence and Smallest Next Action

## Verdict

Explanation (2)/(3): the repository and the published frontend carry V537, but the two backend functions running in production at 14:25 UTC were still the pre-V537 revision. The V537 reconstruction was explicitly executed under a "do not deploy" freeze, so `compose-twoshot-audio` and `compose-dialog-segments` were never deployed. Publishing the app updates the frontend; it does not redeploy backend functions that were never handed to the deploy step.

## Evidence

Repository HEAD (`7666bcb66c`) contains V537:
- `compose-twoshot-audio/index.ts`: `materializeCanonicalTurnIds` (lines 37, 789, 867), `canonical_turn_ids: v537CanonicalTurnIds` (line 1625)
- `compose-dialog-segments/index.ts`: `readFrozenCanonicalTurnIds` / `canonical_turn_snapshot_malformed` present

Production runtime logs for the failing run (scene `7aa7fc93…`):
- `14:25:17Z booted (time: 23ms)` and `14:25:19Z booted (time: 29ms)` — fresh cold boots, so the executing bundle is what was deployed at that moment.
- Those invocations logged `v431_g2_1` and `v200_id_only_cast … blocks=4 speakers=[…]`.
- `v200_id_only_cast` means `idOnlyActive === true`, so V537 code would have entered the lazy-repair branch (source lines 866–898) and, with 3 missing turn IDs, would necessarily have emitted `v537_turn_identity_lazy_repair … minted=3`.
- No `v537_turn_identity`, `v537_turn_identity_lazy_repair`, or `v537_turn_identity_unsatisfiable` line exists anywhere in the log window.
- `compose-dialog-segments` logs contain zero matches for `v537`.

Consequence chain matches exactly the pre-V537 behaviour: no minting → `dialog_turns` keeps `[U1,null,null,null]` → `audio_plan.twoshot` written without `canonical_turn_ids` → dispatcher falls back to live turns → `fa4_p0_turn_pass_mismatch`, `canonical_turns=1`, `null_segment_pass_idx=[1,2,3]`.

Timing: a publish at ~14:10 UTC cannot explain the 14:25 result, because the 14:25 cold boots still ran code without any V537 log marker. This is not a pending/propagating publish; it is code that was never deployed to the backend.

## Smallest next action

Deploy exactly the two functions from current HEAD, nothing else:

- `compose-twoshot-audio`
- `compose-dialog-segments`

Then rerun scene `7aa7fc93-bfd5-49a1-809e-40f29459b963` and confirm in logs:

1. `v537_turn_identity_lazy_repair … minted=3` (or `v537_turn_identity … minted=3` on the diverged path)
2. `audio_plan.twoshot.canonical_turn_ids` present with 4 UUIDs, `segments[].turn_id` all non-null
3. No `fa4_p0_turn_pass_mismatch` in `syncso_dispatch_log`

No code change, migration, RPC, or backfill is required — the fix is already in HEAD.
