# FA-4 v404 — Remotion Source→Still Transform Proof (READ-ONLY REPORT)

Scope executed: §6 proof only. No code, no deploy, no render, no migration, no calibration.

## A. Source Dimensions

Provider-input preclips of S11 are rendered by composition `DialogTurnFaceCropVideo`
(`src/remotion/Root.tsx` L512-531): registered 512×512, `calculateMetadata` overrides to
`width = height = even(outputSize, 512)`. `DialogTurnFaceCropVideo` renders a square
`cover` crop of the plate (`src/remotion/templates/DialogTurnFaceCropVideo.tsx`).

For FA-4/S11 the materialised preclips are **720×720** square MP4s.
`cropSize` differences (Sarah/Samuel size=250, Matthew/Kay size=394) are already consumed
*inside* that preclip render; the resulting file is 720×720 in every case. The
Source→Still proof therefore starts from a 720×720 source, per §3.

## B. Still / Composition Dimensions

Still primitive: `supabase/functions/_shared/transition-frame.ts`, payload
`type: "still"`, `composition: "DialogStitchVideo"`, `imageFormat: "jpeg"`,
`jpegQuality: 85`, `scale: 1`, `forceWidth: null`, `forceHeight: null`.

`inputProps.payload` carries exactly:
`{ masterVideoUrl, masterAudioUrl: "", totalSec, shots: [] }`.
It does **not** carry `targetWidth` / `targetHeight` / `srcWidth` / `srcHeight`.

`DialogStitchVideo` `calculateMetadata` (`Root.tsx` L484-504):

```text
fps    = 30 (hard-coded)
width  = even(props.targetWidth,  1280)  -> 1280   (prop absent)
height = even(props.targetHeight,  720)  ->  720   (prop absent)
durationInFrames = max(30, ceil(totalSec * 30))
```

Still canvas with the current invoke = **1280 × 720**, `scale: 1`, no force dims.

## C. Rendering primitive

`DialogStitchVideo` (`src/remotion/templates/DialogStitchVideo.tsx`), master-plate layer:

```tsx
<AbsoluteFill style={{ backgroundColor: '#000' }}>
  <AbsoluteFill>
    <Video                     // OffthreadVideo (aliased import)
      src={masterVideoUrl} muted playbackRate={1}
      style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
  </AbsoluteFill>
  ...
</AbsoluteFill>
```

With `shots: []` and `masterImageUrl` absent, every other layer (silent freezes,
mouth mattes, tail freeze, overlays) evaluates to `null` / empty array. No wrapper
applies `transform`, `scale`, rotation or additional crop. `srcWidth`/`srcHeight`
only feed `scaleX`/`scaleY` for overlay slots — with `shots: []` they are unused.

## D. object-fit / scaling behavior

`objectFit: 'cover'` on a `100% × 100%` element inside a `1280 × 720` AbsoluteFill:
uniform scale by the **larger** ratio, then **center crop**. Not contain, not stretch,
no letterbox/pillarbox (background `#000` is never visible).

General case (source `sw × sh`, composition `cw × ch`):

```text
s  = max(cw/sw, ch/sh)
dx = (cw - sw*s) / 2      // <= 0, i.e. horizontal center crop
dy = (ch - sh*s) / 2      // <= 0, i.e. vertical center crop
```

- source AR > comp AR  → left/right cropped (dx < 0, dy = 0)
- source AR < comp AR  → top/bottom cropped (dy < 0, dx = 0)
- source AR = comp AR  → s uniform, dx = dy = 0 → identity in normalized space

## E. Exact Source→Still transform (S11: 720×720 → 1280×720)

```text
s  = max(1280/720, 720/720) = 16/9 = 1.7777778
scaled source = 1280 × 1280
dx = (1280 - 1280)/2 = 0
dy = (720  - 1280)/2 = -280 px

pixel:      x_still = x_src * 1.7777778
            y_still = y_src * 1.7777778 - 280

normalized: u_still = u_src                              (x is identity)
            v_still = (v_src * 1280 - 280) / 720
                    = 1.7777778 * v_src - 0.3888889
```

Visible source band: `v_src ∈ [0.21875, 0.78125]`; the outer 21.875% top and bottom
of the 720×720 preclip are cropped away by the still.

## F. Frozen ROI through the transform

Frozen source-space ROI: `centerX 0.5, centerY 0.6, width 0.28, height 0.12`
→ source normalized box `x ∈ [0.36, 0.64]`, `y ∈ [0.54, 0.66]`.

```text
still centerX = 0.5
still centerY = 1.7777778*0.6 - 0.3888889 = 0.6777778
still width   = 0.28
still height  = 0.12 * 1.7777778 = 0.2133333

still normalized box: x ∈ [0.36, 0.64],  y ∈ [0.5711111, 0.7844444]
still pixels (1280×720): x ∈ [460.8, 819.2], y ∈ [411.2, 564.8]
```

The full ROI stays inside the visible band (0.5711 > 0.21875·(scaled) equivalent,
i.e. never clipped): measurable, no clamping needed for the S11 case.

## G. Frame / time transform

- Composition fps: hard-coded `30` in `calculateMetadata`; source fps is irrelevant —
  `OffthreadVideo` seeks by timestamp, not by source frame index.
- Master `<Video>` is mounted at composition frame 0, at the root (no `<Sequence>`
  wrapper on that layer), `playbackRate={1}`, **no `startFrom`**, `masterImageUrl`
  absent, `tailFreezeFromSec` absent, `shots: []` → no sequence/start offset at all.
- Therefore still `frame = N` shows source time `t = N / 30` seconds, offset 0.
- `durationInFrames = max(30, ceil(totalSec*30))`; the sampling frame must satisfy
  `0 <= frame < durationInFrames` (the existing caller already clamps to
  `totalFrames - 1`).

## H. Conclusion

```text
SOURCE_TO_STILL = DETERMINISTIC_TRANSFORM

u_still = (u_src * sw * s + dx) / cw
v_still = (v_src * sh * s + dy) / ch
with s = max(cw/sw, ch/sh), dx = (cw - sw*s)/2, dy = (ch - sh*s)/2

S11 (720×720 → 1280×720):
  u_still = u_src
  v_still = 1.7777778 * v_src - 0.3888889
frozen ROI → center (0.5, 0.6777778), size (0.28, 0.2133333)
frame N ↔ source time N/30 s, zero offset
```

Identity is reached only when source AR == composition AR — which the existing invoke
does **not** produce, because it omits `targetWidth`/`targetHeight` and thus falls back
to 1280×720.

Non-blocking notes for later gates (not part of this proof): the cover crop discards
21.875% of the preclip vertically, and the still is JPEG q85 — both are metric-scale
concerns that belong to the calibration gate, not to this transform proof.

## Gate

FA-4 REMOTION SOURCE→STILL TRANSFORM PROOF = PASS
SOURCE_TO_STILL = DETERMINISTIC_TRANSFORM
→ STOP
