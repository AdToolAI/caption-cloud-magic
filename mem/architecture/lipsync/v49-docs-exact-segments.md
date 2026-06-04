---
name: v49 Sync.so Multi-Speaker Segments — probe-proven payload
description: 3+ speaker dialog scenes dispatch a single Sync.so call with `model="lipsync-2"` + `segments[]` + `options.sync_mode="cut_off"` and NO per-segment `optionsOverride.active_speaker_detection`. Sync.so auto-detects which face speaks from the per-segment audio track. Webhook gate accepts v41..v49.
type: architecture
---

**Why (proof, not theory):** June 2026 live probes against scene `61edb887…` ran 4 variants on the same plate/audio:

| # | model | segments[] | per-segment ASD coords | Result |
|---|---|---|---|---|
| V1 | lipsync-2 | ✅ | ✅ | ❌ "unknown error" after 13 min |
| V2 | lipsync-2 | ✅ | ❌ | ✅ COMPLETED |
| V3 | lipsync-2-pro | ✅ | ✅ | ❌ "unknown error" after 13 min |
| V4 | lipsync-2 | ❌ (single audio) | ✅ | ✅ COMPLETED |

→ The combo `segments[] + per-segment ASD coordinates` is the **only** structurally broken combination. Model (`lipsync-2` vs `-pro`, both aliased server-side to `sync-2[-pro]`) is neutral. Segments alone and ASD alone are both green.

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

**Trade-off:** if Sync.sos auto-ASD picks the wrong mouth on dense multi-face plates, the 1–2-speaker scenes fall back to the v5 fan-out (one Sync.so call per speaker). For 3+ speakers, v49 is the canonical path; manual coordinates are no longer an option because they break the API.

**Cost:** still 1 Sync.so call total per scene → `ceil(totalSec) × 9` credits.

**Supersedes:** v41, v42, v43, v44, v45, v46, v47.
