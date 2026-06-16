# v129.3-revised — Sync-Audio Normalization Hotfix

## Scope
Reiner Hotfix für die in scene `7aed09f4-…` beobachtete Failure-Class: Sync.so bekommt timeline-style per-turn-Audio (1.78s Preclip vs 9s WAV mit 6.7s führender Stille) und antwortet mit `provider_unknown_error`. v129.3 normalisiert das Sync-Audio **lokal zum Preclip** und blockiert nicht-dispatchbare Inputs preflight.

Kein Crop-/Coord-/State-Machine-/Watchdog-/Plan-D-/Model-/UI-/Segments-/A-B-Touch. v129.1 doc-strict und v129.2.1 ambiguity guard bleiben unverändert.

## Bestätigte Forensik
- `asd_mode = preclip_coords_doc_strict`, coords in-bounds, `preclip_ambiguity.risk = "clean"`, 1 Face im Crop → kein Coord-Problem.
- `preclip_duration_sec = 1.785`, `audio_full_sec = 9`, `wav.leadInSec = 6.688`, `audio_voiced_sec = 1.725`.
- Sync.so terminal `provider_unknown_error` auf sync-3 + `cut_off`.
- Bisheriger Code dispatcht nach `COMPLETED_NOOP_SUSPECT` einen Coord-Refresh-Retry; das verbrennt Credits am identischen Input.

## Changes

### Change A — Sync-Audio Normalization (provider input only)
Für jeden Pass vor Dispatch ein dediziertes `sync_audio` bauen, das nur für den Sync.so-Payload verwendet wird. Der finale Mux/Dialog-Audio bleibt unangetastet.

Bevorzugter Pfad (voiced-window):
```
start_sec = max(first_voiced_sec - 0.15, 0)
end_sec   = min(last_voiced_sec  + 0.20, audio_full_sec)
sync_audio = wav[start_sec .. end_sec]
```

Fallback (wenn `last_voiced_sec` nicht verfügbar): Lead-In-only Trim mit 150ms Pre-Roll. Danach **Diagnostics neu berechnen** auf den getrimmten Bytes.

WAV-Scanner (`_shared/audio-vad.ts` oder existing helper) wird minimal erweitert um:
- `first_voiced_sec`
- `last_voiced_sec`
- `tail_silence_sec`
zusätzlich zu vorhandenen `leadInSec`, `voiced_sec`.

Upload-Pfad: `${userId}/twoshot-vo/${scene_id}-pass-${idx}-sync-${hash}.wav`. Idempotent über deterministischen Hash aus `(scene_id, pass_idx, removed_lead_sec_rounded_0.05, trimmed_full_sec_rounded_0.05)`.

Logging in `meta`:
```
audio_original_url: "...",
sync_audio_url:    "...-sync.wav",
audio_normalization: {
  mode: "voiced_window" | "lead_in_only" | "skipped",
  original_full_sec, original_lead_in_sec,
  pre_roll_sec, post_roll_sec,
  removed_lead_sec, removed_tail_sec,
  trimmed_full_sec,
  first_voiced_sec_after_trim,
  last_voiced_sec_after_trim,
  used_for: "syncso_input_only"
}
```

Sync.so-Payload bekommt `sync_audio_url`. Final-Mux/Stitch bekommt weiter `audio_original_url`.

### Change B — WAV-Slice Safety
Helper `trimWavWindow(bytes, startSec, endSec)` in `_shared/wav-utils.ts`. Validiert vor jedem Slice:
- RIFF/WAVE header present
- fmt: PCM (format=1)
- `sampleRate ∈ {16000, 22050, 24000, 44100, 48000}`
- `bitsPerSample ∈ {16, 24}`
- `channels ∈ {1, 2}`
- data chunk gefunden, korrekte size
- `bytesPerFrame = channels * bitsPerSample / 8`
- `frame_start = round(startSec * sampleRate)`, frame-aligned
- RIFF chunk size + data chunk size in output korrekt aktualisiert

Bei Validation-Fail: **kein Slice**, `sync_status = DISPATCH_BLOCKED_AUDIO_PRECHECK`, `error_class = "unsupported_wav_format_for_trim"`, refund, kein Provider-Call.

### Change C — Audio/Video Preflight Gate (post-trim)
Nach Change A, **auf den getrimmten Diagnostics** (nicht auf den originalen):
```
if trimmed_first_voiced_sec > 0.5:
  block, error_class = "audio_leadin_too_long_after_trim"

if trimmed_voiced_end_sec > preclip_duration_sec + 0.25:
  block, error_class = "audio_voiced_exceeds_video"

if trimmed_full_sec > preclip_duration_sec + 0.5 AND tail_silence_unreliable:
  block, error_class = "audio_overflow_unverifiable_tail"

if audio_voiced_sec < 0.15:
  block, error_class = "audio_too_silent"
```

Geblockte Passes:
- `sync_status = DISPATCH_BLOCKED_AUDIO_PRECHECK`
- `provider_call_made = false`
- idempotenter Refund
- kein Retry

### Change D — Terminal Retry Short-Circuit (v128-konform)
Keine neuen Auto-Retry-Pfade. Bestehende Coord-Refresh-Retry-Schleife muss für folgende terminale Klassen **vor** dem Dispatch short-circuiten:

```
COMPLETED_NOOP_SUSPECT      → terminal, KEIN Auto-Retry, KEIN Refund (kein Spend bestätigt? — bestehende v128-Regel respektieren), UI/Admin-Retry möglich
provider_unknown_error      → terminal, Refund, KEIN Auto-Retry
DISPATCH_BLOCKED_AUDIO_PRECHECK → terminal, Refund, KEIN Auto-Retry
```

Coord-Refresh-Loop darf für terminale Passes **keinen** Provider-Call mehr machen. `COORD_REFRESH_SKIPPED` als Telemetry akzeptabel, aber kein Dispatch dahinter.

**Keine Ausnahme** für `preclip_ambiguity.risk != "clean"`. Terminal bleibt terminal (v128 invariant).

### Change E — Idempotente Refund-Keys
Refund-Idempotency-Key umstellen auf:
```
refund_key = uuidv5(`${scene_id}:${pass_idx}:${attempt_id ?? "0"}:${error_class}`)
```
Statt `scene_id + turn_idx`. Verhindert Kollisionen bei mehreren Sprechern pro Szene und sauberes Trennen von User-Retries.

### Change F — Docs + Memory
- `docs/lipsync/v129-3-sync-audio-normalization.md`: Forensik (scene 7aed09f4 timeline mit Pass-Tabelle), Change A–E Spec, Canary-Plan, Failure-Klassifizierung.
- `mem/architecture/lipsync/v1293-sync-audio-normalization.md`: Kernregel ("Sync.so input audio MUST be local to preclip; never timeline audio with leading silence").
- `mem/index.md`: Eintrag.
- `.lovable/plan.md`: v129.3-revised Status.

## Out of Scope
- v129.4: `provider_unknown_error`-Sub-Bucket-Klassifizierung (welche Buckets könnten in Zukunft retrybar sein).
- v129.5: Upstream-Fix in `compose-dialog-vo` (per-turn-VOs sollten gar nicht erst mit 6.7s Lead-In gebaut werden).
- Keine Änderungen an: `computeFaceCrop`, v129.1 doc-strict path, v129.2.1 ambiguity guard, State Machine, Watchdog, Plan-D, lipsync-2-pro, Two-Face crops, Segments, UI, Stage 4 A/B.

## Canary
**Nicht** die alte terminale Scene `7aed09f4-…` in-place resetten. Stattdessen: neue Scene mit identischem Cast/Setup ODER expliziter User-Retry mit neuer `attempt_id`.

Erwartete Signatur pro Pass nach Deploy:
- Jeder Pass hat **eigenen** `removed_lead_sec` passend zu seiner Turn-Position (nicht alle 6.5s — wäre selbst ein Bug-Signal).
- Pass mit Sarah-äquivalentem Turn: `removed_lead_sec ≈ 6.5s`, `first_voiced_sec_after_trim ≈ 0.15`, `trimmed_full_sec ≈ 1.9–2.1s`, passt in `preclip_duration + 0.25` Toleranz.
- Andere Passes: `removed_lead_sec` zwischen 0 und ein paar Sekunden, je nach Lead-In.
- `sync_audio_url ≠ audio_original_url` für alle Passes mit nontrivialem Trim.
- Wenn Pass trotz Normalization terminal failed: `error_class` ist deterministisch erkennbar, Refund gebucht, **keine** Retry-Schleife.
- Kein neuer `COORD_REFRESH_SKIPPED` nach `COMPLETED_NOOP_SUSPECT` (terminal short-circuit greift).

Verification-SQL liegt in `docs/lipsync/v129-3-sync-audio-normalization.md`.

## Files
- `supabase/functions/_shared/wav-utils.ts` (neu) — `trimWavWindow`, header validation.
- `supabase/functions/_shared/audio-vad.ts` oder existing scanner — Erweiterung um `first_voiced_sec` / `last_voiced_sec` / `tail_silence_sec`.
- `supabase/functions/compose-dialog-segments/index.ts` — Change A (Build sync_audio), Change B (Validate), Change C (Preflight gate), Change D (Terminal short-circuit), Change E (Refund key).
- `docs/lipsync/v129-3-sync-audio-normalization.md` (neu).
- `mem/architecture/lipsync/v1293-sync-audio-normalization.md` (neu).
- `mem/index.md` — Eintrag.
- `.lovable/plan.md` — Status-Update.

Deploy nur `compose-dialog-segments`. Kein DB-Migration.
