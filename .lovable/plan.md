# v129.2.1 — Shipped (Doc-Strict + Ambiguity Guard)

## Status

**DEPLOYED** (`compose-dialog-segments`). Ready for canary on the next Multi-Speaker scene.

## Was geliefert wurde

1. `supabase/functions/compose-dialog-segments/index.ts`:
   - Inside `if (usePassPreclip)`: new `v1291Ambiguity` block — projects every other `faceMap.faces` center into plate-space and tests against `preclip_crop` rect. Persists to `pass._v1291_ambiguity` and `_v102_probe.preclip_ambiguity`.
   - Preflight: third trigger `auto_detect_with_ambiguous_crop` extends the existing `(v1291Block || hasCoords && wouldAutoDetect)` block. Uses existing `failBeforeProviderDispatch` → idempotent refund, no Sync.so call.
2. `docs/lipsync/v129-2-1-preflight.md` — explains why production logs still show `stage=preclip-sync3-auto-detect-v115`: the v129.1 bundle wasn't deployed. Now bundled together with v129.2.1.
3. `docs/lipsync/v129-2-1-implementation.md` — vorher/nachher, canary spec, SQL verification.
4. `mem/architecture/lipsync/v1291-doc-strict-and-ambiguity-guard.md` + `mem/index.md` updated.

## Out of scope (confirmed)

- `computeFaceCrop` floor (v129.2.2)
- `MIN_VIABLE_SYNC_CROP_PX` (v129.2.2)
- `bounding_boxes_url` / two-face / mouth-mask (v129.3)
- State machine, retry, watchdog, plan-D, UI, lipsync-2-pro, Stage 4 A/B, segments — all untouched.

## Canary erwartet (Multi-Speaker mit vertikalem Stack)

- `meta.v102_probe.stage = "preclip-sync3-v1291"`
- `meta.v102_probe.asd_mode = "preclip_coords_doc_strict"`
- `meta.v102_probe.v1291.in_bounds = true`
- `meta.v102_probe.preclip_ambiguity.risk ∈ { "clean", "neighbor_inside_crop" }`
- alle Sprecher animieren; Frame-Diff im Mouth-ROI > 0 für jeden Pass
- `DISPATCH_BLOCKED_PAYLOAD_PRECHECK / auto_detect_with_ambiguous_crop` darf NICHT für heute funktionierende Passes feuern

## Abort-Trigger → reopen als v129.3

- Doc-strict coords gesendet, Sync.so dennoch No-Op → A2-These widerlegt → Stack-Strategie (`bounding_boxes_url` / two-face crop / mouth mask).
