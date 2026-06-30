# v175 — N=1 `generation_unknown_error` Fix

## Was passiert (Evidenz)

Dispatch-Log für Scene `6490729c…` (gestern 23:59):

- `model: sync-3`, `sync_mode: loop`, `bounding_boxes_url` gesetzt — Payload ist doc-strict für sync-3, also nicht das Problem.
- Audio: **8.0s WAV, voiced_end 6.8s → 1.2s trailing silence**.
- Sync.so antwortet: *"Something went wrong while processing this generation."* (`generation_unknown_error`).

Das ist **exakt der Failure-Mode den v64 dokumentiert hat** und damals durch Tight-Slice gefixt wurde:

> v64 Kommentar (jetzt entfernt): *"Sync.so reproducibly throws `provider_unknown_error` when the per-speaker WAV is mostly trailing silence (the 1-speaker case where speech is e.g. 0–2.2s on a 10s plate). Slicing to the voiced window matches the N≥2 success path."*

## Was sich geändert hat (Regression)

`v169` (Tail-Talk-Fix) hat in `compose-dialog-segments/index.ts` ZWEI Dinge gemacht:

1. **Tight-Slice für N=1 abgeschaltet** (`allowTightSlice = passes.length >= 2`). → genau der Code-Pfad den v64 als Voraussetzung gegen `provider_unknown_error` markiert hatte.
2. Overlay-Mode für N=1 in `render-sync-segments-audio-mux` deaktiviert (single-audio-swap).

Punkt 1 ist die Ursache des aktuellen Fehlers. v172 hatte Tight-Slice für N=1 noch an — deshalb lief es.

Tail-Talk (der Grund für v169) kam aber NICHT primär aus Tight-Slice, sondern aus **v167's Plate-Prompt-Erweiterung** *"speaking naturally with subtle idle mouth and jaw motion"* in `compose-video-clips`. Mit Idle-Mouth-Motion in der Hailuo-Plate UND Overlay-Mode wurde nach dem Sprech-Fenster die pristine Plate mit bewegtem Mund sichtbar.

## Fix

Drei chirurgische Änderungen, alles andere bleibt:

### A) `supabase/functions/compose-dialog-segments/index.ts` — Tight-Slice für N=1 wieder an

`allowTightSlice = passes.length >= 1` (statt `>= 2`). Das ist die direkte v64-Logik. WAV wird auf voiced-Window getrimmt (z.B. 0.1–6.8s statt 0–8s) → kein trailing-silence-Mismatch mehr → Sync.so akzeptiert wieder.

Das v169.1 Preflight-Gate (`prepare_failed_no_tight_audio`) bleibt 1:1 wie zuletzt gepatcht — es feuert dann automatisch wieder ab N≥1.

### B) `supabase/functions/compose-video-clips/index.ts` — v167 Idle-Mouth-Motion für N=1 entfernen

Den v167-Suffix *"speaking naturally with subtle idle mouth and jaw motion"* aus dem N=1 Plate-Prompt streichen und stattdessen *"natural closed-mouth idle, mouth opens only when speaking, subtle micro-expressions"* setzen.

Sync-3 hat built-in obstruction/face-recovery — es braucht keine vorbewegten Lippen auf der Plate, um zu animieren. Mit Closed-Mouth-Plate in der Stille bleibt nach dem Sprechfenster der Mund visuell geschlossen → Tail-Talk weg, auch im Overlay-Mode.

### C) `supabase/functions/render-sync-segments-audio-mux/index.ts` — Overlay-Mode für N=1 wieder erlauben

Den v169 N=1-Bypass (`isSingleSpeaker → useOverlay=false`) zurücknehmen. Mit (A)+(B) ist die Plate jetzt closed-mouth außerhalb des Sprechfensters → Overlay-Mode (Sync-Clip nur im Speaker-Window, sonst pristine Plate) produziert kein Tail-Talk mehr und ist symmetrisch zum N≥2-Pfad.

### D) Memory-Update

`mem/architecture/lipsync/v169-n1-tail-talk-fix.md` → ersetzen durch `v175-n1-unknown-error-fix.md`:

> Invariante: N=1 Cinematic-Sync verwendet Tight-Slice + Overlay-Mode wie N≥2. Tail-Talk wird verhindert durch closed-mouth Idle in der Hailuo-Plate (compose-video-clips), nicht durch Disablen von Tight/Overlay. v64-Provider-Stop-Loss bleibt damit aktiv.

## Was unverändert bleibt

- v168 Anti-Clone Anchor-Lock (N=1 darf nicht 3× Samuel sein)
- v170 Cast-Integrity Audit (Bystanders erlaubt)
- v174 Respect-User-Provider (HappyHorse migriert nicht still auf Hailuo)
- v131.6 Face-Lock, v77/v78 Plate-Face-Targeting
- Refund / Watchdog / Webhook / ASD-Builder

## Verifikation

1. Trigger "🎥 Clip + Lip-Sync neu rendern" auf Scene 1 (`6490729c…`).
2. Dispatch-Log: `tight_audio_dur_sec ≈ voiced_sec` (z.B. 6.7s statt 8.0s), `tight_audio_url` gesetzt, `payloadSyncMode='cut_off'`.
3. Sync.so callback: `status=completed`, kein `generation_unknown_error`.
4. Final Clip: Lippen synchron, am Sprech-Ende geschlossen, kein sichtbares Mund-Wackeln in der Stille.
5. N=2 Regression: weiter wie gehabt (Tight-Slice + Overlay-Mux unverändert).

## Deploy

`compose-dialog-segments`, `compose-video-clips`, `render-sync-segments-audio-mux` neu deployen. Frontend unverändert.
