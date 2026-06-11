---
name: v108 Preclip + auto_detect allowed (v105 Guard scoped to Full-Plate)
description: The v105 multi-speaker auto_detect block applies ONLY to the full-plate dispatch path. On the v107-enforced single-face preclip path, `active_speaker_detection: { auto_detect: true }` is the canonical and doc-strict sync-3 shape — guard MUST allow it.
type: architecture
---

# Why

v107 (Hard-Preclip Enforcement) makes `wantPassPreclip = true` mandatory for
`speakers.length >= 2`. The preclip branch (v103, `compose-dialog-segments/index.ts`
~line 2737) deliberately sets `active_speaker_detection: { auto_detect: true }`
because:

1. The 512×512 preclip crop has exactly ONE face by construction
   (`render-pass-face-preclip` enforces `preclip_face_count === 1`).
2. sync-3 silently rejects every other ASD shape on a preclip
   (`bounding_boxes`, `coordinates`, `bounding_boxes_url`) and terminates the
   job with `provider_unknown_error` — v103 was the fix.

The v105 hard-guard was written for the **full-plate** multi-speaker path
(`auto_detect: true` on a plate with multiple faces routes all audios onto
one face → "animorph" + frozen mouths). With v107 in place, every multi-
speaker pass now hits the preclip branch and the v105 guard incorrectly
short-circuits the only doc-compliant sync-3 ASD shape →
`multi_speaker_auto_detect_blocked` on every dispatch.

# Rule

In `compose-dialog-segments/index.ts` the auto-detect hard-fail MUST be
gated by `!usePassPreclip`:

```ts
if (
  !usePassPreclip &&
  speakers.length >= 2 &&
  asdForProbe?.auto_detect === true
) {
  return await failBeforeProviderDispatch(
    "multi_speaker_auto_detect_blocked",
    "asd_auto_detect_on_multi_speaker_fullplate",
    "...",
    500,
    { v105_probe: v105Probe },
  );
}
```

Coverage matrix after v108:

| N | dispatch_video_kind | ASD shape         | result   |
|---|---------------------|-------------------|----------|
| 1 | preclip             | auto_detect       | allowed  |
| ≥2| preclip             | auto_detect       | allowed (v108) |
| ≥2| full_plate          | auto_detect       | blocked (v105 intent preserved) |
| ≥2| full_plate          | coords / bbox_url | allowed  |
| ≥2| full_plate (edge speaker, `bbox-url-pro`) | bounding_boxes_url | allowed (v88) |

# File

- `supabase/functions/compose-dialog-segments/index.ts` — guard at
  `~line 3086` now scoped by `!usePassPreclip`.

# Verification

For a fresh N=4 dispatch, `syncso_dispatch_log.meta` must show for every
pass:
- `dispatch_video_kind: "preclip"`
- `asd_mode: "auto_detect"`
- `options_keys` excludes `temperature` and `occlusion_detection_enabled`
  (v106 doc-strict scrub remains active)
- No `multi_speaker_auto_detect_blocked` and no `provider_unknown_error`.
