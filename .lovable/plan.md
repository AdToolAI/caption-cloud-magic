# GEN26 RCA — Scene 67b392b1 / run 3dd0bdbb / gen-26 (READ-ONLY, no changes made)

## First true failure

The Remotion still is rendered in a **1280x720 landscape composition** while the plate is
portrait **656x1406**. V524's raster-coherence guard correctly rejects it.

Chain: HappyHorse base OK -> V527 FA-4 OK -> V526-A frames [23,225,428] -> V525 extracted all
three (`source=remotion_still`) -> V524 `dims_incoherent` on all three -> V526-B not reached ->
V523 `reference_space_mismatch` -> `identity_unresolved Sarah`.

## Exact source lines

1. `supabase/functions/_shared/plate-face-track.ts:231-283` — `defaultRenderStill()`.
   The Lambda payload (L238-266) sends
   `inputProps.payload = { masterVideoUrl, masterAudioUrl, totalSec, shots: [] }`
   and `forceWidth: null, forceHeight: null`, `scale: 1`.
   It never sends `targetWidth` / `targetHeight`.
2. `src/remotion/Root.tsx:476-509` — composition `DialogStitchVideo` is declared
   `width={1280} height={720}`, and `calculateMetadata` resolves the raster as
   `even(props.targetWidth, 1280)` / `even(props.targetHeight, 720)` (L497-498).
   With those props absent, it falls back to **1280x720** for every V525 still.
3. `src/remotion/templates/DialogStitchVideo.tsx:719-726` — the master plate is drawn as a
   full-bleed `<Video style={{width:'100%',height:'100%',objectFit:'cover'}}>`.
4. `supabase/functions/_shared/v524-plate-identity-registration.ts:319-332` — the guard:
   `aspectDrift = |dw/dh - W/H| / (W/H)`; `> 0.01` -> `dims_incoherent`.
   `(1280/720 = 1.7778)` vs `(656/1406 = 0.4666)` -> drift `2.8103`, exactly as logged.

## What the still actually is

Not letterboxed, not stretched: `object-fit: cover` with
`s = max(1280/656, 720/1406) = 1.951` scales the portrait plate to 1280x2743 and then
**center-crops a 720px horizontal band out of 2743px** — roughly the middle 26% of the frame,
full width. Faces above or below that band are physically absent from the raster, and those
inside it are heavily zoomed. So it is a landscape raster containing a cropped, magnified
slice of the portrait video — it is *not* the same picture as the plate, which is precisely
what V524's guard exists to detect. The guard behaved correctly.

Note: `plate-face-track` itself survives this because it inverts the cover transform in
`stillPointToSource` (`plate-face-track.ts:117-131`) — but that inversion cannot recover faces
that were cropped out, and V524 deliberately does not use it (rescaling is allowed, re-framing
is not).

## Why V524 sees detectorDims 1280x720

`detected.dims` comes from `resolveIdentityViaRekognition`, which probes the dimensions of the
bytes it was handed (the V525 still). Those bytes really are 1280x720, so the detector is
truthful; the defect is upstream in what was rendered, not in measurement.

## Answers to the specific questions

- **V527 worked as intended.** FA-4 anchor-native sanity passed and the run advanced past the
  gate that terminalized gen-25. The gen-26 failure is a different, later gate.
- **V526-B was NOT reached.** `compose-dialog-segments/index.ts:5226` requires
  `v526bEvidence.length > 0`, and evidence is only pushed at L5170-5174 from
  `reg.partialRecords`. `dims_incoherent` returns through `fail()`
  (`v524-plate-identity-registration.ts:267-280`), which emits no `partialRecords` — the
  failure happens before any face is mapped to a character, so `resolved=0` is literal. The
  V526-B trigger condition is not wrong; there was genuinely nothing to seed it with.
- **Provider spend:** HappyHorse base video, 3x Remotion Lambda stills (frames 23/225/428,
  cached under the source-fenced `plate-frames` path so a retry of the same base video will
  not re-render them), and the Rekognition identity calls per frame. **No Sync.so / lip-sync
  provider dispatch occurred** — the run terminalized in V523 before dispatch.

## Smallest root-cause-safe fix direction (not implemented)

Make the still raster equal the plate raster, at the single point where the payload is built:
add `targetWidth` / `targetHeight` (the known plate dims) to the `inputProps` payload in
`defaultRenderStill()`. The Remotion side already supports this — `calculateMetadata` reads
exactly those two props today and only falls back to 1280x720 because they are missing. No
composition change, no threshold change, no touch to V524's aspect guard, no new Lambda path.

Consequences to weigh before doing it:

- Plate dims must be threaded into the renderer signature (currently
  `(videoUrl, totalSec, frame, timeoutMs)`), which touches `plate-face-track`'s V452 tracking
  loop and V525's injected `renderStill` contract.
- With coherent dims, `stillPointToSource` becomes an identity transform for the tracking path
  — correct, but it changes the numbers V452 produces, so the V452 sample path needs its own
  verification rather than being assumed unaffected.
- The V525 cache key is fingerprinted on the base-video URL only, not on raster size. Existing
  1280x720 objects for this scene would be served as cache hits after the change; the key
  needs a raster component, or the affected prefix has to be considered stale.
- `transition-frame.ts:101-123` and `measure-provider-motion-sync.ts:329-351` build the same
  payload shape with the same 1280x720 fallback. They are out of scope for this failure, but
  they share the defect and should be assessed separately, not silently changed.

Recommended first step is a bounded, dims-aware render variant used only by the V525
acquisition path, leaving the V452 tracking call untouched until it is separately verified.

No code, thresholds, guards or deployments were changed.
