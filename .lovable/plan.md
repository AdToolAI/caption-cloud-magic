## Bug: Multi-Turn-Sprecher verliert Lipsync ab Turn 2

### Root Cause (verifiziert anhand Scene `182e1364…`)
Das Preclip-Fenster pro Sprecher wird in `compose-dialog-segments/index.ts` an zwei Stellen nur aus **`firstTurn`** gebaut:

- **L2032-2033** (Plan B Batch-Preclip-Prefetch)
- **L2210-2211** (v69 Unified Per-Pass Preclip)

```ts
const winStartSec = Math.max(0, Number(firstTurn.startTime) - 0.08);
const winEndSec   = Math.min(totalSec, Number(firstTurn.endTime) + 0.08);
```

Hat ein Sprecher mehrere Turns (z.B. Samuel: `[0, 2.32] + [3.75, 6.31]`), ist der Preclip nur ~2.4s lang. Die Tight-WAV deckt aber alle Turns ab (5.05s mit `output_offsets_sec=[0, 2.39]`). Sync.so liefert mit `sync_mode=cut_off` nur Output = min(video, audio) ≈ Preclip-Länge. Shot 2 im Mux liest dann mit `sourceStartSec=2.39s` über das Output-Ende hinaus → eingefrorenes Frame, kein Lipsync.

Symptom passt 1:1 zum Bericht: Samuel Turn 1 ✅, Samuel Turn 2 ❌, Matthew (1 Turn) ✅.

### Fix (1 Datei, minimaler Patch)

`supabase/functions/compose-dialog-segments/index.ts`

Ersetze an **beiden** Stellen (L2032-2033 und L2210-2211) das First-Turn-Fenster durch die **Hülle aller Turns dieses Passes**:

```ts
// Span all turns of THIS speaker so the preclip is long enough to
// cover the full Tight-WAV. Otherwise Sync.so (sync_mode=cut_off)
// caps the output at preclip-length and turns 2..N of the same
// speaker render as a frozen last frame.
const passSegments = (p.segments ?? []);  // bzw. pass.segments
const segStarts = passSegments.map((t: any) => Number(t.startTime));
const segEnds   = passSegments.map((t: any) => Number(t.endTime));
const winStartSec = Math.max(0, Math.min(...segStarts) - 0.08);
const winEndSec   = Math.min(totalSec, Math.max(...segEnds) + 0.08);
```

Edge-Cases:
- Fallback bei leerer `segments[]` → `winStartSec=0, winEndSec=totalSec` (existierende Defensive bleibt unverändert).
- Der `if (!(winEndSec > winStartSec + 0.05))`-Guard auf L2034 bleibt unverändert wirksam.

### Warum das sicher ist
- Preclip wird länger, aber maximal so lang wie `totalSec` (Plate-Länge). Keine neuen Lambda-Limits, kein neuer Sync.so-Vertrag.
- Tight-WAV-Konstruktion, `output_offsets_sec`-Berechnung, Mux-Shot-Logik, Compositor — alle unverändert.
- Kosten Sync.so (`ceil(dur)×9×passes`) bleiben gleich, weil sie an der Audio-Dauer hängen, nicht am Preclip.
- Single-Turn-Sprecher (Matthew) verhalten sich identisch wie vorher (min/max = first/last).

### Verifizierung
1. Neue 2-Sprecher-Szene rendern, bei der **mindestens ein Sprecher 2 Turns** spricht.
2. In DB prüfen: `dialog_shots->'passes'[0]->'preclip_url'` Dauer ≈ `audio_tight.dur_sec` (±0.2s).
3. Visuell: beide Turns des Multi-Turn-Sprechers müssen animierte Lippen zeigen.
4. Logs greppen: `v90_tight_audio` zeigt `windows=[…2 Einträge…]`, `dur_sec≈5.0` → der korrespondierende Preclip-Render-Log muss `dur≈5.0` zeigen (statt 2.4).

### Was NICHT angefasst wird
- FROZEN-Invariants (I.1–I.12) bleiben unberührt.
- Plan D Parallel-Sync-Flags bleiben aktiv.
- Kein Migration nötig.

### Nach dem Fix
Memory-Update in `mem://architecture/lipsync/` als `v94-preclip-window-union-of-turns.md` (kurz dokumentieren, damit der nächste Refactor nicht wieder `firstTurn` einsetzt).
