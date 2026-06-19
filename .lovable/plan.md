## Diagnose

I downloaded all 4 lipsync outputs for scene `af3901da` and compared them to the preclips that were sent to Sync.so. Result:

```
pass 1: preclip-vs-output PSNR = 39.8 – 43.5  → essentially identical
pass 4: preclip-vs-output PSNR = 33.4 – 36.7  → near-identical
```

**Sync.so sync-3 returned the preclip basically unchanged.** No lip motion was added to any speaker, on any pass. The downstream mux paints the (un-modified) face crop back onto the master plate, so the user sees the original plate face for every speaker — exactly the symptom reported.

The dispatch payload explains why:

```
asd_mode = auto_detect
asd_has_coordinates = false
asd_has_bounding_boxes_url = false
v1291.reason = "v131_4_dispatch_path_safety_override"
v1291.rule  = "rule_0_preclip_coords_pro_forced_auto"
```

For every multi-speaker pass the dispatcher discards the known ASD coordinates and sends sync-3 only `active_speaker_detection: { auto_detect: true }`. On a tight, face-cropped 720×720 preclip Sync.so's internal ASD frequently produces low confidence and silently no-ops (passthrough). The v135 pre-crop coord-snap I added before never fires here either — the face-gate is short-circuited by the same v131.4 path (`reason: "v131.4: auto_detect preclip skips coordinate face-gate"`).

So `auto_detect` is the killer on tight preclips, **not** the coords.

## Plan v136 — Preclip-Centered Coords (kill the v131.4 auto_detect override on tight preclips)

The preclip is already a one-face square. After upscale it's a 720×720 frame with the speaker's face roughly centered (build pipeline crops around the face center and pads with `outputSize: 720`). We can therefore dispatch sync-3 with **explicit, in-preclip coords** instead of `auto_detect`, removing all guessing on Sync.so's side.

### Changes

1. `supabase/functions/compose-dialog-segments/index.ts`
   - Remove (or gate) the `v131_4_dispatch_path_safety_override` that forces `single_face_auto + auto_detect` for multi-speaker scenes when `dispatch_video_kind === "preclip"`.
   - For every preclip pass, build an explicit ASD payload in preclip-output space:
     ```
     active_speaker_detection: {
       frame_number: 0,
       coordinates: [[ outputSize/2, outputSize/2 ]]
     }
     ```
     (`outputSize` is already persisted as `preclip_crop.outputSize`; default 720.)
   - If the preclip face-gate already detected exactly 1 face on the upscaled preclip (we have `preclip_face_count: 1` for all 4 passes in this scene), prefer that face's centroid over the geometric center; otherwise fall back to center.
   - Persist for forensics: `pass.preclip_asd_source = "v136_preclip_center" | "v136_preclip_face"`, `pass.preclip_asd_coords = [...]`.
   - Keep `sync_mode: "cut_off"` and `audio_normalization` unchanged.

2. `supabase/functions/_shared/syncso-face-gate.ts`
   - Drop the special-case that lets `auto_detect` preclips skip the face-gate. With explicit coords the face-gate runs on every preclip pass and Sync.so's auto-snap (v129.22.3) acts as the safety net for any drift.

3. `mem/architecture/lipsync/v136-preclip-centered-coords.md` — Document:
   - Root cause: `auto_detect=true` on 720×720 face-cropped preclips silently no-ops in Sync.so.
   - Why explicit center coords are safe on a face-cropped preclip (1 face guaranteed inside, at center by construction).
   - Forensic markers: `_v105_probe.asd_has_coordinates=true`, `preclip_asd_source`.

4. `mem/index.md` — add a line under the lipsync section pointing at the new memory; mark the v131.4 override and v135 pre-crop snap as superseded for preclip dispatches.

5. `.lovable/plan.md` — log v136 as the shipped fix.

### Why not switch providers?

- Sync.so sync-3 produced clean per-pass renders before v131.4 forced auto_detect; the data here shows it just needs coordinates.
- We already have AWS Rekognition + Gemini + Sync.so's internal ASD as a 3-layer detector chain — the failure isn't detection, it's that we explicitly told sync-3 to "find a face on your own" on a heavily cropped input.
- A provider switch would invalidate the v122/v124/v129/v130/v131/v133/v134/v135 hardening and the dialog-shots/poll pipeline.

### Risk

- Worst case: explicit center coords mis-target a face in a deliberately off-center preclip. Mitigated by Sync.so's v129.22.3 auto-snap (already shipped) and by using the detected face centroid when available.
- No schema changes. No new secrets. No new providers.

### Verification

After deploy, the user runs "Sauber neu starten" on the same scene. Expected forensics on each pass:
```
_v105_probe.asd_has_coordinates: true
_v105_probe.asd_mode:           "coordinates"
pass.preclip_asd_source:        "v136_preclip_face" (or "v136_preclip_center")
```
And `pass.output_url` vs the corresponding preclip should now show PSNR ≤ 30 in the mouth region (visible lip motion).