---
name: v94 Preclip Window = Union of Turns
description: Per-pass preclip in compose-dialog-segments must span all turns of the speaker, not just the first turn, or Sync.so cut_off truncates multi-turn lipsync
type: constraint
---

# FROZEN-Invariant I.13 — Preclip-Fenster = Hülle aller Sprecher-Turns

## Was

In `supabase/functions/compose-dialog-segments/index.ts` MUSS das Preclip-Render-Fenster pro Sprecher die **Union aller `pass.segments[]`** abdecken (min(startTime) … max(endTime), je ±0.08s Padding), **NICHT** nur `segments[0]` ("firstTurn").

Betroffene Stellen:
- `~L2030-2043` (Plan B Batch-Preclip-Prefetch)
- `~L2205-2213` (v69 Unified Per-Pass Preclip)

## Warum (Bug v93→v94, Juni 2026)

Sync.so läuft mit `sync_mode=cut_off` und liefert Output = `min(videoDur, audioDur)`. 
- Video-Input = Preclip (face-crop des Master-Plates)
- Audio-Input = Tight-WAV (deckt alle Turns dieses Sprechers ab, mit Gaps)

Wenn der Preclip nur `firstTurn` umfasst (z.B. 2.4s), die Tight-WAV aber 5.0s ist (Turn 1 + Turn 2), wird der Output bei ~2.4s abgeschnitten. Der Compositor liest Shot 2 mit `sourceStartSec=output_offsets_sec[1]` (z.B. 2.39s) → eingefrorenes letztes Frame → **kein Lipsync für Turn 2+**.

Symptom: Sprecher mit ≥2 Turns hat nur auf Turn 1 animierte Lippen; Single-Turn-Sprecher sind unauffällig.

## Wie anwenden

```ts
const passSegs = Array.isArray(pass.segments) ? pass.segments : [];
const segStarts = passSegs.map((t) => Number(t.startTime)).filter(Number.isFinite);
const segEnds   = passSegs.map((t) => Number(t.endTime)).filter(Number.isFinite);
const winStartSec = Math.max(0, Math.min(...segStarts) - 0.08);
const winEndSec   = Math.min(totalSec, Math.max(...segEnds) + 0.08);
```

Niemals `pass.segments[0]` als alleinige Quelle für `winStart/winEnd` verwenden.

## Was NICHT angefasst werden darf

- Tight-WAV-Konstruktion (`audio_tight.windows_secs`, `output_offsets_sec`) — unverändert
- Mux-Shot-Geometrie (`startSec`, `endSec`, `sourceStartSec`) — unverändert
- Sync.so-Payload-Vertrag (sync_mode=cut_off bleibt) — unverändert
- FROZEN-Invariants I.1–I.12 — unverändert

## Verifizierung

1. 2-Sprecher-Szene mit mind. einem Multi-Turn-Sprecher rendern
2. `dialog_shots->passes[i]->preclip_url` Dauer ≈ `audio_tight.dur_sec` (±0.2s)
3. Visuell: alle Turns aller Sprecher zeigen animierte Lippen
