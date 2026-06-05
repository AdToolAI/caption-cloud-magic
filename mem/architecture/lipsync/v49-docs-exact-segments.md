---
name: v49 Sync.so Multi-Speaker Segments — SUPERSEDED by v50
description: SUPERSEDED 2026-06-05 by v50 (Pro + per-segment bounding_boxes). v49 used `lipsync-2` + `segments[]` + auto-ASD; doc-conform but auto-ASD lost speaker_3 on 3-speaker plates and quality of `lipsync-2` was visibly softer than Pro. See mem://architecture/lipsync/v50-pro-bounding-boxes for current payload.
type: architecture
---

**Why (proof, not theory):** June 2026 live probes against scene `61edb887…` ran 4 variants on the same plate/audio:

| # | model | segments[] | per-segment ASD coords | Result |
|---|---|---|---|---|
| V1 | lipsync-2 | ✅ | ✅ | ❌ "unknown error" after 13 min |
| V2 | lipsync-2 | ✅ | ❌ | ✅ COMPLETED |
| V3 | lipsync-2-pro | ✅ | ✅ | ❌ "unknown error" after 13 min |
| V4 | lipsync-2 | ❌ (single audio) | ✅ | ✅ COMPLETED |

→ The combo `segments[] + per-segment ASD coordinates` is the **only** structurally broken combination. Per the Sync.so Segments docs the 4 ASD modes (`auto_detect`, `v3`, `frame_number+coordinates`, `bounding_boxes(_url)`) are **mutually exclusive**, and `auto_detect` is the documented default — that is what v49 relies on.

**v49 payload (single call, 3+ speakers):**

```
POST https://api.sync.so/v2/generate
{
  model: "lipsync-2",
  input: [
    { type: "video", url: sourceClipUrl },
    { type: "audio", url: spk1Url, ref_id: "speaker_1", refId: "speaker_1" },
    { type: "audio", url: spk2Url, ref_id: "speaker_2", refId: "speaker_2" },
    { type: "audio", url: spk3Url, ref_id: "speaker_3", refId: "speaker_3" }
  ],
  segments: [
    { startTime, endTime, audioInput: { refId: "speaker_N", startTime, endTime } },
    ...
  ],
  options: { sync_mode: "cut_off" },
  webhookUrl
}
```

NO `optionsOverride`. NO `active_speaker_detection`. NO `bounding_boxes`. NO `auto_detect`. Sync.so picks the right face per segment from the audio track.

**State (`composer_scenes.dialog_shots`):** `version: 49`, `engine: "sync-official-segments"`, `asd_mode: "auto"`, `model: "lipsync-2"`, `twoshot_stage: "syncso_v49_official_segments"`.

**Webhook:** `sync-so-webhook` version gate accepts `41..49`. Per-scene partial-mux race guard (v48) preserved.

**Gate (2026-06-05):** v49 runs whenever `speakers.length >= 3` AND every speaker has a `track_url`. The previous plate-native face-detect gate (validate-frame-face → ≥N boxes required) was REMOVED — it cropped-head plates would silently route to the v5 fan-out path, which uses `bounding_boxes` + per-pass coords (a doc-violating mutually-exclusive ASD combo) and burned 15 min in `coords-pro → coords-pro-box → sync3-coords` retry loops, all returning "An unknown error occurred." For 1- and 2-speaker scenes the v5 fan-out remains the canonical path.

**Trade-off:** Sync.so's auto-ASD picks the speaker face per segment from the audio track. On dense multi-face plates with similar voices this is non-deterministic, but the docs explicitly recommend `auto_detect` for multi-speaker scenes and it is the only segment-payload variant that does not produce the "unknown error" failure mode.

**Cost:** still 1 Sync.so call total per scene → `ceil(totalSec) × 9` credits.

**Supersedes:** v41, v42, v43, v44, v45, v46, v47.
