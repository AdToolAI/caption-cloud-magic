---
name: v43 Bounding-Boxes ASD for Multi-Speaker Segments
description: For 3+ speaker dialog scenes, compose-dialog-segments now sends `active_speaker_detection: { frame_number, bounding_boxes: [[x1,y1,x2,y2]] }` per segment instead of v42's `{ frame_number, coordinates: [x,y] }`. Boxes come from faceMap (anchor → plate-space rescale + pad) with fallback to a square around the point. Pad escalates on retry (0.08 → 0.18 → 0.28) so shoulder-to-shoulder shots where the face drifts a few px off the point no longer return "An unknown error occurred." after 10–13 min.
type: architecture
---

**Why:** Sync.so ASD has 4 exclusive variants (`auto_detect`, `v3`, `frame_number+coordinates`, `frame_number+bounding_boxes`). v41/v42 used the point variant. On shoulder-to-shoulder 3+ speaker plates the face can land a few pixels off the point, and Sync.so fails the whole job with a generic `An unknown error occurred.` after the full run. Boxes give Sync.so a tolerance window per speaker.

**Payload (3+ speakers, unchanged outside ASD):**

```
POST https://api.sync.so/v2/generate
{
  model: "lipsync-2-pro",
  input: [
    { type: "video", url: sourceClipUrl },
    { type: "audio", url: speaker1WavUrl, refId: "speaker_1" },
    { type: "audio", url: speaker2WavUrl, refId: "speaker_2" },
    { type: "audio", url: speaker3WavUrl, refId: "speaker_3" },
  ],
  segments: [
    { startTime, endTime,
      audioInput: { refId: "speaker_N", startTime, endTime },
      optionsOverride: {
        active_speaker_detection: {
          frame_number: <int>,
          bounding_boxes: [[x1, y1, x2, y2]]   // v43
        }
      } },
    ...
  ],
  options: { sync_mode: "loop" },
  webhookUrl, webhook_url
}
```

**Box source (per speaker, plate-space integer):**
1. `faceMap` match (by `characterId` then `slotIndex`) → rescale anchor bbox → pad `max(w,h) * bboxPadFactor` → clamp to `[0,W]/[0,H]`.
2. Fallback square around resolved point: `width = W*(0.16+pad)`, `height = H*(0.24+pad)`.

Collision guard: identical boxes get a 4·i px horizontal shift so Sync.so can disambiguate (rare, logs `v43_bbox_speaker_collision`).

**State (`composer_scenes.dialog_shots`):** `version: 43`, `engine: "sync-official-segments"`, `asd_mode: "bounding_boxes"`, `bbox_pad_factor: 0.08 | 0.18 | 0.28+`, `model: "lipsync-2-pro"`. Webhook accepts v41/v42/v43 to keep in-flight jobs from black-holing.

**Retry escalation (`sync-so-webhook`):** on transient FAIL, bump `bbox_pad_factor` by +0.10 (cap 0.35), set `twoshot_stage = syncso_v43_retry_N_padXX`, re-dispatch with `retry_v41: true`. After `MAX_V41_RETRIES = 1` → idempotent refund.

**Logs:**
- Dispatch: `v43_official_segments_payload model=lipsync-2-pro asd=bbox pad=0.08 speakers=N segments=N`
- Per speaker: `v43 speaker=speaker_2 name=… bbox=[x1,y1,x2,y2] source=facemap:identity|fallback_square pad=0.08`
- Retry: `v43 scene=… → retry 1/1 bbox_pad=0.18`

**Trigger:** `speakers.length >= 3` on fresh dispatch or `retry_v41: true`. 1–2 speaker scenes keep the v5 fan-out (never the bug).

**Pending cleanup (after v43 is green on a real 3+ speaker scene):** remove v5/v23/v26/v32–v42 fan-out + tight-WAV + face-mask-mux scaffolding, consolidate 30+ legacy lipsync memory files, drop `render-sync-segments-audio-mux`.
