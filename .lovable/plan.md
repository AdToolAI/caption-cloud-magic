Do I know what the issue is? Yes.

The current failure is not the old out-of-range-frame bug anymore. The database shows scene `21eed4c2-...` failed on pass 2 / Matthew after dispatching `sync-3` with explicit preclip coordinates:

```text
video: preclip, duration ~1.09s / 33 frames
ASD: auto_detect:false, frame_number:16, coordinates:[363,363]
provider result: generation_unknown_error
```

So v129.27 fixed the frame range, but the retry still sends explicit `coordinates` into a tight single-face preclip. We already documented and observed that `sync-3` can fail on tight one-face preclips when explicit ASD is used. The screenshot’s `face_at_frame` blocker is also confusing because the forensics panel is looking at pass index 0 by default while the actual failed pass is index 1.

Plan:

1. **Stop using explicit point-ASD on clean preclips**
   - In `compose-dialog-segments`, change `coords-pro` preclip retry behavior for clean/tight single-face crops.
   - Instead of sending `auto_detect:false + coordinates`, use a safer recovery ladder:
     - first retry: regenerate/expand the preclip crop if needed, then `auto_detect:true`
     - only use explicit coords when the crop is truly multi-face/ambiguous and the coordinate is verified on the exact preclip frame.

2. **Add a hard provider-safe fallback for this failure**
   - In `sync-so-webhook`, when `sync-3` fails with `generation_unknown_error` on a preclip explicit-coord retry, do not retry the same payload.
   - Move to a different variant, preferably `auto-standard` / lipsync-2 fallback on the preclip, or a full-plate/bbox route, depending on available metadata.
   - This avoids looping back into the same known-bad Sync.so payload shape.

3. **Make Face-Gate not block clean preclip auto paths incorrectly**
   - For `auto_detect:true` preclip dispatches, do not ask the preflight/face-gate to validate a fixed coordinate.
   - Validate only “face exists in preclip frame” for auto-detect paths; keep coordinate checks only for explicit ASD.

4. **Improve forensics so the screenshot points at the real failed pass**
   - Update the forensics sheet to default/select the failed pass when a scene failed, instead of showing pass index 0.
   - Label whether the check is validating the actual provider payload or only a diagnostic probe.

5. **Recover the current failed run**
   - Reset scene `21eed4c2-...` from failed to pending at the failed pass.
   - Clear the invalid explicit-preclip retry metadata and redispatch with the new safe fallback.
   - Confirm in logs that the next payload no longer sends the known-bad `sync-3 + explicit coords on single-face preclip` shape.