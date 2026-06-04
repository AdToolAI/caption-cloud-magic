---
name: v46 Sync.so Multi-Speaker Segments — docs-exact
description: For 3+ speaker dialog scenes, compose-dialog-segments now sends the canonical Sync.so Segments payload EXACTLY as documented at docs.sync.so/developer-guides/segments — model `lipsync-2-pro` (sync-3 silently ignores segments[]), per-segment ASD `{ frame_number, coordinates }` ONLY (no `auto_detect` — the four ASD variants are mutually exclusive), top-level `options.sync_mode: "cut_off"`, audio inputs carry BOTH `ref_id` (snake_case REST) and `refId` (camelCase) so the parser accepts either, and a pre-dispatch validator rejects any segment whose `audioInput.refId` is not present in `input[]`. Webhook accepts v41–v46.
type: architecture
---

**Why:** v45 regressed back to `sync-3`, which the docs describe as a full-shot global model that does NOT support `segments[]` — Sync.so accepted the request and then failed with the opaque "An unknown error occurred." after 10–13 min, exactly the same symptom v42 fixed once. v46 restores `lipsync-2-pro` and additionally drops the undocumented `auto_detect: false` field (the docs list the four ASD variants as exclusive) and writes `ref_id` snake_case in `input[]` to match the docs' Python/TypeScript examples.

**Payload (3+ speakers):**

```
POST https://api.sync.so/v2/generate
{
  model: "lipsync-2-pro",
  input: [
    { type: "video", url: sourceClipUrl },
    { type: "audio", url: speaker1WavUrl, ref_id: "speaker_1", refId: "speaker_1" },
    { type: "audio", url: speaker2WavUrl, ref_id: "speaker_2", refId: "speaker_2" },
    { type: "audio", url: speaker3WavUrl, ref_id: "speaker_3", refId: "speaker_3" },
  ],
  segments: [
    { startTime, endTime,
      audioInput: { refId: "speaker_N", startTime, endTime },
      optionsOverride: {
        active_speaker_detection: { frame_number, coordinates: [x, y] }
      } },
    ...
  ],
  options: { sync_mode: "cut_off" },
  webhookUrl, webhook_url
}
```

**Trigger:** `speakers.length >= 3` on fresh dispatch or `retry_v41: true`. 1–2 speaker scenes keep the v5 fan-out (never the bug).

**State (`composer_scenes.dialog_shots`):** `version: 46`, `engine: "sync-official-segments"`, `model: "lipsync-2-pro"`, `asd_mode: "coordinates"`, `twoshot_stage: "syncso_v46_official_segments"`.

**Webhook (`sync-so-webhook/index.ts`):** version gate accepts `41 | 42 | 43 | 44 | 45 | 46` so any in-flight job (incl. legacy versions) is closed cleanly. Retry (1x) + idempotent wallet refund unchanged.

**Pre-dispatch validation:** every `audioInput.refId` must exist in `input[]`; coordinates clamped to plate dimensions; segments sorted by `startTime`. Diagnostic log marker: `v46_official_segments_payload model=lipsync-2-pro asd=coords speakers=N audio_refs=[…] segments=N sync_mode=cut_off video=WxH`.

**Supersedes:** v41, v42, v43, v44, v45 memories.
