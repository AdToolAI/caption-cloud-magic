---
name: v50 Sync.so Multi-Speaker — Pro + per-segment bounding_boxes
description: 3+ speaker dialog scenes dispatch a single Sync.so call with `model="lipsync-2-pro"` + `segments[]` + per-segment `optionsOverride.active_speaker_detection.bounding_boxes` (frame-indexed [x1,y1,x2,y2] from the plate face-map, rescaled to plate space). Speaker→box mapping: characterId → slotIndex → left-to-right fallback. If a speaker has no detected box, that segment omits the override (auto-ASD fallback). Webhook gate accepts v41..v50.
type: architecture
---

**Why v50 (after v49 issues):**
- v49 (`lipsync-2` + `segments[]` + auto-ASD) completed reliably but on 3-speaker plates auto-ASD only locked the two strongest faces — speaker_3's mouth stayed closed.
- Quality of `lipsync-2` is visibly softer than `lipsync-2-pro` around the mouth region; user reported sub-par fidelity.

**Probe table:**

| # | model | segments[] | per-segment ASD | Result |
|---|---|---|---|---|
| V1 | lipsync-2 | ✅ | coordinates | ❌ unknown error |
| V2 | lipsync-2 | ✅ | none (auto) | ✅ COMPLETED, lost speaker_3 |
| V3 | lipsync-2-pro | ✅ | coordinates | ❌ unknown error |
| V4 | lipsync-2 | ❌ single audio | coordinates | ✅ COMPLETED |
| **v50** | **lipsync-2-pro** | ✅ | **bounding_boxes** | new payload, doc-conform |

The `coordinates` ASD variant is the only one that triggers Sync.so "unknown error" with `segments[]`. `bounding_boxes` is documented as a separate mutually-exclusive ASD mode and is the deterministic alternative for speaker targeting.

**v50 payload:**

```
POST https://api.sync.so/v2/generate
{
  model: "lipsync-2-pro",
  input: [
    { type: "video", url: sourceClipUrl },
    { type: "audio", url: spk1Url, refId: "speaker_1" },
    { type: "audio", url: spk2Url, refId: "speaker_2" },
    { type: "audio", url: spk3Url, refId: "speaker_3" }
  ],
  segments: [
    {
      startTime, endTime,
      audioInput: { refId: "speaker_N", startTime, endTime },
      optionsOverride: {
        active_speaker_detection: {
          bounding_boxes: [[x1,y1,x2,y2], ...]   // per-frame @ 24fps for segment duration
        }
      }
    },
    ...
  ],
  options: { sync_mode: "cut_off" },
  webhookUrl
}
```

**Box derivation:**
- Pull `faceMap.faces[]` from cached preflight (Stage G).
- Per speaker (in order): match by `characterId`, then by `slotIndex`, then by left-to-right sort of detected boxes.
- Rescale anchor-space bbox to plate-space using `faceMap.width/height` → `plateDims.width/height`.
- 15% padding around bbox; clamp to plate bounds.
- If no box resolvable → segment is emitted WITHOUT `optionsOverride` → Sync.so falls back to auto-ASD for that segment only (other speakers stay deterministic).

**State (`composer_scenes.dialog_shots`):** `version: 50`, `engine: "sync-official-segments-v50"`, `asd_mode: "bounding_boxes_per_segment"`, `model: "lipsync-2-pro"`, `twoshot_stage: "syncso_v50_official_segments"`. Diagnostic fields: `v50_box_map`, `v50_segments_with_box`, `v50_segments_auto_fallback`.

**Webhook:** `sync-so-webhook` version gate accepts `41..50` AND engine `sync-official-segments` OR `sync-official-segments-v50`.

**Cost:** unchanged — `ceil(totalSec) × 9` credits per scene (1 call). Real Sync.so cost ~2× for Pro but user-charged rate already used the Pro figure, so margin shifts ~22% → ~0% on dialog scenes. Acceptable trade-off for fidelity.

**Log marker:** `v50_official_segments_payload model=lipsync-2-pro asd=bounding_boxes_per_segment speakers=3 with_box=N auto_fallback=M`.

**Supersedes:** v41–v49 (kept for webhook backwards compat).
