---
name: v63 Sync.so sync_mode=loop (Frozen-Frame Fix)
description: Dispatch sync_mode=loop instead of cut_off so the lipsync output length always matches the master VO audio. Fixes "scene freezes, voiceover continues" when the locked-camera plate is shorter than the VO.
type: architecture
---

**Trigger (Juni 2026)**: Dialog-Szenen mit längerem VO als Plate (z.B. 14s VO auf 10s Hailuo-Plate) lieferten ein abgeschnittenes Lipsync-Clip. Composer spielte den Master-VO-Track linear weiter → letzter Frame eingefroren, Stimme läuft weiter.

**Root Cause**: `options.sync_mode = "cut_off"` in allen Sync.so-Dispatches. Per Sync.so Docs trimt `cut_off` den Output auf `min(video, audio)`. Wenn `plate < audio` → Output endet bei Plate-Länge.

**v63 Fix** (alle in `supabase/functions/compose-dialog-segments/index.ts`):
- Zeile 1144 (v56 multi-speaker official segments payload): `sync_mode: "loop"`
- Zeile 1920 (single-speaker / per-turn `syncOptions`): `sync_mode: "loop"`
- State-Metadata + Log-Lines konsistent auf `loop` aktualisiert.

**Warum `loop` (statt `remap` / `bounce`)**: Unsere Master-Plates sind per v57 garantiert locked-camera (kein Cut/Zoom/Pan). Eine geloopte statische Aufnahme ist visuell nicht von einem gehaltenen Frame zu unterscheiden, garantiert aber `output_length == audio_length`. `remap` würde Mikrobewegungen (Blinks) time-stretchen, `bounce` würde Frames rückwärts spielen.

**Out of scope**: v62 sync-3 Universal Default bleibt; Retry-Ladder, ASD, Face-Gate, Refund, Watchdog unverändert.

**Verifikation**: Log zeigt `sync_mode=loop`, `clip_url` Dauer ≈ Master-Audio-Dauer (±0.1s), kein Freeze im Composer-Player.
