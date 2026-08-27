# READ-ONLY RCA — `preclip_identity_geometry_mismatch`, pass_idx 4 (Matthew), gen 16

No code, DB, deploy, provider or publish action was performed.

## 1. Exact emitter

`supabase/functions/compose-dialog-segments/index.ts`
- L6945 guard `if (v161UsingPreclipForBbox && box && v161PreclipCrop)` (Contract E block)
- L6980-6984 `resolvePreclipContainmentAuthority({ plannerContainBox: pass.v457_contain_box, plannerContainSource: pass.v457_contain_source, staticDispatchBox: box })`
- L7000-7004 `evaluatePreclipCropContainment({ crop: v161PreclipCrop, targetBbox: authority.targetBox, otherSpeakerCenters })`
- L7005-7040 on `!containment.ok` → `_v152HardFail.reason/errorClass = "preclip_identity_geometry_mismatch"`, console tag `fa4_preclip_containment_fail_closed` (L7044)

The failing branch is E.1 in `_shared/preclip-crop-containment.ts` L67-73 → `target_not_contained_in_crop`. This runs strictly before dispatch, which matches `provider_call_made=false` / `external_job_id=null`.

## 2. Where the 128 crop comes from, and the persisted 394 crop

- The 128 crop is the freshly planned in-memory crop of THIS run/generation: `_shared/pass-face-preclip.ts` L503-530 (`computeMouthCenteredCrop`), assigned to `pass.preclip_crop` at `compose-dialog-segments/index.ts` L6243-6248 after a successful preclip render.
- `{x:576,y:162,size:394}` in the persisted `dialog_shots` pass row is not the box that was judged. The gate fires before the pass row for generation 16 is written through, so the row still carries the geometry of an earlier generation/pass state. It is stale telemetry, not a second authority — the arithmetic in the failure detail uses `[709,317,837,445]` size 128, which is exactly the in-memory `v161PreclipCrop` (L6875).

## 3. How `v457_contains_target=true` coexists with `target_not_contained_in_crop`

This is the actual defect, in `_shared/compute-mouth-centered-crop.ts` L322-357:

- `perFrameMinCropPx` (set by V461 E when a turn track exists) switches the planner into `feasibilityMode = "dynamic"`.
- `projectCropToContain({x,y,size}, containBox, ...)` is still called (L334) and `containsTarget = p.containsTarget` is taken from the PROJECTED crop (L335).
- In dynamic mode the projection result is applied only when `!p.sizeGrown` (L344-350). If the union would require growth, the projection is deliberately DISCARDED and the crop stays at the smaller size — but `containsTarget` keeps the value computed for the discarded, grown crop.

So `v457_contains_target=true` describes a crop that was never rendered. Numerically: contain box `[757,339,884,525]` is 127x186; the rendered crop is 128px square. 186 > 128 → growth was required → projection discarded → the reported `true` is unreachable for that crop.

## 4. Root classification

Not stale telemetry alone, and not a race. It is a genuine authority mismatch introduced by the interaction of two contracts:

- V461 E / V452: in dynamic mode the union is explicitly NOT a size authority; containment is proved per frame by the camera path (`cameraPathContainsAll`, `pass-face-preclip.ts` L722-735 `v461e_camera_path_cannot_contain`).
- V510-P1 (`_shared/preclip-geometry-authority.ts` L83-107): when `containSource === "turn_track"` Contract E adopts the planner union as its target and tests it against the single static crop — the one containment the planner never claimed in dynamic mode.

Secondary contributor: the dishonest `containsTarget` above, which hides the discarded projection from every downstream consumer.

## 5. V516

Not involved and not the cause. `chooseCoherentMouthAuthority` runs earlier at `compose-dialog-segments/index.ts` L6095-6136 and only selects the mouth landmark/authority. The failure is a crop-vs-union containment verdict downstream of it; V516 is correctly bypassed by this path.

## 6. Smallest safe fix point (not weakening the gate)

Make Contract E judge the object the planner actually proved, per feasibility mode:

- Planner emits its containment regime and proof explicitly (`feasibility_mode`, `projection_discarded`, camera-path proof), and reports `containsTarget` for the FINAL crop only — `null`/`false` when the projection was discarded.
- Contract E then either (a) tests the union against the per-frame camera-path windows (dynamic regime), or (b) keeps today's exact static-crop test with the static anchor target when there is no proved dynamic path.

Fail-closed identity stays intact: E.3 sibling-center exclusion, zero tolerance, no padding, no thresholds touched; missing or unproved evidence still terminalizes.

## 7. Why Matthew, why 0/2/3 passed

Consistent with movement, not confirmed by an independent run. Matthew's turn track spans a 127x186 union against a 128px crop — a tall, moving trajectory forces `sizeGrown`, which is the only condition that triggers the discard path. Passes 0/2/3 either had no measured track (static regime, projection applied and crop grown normally) or a union that fit inside the chosen crop size (`!p.sizeGrown` branch, shift applied) — both leave crop and target coherent. This should be confirmed by reading the `v457_contain`, `v452_camera_path` and `v461e` log lines of passes 0/2/3 in the same generation before any fix is coded.

## 8. Files/functions a future fix would touch

- `supabase/functions/_shared/compute-mouth-centered-crop.ts` — `computeMouthCenteredCrop` L322-357 (honest `containsTarget`, expose discard + feasibility mode)
- `supabase/functions/_shared/pass-face-preclip.ts` — L486-530, L696-770, result payload L820-835 / L1110-1125 (propagate mode + camera-path proof)
- `supabase/functions/_shared/preclip-geometry-authority.ts` — `resolvePreclipContainmentAuthority` (regime-aware authority)
- `supabase/functions/_shared/preclip-crop-containment.ts` — `evaluatePreclipCropContainment` (per-frame window variant, E.1 only)
- `supabase/functions/compose-dialog-segments/index.ts` — L6243-6330 (persist new provenance), L6945-7050 (Contract E call + telemetry)
- Mirrors/tests: `src/lib/composer/computeMouthCenteredCrop.ts`, `src/lib/composer/__tests__/v457PreclipCropContainment.test.ts`

RCA ends here. No fix gate is proposed for execution in this message.
