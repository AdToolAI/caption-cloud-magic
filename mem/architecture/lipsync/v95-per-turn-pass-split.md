---
name: v95 Per-Turn Pass Split for Multi-Turn Speakers
description: Splits multi-turn speakers into N single-turn Sync.so passes so each preclip covers only mouth-active plate frames; supersedes v94 union-preclip approach
type: constraint
---

# v95 — Per-Turn Pass Split

## Was

In `supabase/functions/compose-dialog-segments/index.ts` (~L1215-1280) wird unmittelbar nach dem Bau von `builtPassesRaw` jeder Pass mit `segments.length > 1` in **N Single-Turn-Passes** expandiert. Flag: `system_config.composer.split_multi_turn_passes` (default **ON**).

```ts
const builtPasses = builtPassesRaw.flatMap((p) => {
  if (p.segments.length <= 1) return [p];
  return p.segments.map((seg) => ({ ...p, segments: [seg] }));
}).map((p, i) => ({ ...p, idx: i }));
```

Sprecher-Identität (`speaker_idx`, `character_id`, `speaker_name`, `audio_url`, `coords`) bleibt über alle Splits identisch — nur das `segments[]` Array enthält jetzt genau einen Turn.

## Warum (Bug v94→v95, Juni 2026)

v94 hat das Preclip-Fenster auf die **Hülle aller Turns** vergrößert, um den `min(video, audio)`-Cut-off von Sync.so zu vermeiden. Damit war der Preclip lang genug — aber er enthielt auch die **Plate-Stille zwischen den Turns**.

Verifiziert an Scene `0915d2a0-9934-467b-97c6-130414f93dd5`:
- Matthew Turns: `[0, 1.58]` + `[3.19, 5.24]` (Plate-Timeline)
- Preclip (v94): `[0, 5.33]s` aus Plate, inkl. ~1.6s Stille in der Mitte
- Tight-WAV: 3.79s mit Audio-Offsets `[0, 1.65]`
- Sync.so Output: 3.79s → Frames `[0, 3.79]` aus Preclip
- Frames `[1.65, 3.79]` zeigen die **stille Plate-Region** (Mund zu)
- Sync.so animiert Turn-2-Sprache auf ruhigen Mund → **minimale Lippenbewegung**

Per-Turn-Split löst das, weil jeder Pass jetzt:
1. Eine kurze Tight-WAV hat (genau dieser eine Turn, keine internen Gaps)
2. Einen kurzen Preclip aus genau diesem mund-aktiven Plate-Window
3. Volle Sync.so-Animation über die gesamte Output-Dauer

## Was NICHT angefasst wird

- v94 Union-Window-Logik (~L2030-2043, ~L2205-2213) bleibt — wird zum No-Op weil `pass.segments.length === 1` nach Split (min=max=Turn-Window). Bleibt als Defensive falls Flag ausgeschaltet wird.
- Tight-WAV-Slicing (`sliceWavToWindows`) — unverändert
- Preclip-Renderer (`renderPassFacePreclip`) — unverändert
- Mux-Lambda + Compositor — unverändert (jeder zusätzliche Pass produziert einen eigenen Mux-Shot mit `sourceStartSec=0`)
- Parallel-Sync.so-Flags (Plan D) — bleiben aktiv, profitieren sogar mehr durch mehr parallelisierbare Passes
- FROZEN-Invariants I.1-I.13 — alle bleiben gültig

## Kosten

Sync.so-Calls = `Σ ceil(turnDur) × 9` (statt früher `ceil(audioDur) × 9` pro Sprecher). Bei einem 2-Turn-Sprecher mit Turns 1.5s + 2.0s: vorher 1 Call × ceil(3.5) = 36 Credits, jetzt 2 Calls × (ceil(1.5) + ceil(2.0)) = 2 × 18 = 36 Credits Sync.so-seitig identisch. Bei Sub-Sekunden-Turns leicht teurer durch `ceil()`-Runden.

Wall-clock: minimal sichtbar dank Plan D Parallel-Dispatch (Cap=2).

## Rollback

```sql
UPDATE system_config SET value = 'false'::jsonb
WHERE key = 'composer.split_multi_turn_passes';
```

Fällt sofort auf v94 Union-Window-Verhalten zurück (next dispatch).

## Verifizierung

1. Neue 2-Sprecher-Szene rendern, bei der mind. ein Sprecher 2 Turns spricht (z.B. Samuel 2 + Matthew 1).
2. DB: `composer_scenes.dialog_shots->'passes'` hat **3 Einträge** (statt 2).
3. Jeder `passes[i].segments.length === 1`.
4. Jeder `passes[i].audio_tight.dur_sec` ≈ Turn-Länge (kein internes Gap).
5. Logs: `v95_per_turn_split raw=2 → expanded=3`.
6. Visuell: alle 3 Turns mit voller Lippenbewegung.
