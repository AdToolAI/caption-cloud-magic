# Bug v95 — "Lippen bewegen sich bei Turn 2 nur minimal"

## Diagnose (verifiziert an Scene `0915d2a0-9934-467b-97c6-130414f93dd5`)

Der v94-Fix (Preclip-Fenster = Union aller Turns) ist **die Wurzel des neuen Symptoms**:

```
Plate-Timeline:  [0 ───── 1.58s] Turn1 spricht  [1.58 ─── 3.19s] Plate-STILLE  [3.19 ─── 5.24s] Turn2 spricht
Preclip (5.33s): kopiert kontinuierlich diese gesamte Plate-Region
Tight-WAV (3.79s): Turn1 Audio [0 → 1.58s]  +  50ms Gap  +  Turn2 Audio [1.65 → 3.79s]

Sync.so output = min(video, audio) = 3.79s  → also Preclip-Frames [0 ─── 3.79s]
                                                       ▲              ▲
                                                       │              └─ entspricht Plate-Zeit 3.79s, immer noch STILLE-Region!
                                                       └─ Turn1 OK
```

Sync.so versucht Turn-2-Audio (lebendige Sprache) auf Preclip-Frames zu legen, die einen **ruhigen, geschlossenen Mund** zeigen → Modell macht nur minimale Lippenbewegung. Mux liest Shot 2 bei `sourceStartSec=1.649s` → exakt aus der schlecht animierten Region.

Das ist **nicht** durch Preclip-Verlängerung lösbar. Das Preclip-Video muss **mundbewegungs-relevante Frames** für die gesamte Sync.so-Output-Dauer zeigen.

## Fix-Strategie: Per-Turn-Passes für Multi-Turn-Sprecher

Statt einen Pass mit N Turns (1 Preclip + 1 Tight-WAV + 1 Sync.so-Call) machen wir **N Passes pro Multi-Turn-Sprecher** — jeder mit kurzer Tight-WAV (genau dieser eine Turn) und kurzem Preclip (genau dieser eine Turn aus dem Plate). 

Jeder Sync.so-Call sieht dann: Video zeigt sprechenden Mund + Audio passt → volle Animation, kein Aliasing.

### Was geändert wird

**Datei: `supabase/functions/compose-dialog-segments/index.ts`** — Pass-Splitter direkt vor dem Multi-Pass-Build:

Wo aktuell Passes mit `pass.segments=[turn1, turn2]` gebaut werden, expandieren wir auf `pass.segments=[turn1]` und `pass.segments=[turn2]` (zwei separate Passes mit identischer Sprecher-Identität, aber je 1 Turn).

Die existierende v94-Union-Logik (L2030-2043 + L2210-2213) bleibt — sie wird zum No-Op weil pro Pass nur noch 1 Turn vorhanden ist (min=max=Turn-Window).

### Kosten / Performance

- Sync.so: +1 Call pro Extra-Turn pro Sprecher (Pricing `ceil(dur)×9×passes` bleibt linear in Turn-Dauer)
- Wall-clock: durch Plan D Parallel-Sync.so-Passes (Cap=2) im Background — minimal sichtbar
- Mux: kein Change, `output_offsets_sec` wird trivial `[0]` pro Pass, Shot-Geometrie aus `pass.segments[0]` bleibt korrekt

### Was NICHT angefasst wird

- Tight-WAV-Logik (`sliceWavToWindows`) — wird mit 1-Turn-Window aufgerufen → 1 fortlaufende Audio-Region, kein internes Gap
- Preclip-Renderer (`renderPassFacePreclip`) — bekommt jetzt Plate-Region exakt eines Turns
- Mux-Lambda + Compositor — keine Änderung
- FROZEN-Invariants I.1–I.13 — alle bleiben gültig (I.13 wird trivial erfüllt)
- Single-Turn-Sprecher — keine Änderung
- Parallel-Sync.so-Flags — bleiben aktiv

### Verifizierung

1. Neue Szene mit Multi-Turn-Sprecher (Samuel 2 Turns + Matthew 1 Turn)
2. DB-Check: `dialog_shots->'passes'` hat 3 Einträge (statt 2), `passes[0].segments.length==1` und `passes[1].segments.length==1` für die zwei Samuel-Turns
3. Visuell: alle 3 Turns zeigen volle Lippenbewegung
4. Logs: 3 Sync.so-Dispatches, davon 2 parallel (durch Cap=2)

### Rollback-Sicherheit

Splitter ist hinter einem Feature-Flag `composer.split_multi_turn_passes` (default ON). Bei Bedarf via `system_config`-Toggle deaktivierbar → fällt auf v94-Union-Verhalten zurück.

### Memory-Update nach Fix

- `mem://architecture/lipsync/v95-per-turn-pass-split.md` — dokumentiert Splitter + warum Union-Preclip nicht ausreicht
- `mem://architecture/lipsync/FROZEN-INVARIANTS.md` — Rule **I.14**: "Multi-Turn-Sprecher MÜSSEN in N Single-Turn-Passes gesplittet werden, weil Sync.so cut_off keine Plate-Stille-Regionen überbrücken kann."
- v94-Doku als "ergänzt durch v95" markieren (nicht löschen — Union-Window ist weiterhin korrekt als Defensive)
