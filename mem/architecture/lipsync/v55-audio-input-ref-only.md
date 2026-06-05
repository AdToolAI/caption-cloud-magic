---
name: Lip-Sync v55 audioInput refId-only
description: Multi-speaker official Sync.so segments dispatch must send audioInput as { refId } only (no startTime/endTime crop) when each speaker has their own short WAV.
type: constraint
---

# Lip-Sync v55 audioInput refId-only

In `compose-dialog-segments` official multi-speaker `segments[]` dispatch:

- `audioInput.startTime/endTime` is a crop INSIDE the referenced audio file
  (per Sync.so docs/developer-guides/segments), NOT a scene-timeline window.
- Each speaker ships their own short WAV (e.g. 0.88s, 2.27s, 2.97s) via
  `compose-twoshot-audio`. Passing global scene-timeline seconds as crop
  points outside the WAV and triggered opaque `An unknown error occurred.`
  failures on `sync-3`.
- The segment's own top-level `startTime/endTime` already places it on the
  video timeline; `options.sync_mode: "cut_off"` handles length mismatch.

Correct per-segment shape:

```json
{
  "startTime": 2.479,
  "endTime": 3.454,
  "audioInput": { "refId": "speaker_2" },
  "optionsOverride": {
    "active_speaker_detection": {
      "auto_detect": false,
      "frame_number": 59,
      "coordinates": [383, 227]
    }
  }
}
```

Never re-add `startTime/endTime` to `audioInput` for per-speaker WAVs.
