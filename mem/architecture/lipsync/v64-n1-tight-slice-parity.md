---
name: v64 N=1 Tight-Slice Parity + Single-Tight Overlay
description: 1-Sprecher Cinematic-Sync nutzt jetzt denselben erfolgreichen Tight-Slice + Overlay-Pfad wie N≥2. Vorher schickte N=1 ein 10s WAV mit 78% Trailing-Silence an Sync.so → reproduzierbar provider_unknown_error. Fix: Tight-Slice Gate von `passes.length>=2` auf `>=1` reduziert, sync_mode für N=1 auf `cut_off`, audio-mux Lambda overlay-Branch greift jetzt auch für 1 done pass mit `audio_tight`.
type: architecture
---

## Symptom (Juni 2026)

1-Sprecher Cinematic-Sync Szene schlug 3× hintereinander mit
`provider_unknown_error` fehl (variant ladder coords-pro → coords-pro-box
→ sync3-coords → coords-pro-lp2pro), auch nachdem v62 sync-3 als Default
gesetzt hatte und v63 `sync_mode=loop` aktiviert war.

Edge-Log:
```
windows=[[0, 2.216]]   ← Sprechfenster
totalSec=10            ← Plate-Länge
audio file: …-char0-samuel-dusatko.wav  (per-speaker, 10s gepaddet)
3× Sync.so → "An unknown error occurred."
```

Gleichzeitig: 2-Sprecher-Szenen mit derselben Pipeline (sync-3, locked
Hailuo plate, gleiche Plate-Source) liefen sauber durch.

## Root Cause

Die Pipeline war **nicht** identisch:

| Fall  | Tight-Slice Gate (L1884) | Audio an Sync.so |
|-------|--------------------------|------------------|
| N≥2   | aktiv (`passes.length >= 2`) | Per-Pass auf Sprechfenster geschnitten (~Speech-Dauer, kein Trailing-Silence) |
| N=1   | **deaktiviert** | 10s WAV mit 0–2.2s Stimme + 7.8s Stille |

Sync.so (sync-3 **und** lipsync-2-pro) wirft auf einer Locked-Camera-Plate
mit überwiegend stiller Audio (~78% Trailing-Silence) reproduzierbar
`provider_unknown_error` — derselbe Fehlerkanal, der vor v60 bei N≥2 mit
gepaddetem Audio existierte und durch die Tight-WAV-Slice gelöst wurde.

## Fix (v64)

### 1. `compose-dialog-segments/index.ts`

- **L1884 Tight-Slice Gate**: `passes.length >= 2 && speakerWindowsSecs.length > 0`
  → `speakerWindowsSecs.length > 0` (auch N=1).
- **L1922 `sync_mode`**: dynamisch
  - N≥2 → `loop` (v63 — Master-VO kann länger als Plate sein)
  - N=1 → `cut_off` (Tight-Audio ist kurz; wir wollen exakte Speech-Dauer
    als Output; Tail wird vom audio-mux Lambda gefüllt)
- **L2092 Hard-Gate**: greift jetzt auch für N=1 (kein Sync.so Dispatch
  ohne erfolgreiche Tight-Slice).
- **L2182, L2366 Logs/State**: `sync_mode=${payloadSyncMode}` statt hartcodiert.

### 2. `sync-so-webhook/index.ts`

L893–916 verzweigt jetzt nach `singleTight`:
- `totalPasses === 1 && !audio_tight` → Legacy direct-finalize (audio
  matched bereits Plate).
- `totalPasses === 1 && audio_tight` → Dispatch `render-sync-segments-audio-mux`
  (Overlay onto master plate).
- `totalPasses >= 2` → unverändert (Fan-In).

### 3. `render-sync-segments-audio-mux/index.ts`

- `useOverlay = isFanout || (donePasses.length >= 1 && anyTight)` —
  Overlay-Branch greift jetzt auch für 1 done pass mit `audio_tight`.
- `masterVideoUrl` = Original-Pristine-Plate für N=1 Tight (statt
  Sync.so Output, das nur ~Speech-Dauer ist).
- Face-Mask radius für N=1: 28% min-axis (mehr als die 22% bei N=2, weil
  kein konkurrierendes Gesicht).
- Lambda overlay legt Sync.so 2.2s Output auf 10s Master-Plate während
  `[turn.startTime ± 0.08s, turn.endTime ± 0.08s]`; Rest der Szene zeigt
  pristine Plate.

## Verifikation

1. 1-Sprecher Cinematic-Sync Szene → Edge-Log zeigt
   `tight=2.22s windows=[[0, 2.216]] sync_mode=cut_off`,
   Sync.so liefert 200 OK in <60s, dann audio-mux Lambda dispatch
   `mode=single-tight-overlay`.
2. Finale `clip_url` ist 10s lang: 0–2.2s lipsynced overlay, 2.2–10s
   pristine plate.
3. 2-Sprecher Szene weiterhin grün (Regression-Check) — `loop` Pfad
   unverändert, Fan-Out Logik unverändert.

## Out of Scope

- v62 sync-3 Universal Default bleibt.
- v60 Unified Multi-Speaker Pipeline bleibt.
- Retry-Ladder, ASD, Face-Gate, Refund-Pfad, Watchdog unverändert.
- v56 official segments (debug-only, `force_v56`) bleibt `sync_mode=loop`.
- Keine Änderung am Remotion `DialogStitchVideo` Template — die existierende
  `shots[]` API mit `faceMask` + `sourceTiming='relative'` reicht für N=1 Overlay.
