# v129.3 — Sync-Audio Normalization Hotfix

## Root cause (scene 7aed09f4-…, Sarah pass-4)
- preclip_duration_sec = 1.785
- audio_full_sec = 9, wav.leadInSec = 6.688, audio_voiced_sec = 1.725
- Sync.so sync-3 + cut_off → terminal `provider_unknown_error`
- v129.1 doc-strict + v129.2.1 ambiguity guard were all green (coords clean, 1 face in crop) — coords were never the problem; the **input audio** was.

## Fix
Provider-only sync audio, built per pass right before dispatch in `compose-dialog-segments`:
1. Fetch `pass.audio_url`, run `inspectWav` + new `detectVoicedRange` (see `_shared/syncso-preflight.ts`).
2. If `leadIn > 0.5s` OR `voicedEnd > preclip_dur + 0.25` OR significant slack vs voiced extent → slice to `[first_voiced − 0.15, last_voiced + 0.20]` via existing `sliceWavToWindows`.
3. Upload to `${userId}/twoshot-vo/${scene}-pass-${idx+1}-sync-${sha1Short}.wav` (deterministic, idempotent upsert).
4. Re-inspect trimmed bytes, run post-trim gate:
   - `voicedSec < 0.15s` → `audio_too_silent`
   - `firstVoicedSec > 0.5s` → `audio_leadin_too_long_after_trim`
   - `lastVoicedSec > preclip + 0.25s` → `audio_voiced_exceeds_video`
   - `full > preclip + 0.5s && tailSilence < 0.2s` → `audio_overflow_unverifiable_tail`
5. All gate failures → `failBeforeProviderDispatch` (terminal, refund via existing row-flag idempotency, no Sync.so call).
6. Store URL on `(pass as any).sync_audio_url`; **do not** mutate `pass.audio_url` (audio-mux Lambda keeps the original timeline-aligned WAV).

`sliceWavToWindows` already validates RIFF/WAVE/PCM/16-bit and computes frame-exact boundaries; any unsupported format throws and is caught into `unsupported_wav_format_for_trim` terminal.

## Payload wiring
- `payload.input[].audio.url` = `sync_audio_url ?? audio_url`
- `v105Probe.payload_audio_url` mirrors the same fallback; `payload_audio_normalized` + `audio_normalization` are persisted to `syncso_dispatch_log.meta`.

## Terminal short-circuit
Already v128-conformant — `COMPLETED_NOOP_SUSPECT` is terminal (no auto-retry, `sync_noop_suspect:true` for UI badge), `COORD_REFRESH_SKIPPED` is only emitted for already-terminal passes and never re-dispatches. No new retry path was introduced.

## Refund idempotency
Existing `dialog_shots.refunded` row flag prevents double-refunds. v129.3 records `attempt_id`, `pass_idx`, `speaker_name`, `error_class` in the `PRE_DISPATCH_FAILED` meta for traceability. Full UUID-v5 keyed refund table deferred to v129.4.

## Out of scope
- Crop math / `computeFaceCrop` (v129.2.1 untouched)
- Upstream fix in `compose-dialog-vo` so per-turn WAVs don't carry 6.7s lead-in (v129.5)
- `provider_unknown_error` sub-bucket classification (v129.4)

## Canary
Use a **new** scene with identical multi-speaker setup OR an explicit user-retry with new `attempt_id`. Do not in-place reset the old terminal scene.

Per pass after deploy:
- `meta.payload_audio_normalized = true` for any pass with non-trivial leadIn.
- `meta.audio_normalization.mode = "voiced_window"`, `removed_lead_sec` per-pass (not all identical — that would be its own bug).
- Sarah-equivalent pass: `removed_lead_sec ≈ 6.5s`, `first_voiced_sec_after_trim ≈ 0.15`, `trimmed_full_sec ≈ 1.9–2.1s`.
- If still terminal: `error_class` deterministic (one of the four gate codes or `provider_unknown_error`), refund booked, no retry loop.

### Verification SQL
```sql
select created_at, sync_status, error_class,
       meta->>'payload_audio_normalized' as normalized,
       meta->'audio_normalization'->>'mode' as norm_mode,
       meta->'audio_normalization'->>'removed_lead_sec' as removed_lead_sec,
       meta->'audio_normalization'->>'trimmed_full_sec' as trimmed_sec,
       meta->>'preclip_duration_sec' as preclip_sec
from syncso_dispatch_log
where scene_id = '<NEW_SCENE_ID>'
order by created_at desc;
```
