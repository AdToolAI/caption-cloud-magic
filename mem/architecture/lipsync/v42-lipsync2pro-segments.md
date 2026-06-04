---
name: v42 Lipsync-2-Pro Official Segments
description: For 3+ speaker dialog scenes, compose-dialog-segments now dispatches the canonical Sync.so multi-speaker `segments[]` payload against `lipsync-2-pro` (not sync-3). v41 sent the same shape against sync-3, which silently ignores `segments[]` (sync-3 is a "full-shot global" model with no segments support in the docs) — only the dominant speaker got lipsync and the job ended in opaque "An unknown error occurred." after 10–13 min. v42 also drops the undocumented `active_speaker_detection.auto_detect:false` field — only `{frame_number, coordinates}` is sent, matching one of the four exclusive ASD variants in the official docs.
type: architecture
---

**Why:** The Sync.so docs (`docs.sync.so/developer-guides/segments` + `docs.sync.so/models/lipsync`) show every multi-speaker `segments[]` example against `lipsync-2`/`lipsync-2-pro`. `sync-3` is described as "processes the full shot at once" / "builds a global understanding across the entire shot" — segments are not listed in its feature set, and Sync.so explicitly says unsupported options are silently ignored. That matches our v41 symptom exactly (job runs full duration, only one speaker animated, opaque error at the end).

**v42 payload (3+ speakers):**

```text
POST https://api.sync.so/v2/generate
{
  model: "lipsync-2-pro",
  input: [
    { type: "video", url: sourceClipUrl },
    { type: "audio", url: speaker1WavUrl, ref_id: "speaker_1" },
    { type: "audio", url: speaker2WavUrl, ref_id: "speaker_2" },
    { type: "audio", url: speaker3WavUrl, ref_id: "speaker_3" },
  ],
  segments: [
    { startTime, endTime,
      audioInput: { refId: "speaker_N", startTime, endTime },
      optionsOverride: {
        active_speaker_detection: { frame_number, coordinates: [x, y] }
      } },
    ...
  ],
  options: { sync_mode: "loop" },
  webhookUrl, webhook_url
}
```

**State (`composer_scenes.dialog_shots`):** `version: 42`, `engine: "sync-official-segments"`, `model: "lipsync-2-pro"`. Webhook (`sync-so-webhook`) accepts both v41 and v42 to keep any in-flight v41 jobs from black-holing.

**Trigger:** `speakers.length >= 3` on fresh dispatch or `retry_v41: true`. 1–2 speaker scenes keep the v5 fan-out — they were never the bug.

**One-time scene reset:** `5f43e669-b154-4ac9-a516-b46acb7ee288` was cleared (dialog_shots=null, lip_sync_status=pending) so the auto-trigger picks it up on the new v42 path.

**Pending cleanup (after v42 is green):** remove the v5/v23/v26/v32–v40 fan-out + tight-WAV + repair-WAV + face-mask-mux scaffolding, collapse 30+ legacy lipsync memory files into this single canonical entry, and drop `render-sync-segments-audio-mux` once no v5 rows remain in flight.
