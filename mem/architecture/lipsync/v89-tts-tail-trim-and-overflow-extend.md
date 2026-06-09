---
name: v89 — TTS Tail Trim + Dialog Overflow Extend
description: ElevenLabs with-timestamps trim of hallucinated tails, and scene-extend instead of hard-trim for dialog overflow
type: architecture
---

**v89 (June 2026, compose-twoshot-audio):** Two TTS-assembly bugs hit multi-speaker dialog scenes:

1. **Hallucinated tail (Char 2 „says something after their text"):** ElevenLabs sometimes appends words/breaths/"mhm" past the script. The previous raw `pcm_24000` route had no script-vs-audio cap. v89 switches `elevenlabsPcm` to the `with-timestamps` endpoint, reads `alignment.character_end_times_seconds[lastChar]`, and hard-caps the PCM at `lastEnd + 0.12 s` (consonant-decay tail). Fallback: energy-VAD trailing-silence trim (-38 dBFS, ≥120 ms silence) when the timestamps call fails. Per-utterance diagnostics persist in `composer_scenes.audio_plan.twoshot.tts_diagnostics[]` (`{scriptChars, rawDurSec, trimmedDurSec, hallucinatedTailMs, trimMode}`).

2. **Sarah-cutoff (last speaker abgeschnitten):** Previously `mergedSamples.subarray(0, totalSamples)` hard-trimmed the merged WAV at `sceneDur`, silently losing the last 50–400 ms when the dialog overshot the plate. v89: if `spokenSec > sceneDur + 0.30`, the scene is extended in 0.1 s steps to `ceil((spokenSec + 0.30) * 10) / 10` (capped at `MAX_EXTEND_SEC = 5.0`), `composer_scenes.duration_seconds` is upserted, and `audio_plan.twoshot.dialog_overflow_extended = {from, to, overflowSec}` is stored. Beyond the cap → `dialog_too_long_for_plate` (400) with German UI-friendly message asking the user to shorten the text or extend the scene.

**Constants:** `OVERFLOW_GRACE_SEC = 0.30`, `MAX_EXTEND_SEC = 5.0`, consonant-decay pad = 120 ms, energy-VAD threshold = −38 dBFS, min trailing silence = 120 ms.

**Compatibility:** Returns of `elevenlabsPcm` changed from `Int16Array` to `{pcm, rawDurSec, trimmedDurSec, hallucinatedTailMs, trimMode}`. Both callsites in `compose-twoshot-audio/index.ts` were updated. `humePcm` unchanged.

**Validation:** Re-run scene shows `tts_diagnostics[*].hallucinatedTailMs` near 0 for clean utterances, `>400` flagged in logs. Master WAV duration equals `max(spokenSec, sceneDur)` — Sarah's last word audible to completion.
