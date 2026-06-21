# v165 — Silent-Face Crop Math + Parallel Pass Dispatch

## Root Causes (confirmed)

### Bug A — "Ganzes Video sieht aus als wäre alles lip-synced" (Geister-Gesichter)

`SilentFaceFreeze` in `src/remotion/templates/DialogStitchVideo.tsx` (Zeile 269–298) rendert das **gesamte Master-Plate-Video** (1376×768, alle 4 Sprecher sichtbar) per `objectFit: cover` in eine `size × size` Box an Position `(left, top)`.

Resultat pro Pass: 3 zusätzliche, vollständig gestauchte Kopien der **gesamten** Szene werden an den 3 anderen Sprecher-Slots gezeichnet → 4 Sprecher × 3 Ghost-Kopien = bis zu **12 überlappende Master-Plates** statt nur des einen Gesichts pro Slot.

Vergleich `CroppedOverlay` (Zeile 149–200): funktioniert, weil dort ein **bereits zugeschnittenes Preclip** (720×720, nur ein Gesicht) per `cover` skaliert wird. `SilentFaceFreeze` hat die identische Struktur, aber das Source-Video ist ungeschnitten — deshalb der Effekt.

### Bug B — 12:30 Min Render-Dauer, Pass 3 + 4 besonders lang

`syncso_dispatch_log` für Szene `becaa5ce…` zeigt vier **sequentielle** Dispatches im Abstand von ~2:13, ~2:50, ~3:27 Minuten:

```
19:40:03  pass 0 DISPATCHED
19:42:17  pass 1 DISPATCHED   (+2:13)
19:45:06  pass 2 DISPATCHED   (+2:50)
19:48:33  pass 3 DISPATCHED   (+3:27)
```

Jede Iteration = Preclip-Lambda (~30–60 s) + Sync.so-Polling (~2 min) → 4× nacheinander = ~12 min total. Pass 3 und 4 sind „länger", weil sie alle vorigen Pass-Latenzen plus eigene tragen — sie laufen nicht wirklich langsamer.

---

## Fix

### Fix A — Korrekte Crop-Math in `SilentFaceFreeze`

Inneren Container nicht mehr als „squish-to-fit" verwenden, sondern als **Viewport** auf das skalierte Master-Plate:

```text
outer box (overflow:hidden)
   left = x_src * scaleX
   top  = y_src * scaleY
   width  = size_src * scaleX
   height = size_src * scaleY      ← getrennte X/Y-Skalierung,
                                     identisch zu Active-Speaker-Pipeline
inner <Video>
   width  = srcW * scaleX          ← volle Plate-Größe in Comp-Pixeln
   height = srcH * scaleY
   transform = translate(-x_src*scaleX, -y_src*scaleY)
   objectFit = fill                ← KEIN cover mehr
```

Damit zeigt jeder Silent-Slot exakt die Plate-Region `(x, y, size, size)` an, also nur das Gesicht des nicht-aktiven Sprechers — genau wie der aktive Preclip-Overlay daneben.

Zusätzlich:
- Soft-Circular-Mask beibehalten (sitzt auf der äusseren Box → fadeen die Plate-Region am Rand aus, kein sichtbarer Square-Seam).
- `Freeze frame={0}` bleibt (wir wollen ja explizit den unbewegten Mund).
- `srcWidth`/`srcHeight` werden bereits an die Composition durchgereicht (Zeile 318–321), keine neuen Props nötig.

### Fix B — Parallele Pass-Dispatches

In `supabase/functions/compose-dialog-segments/index.ts` die Pass-Schleife (around `for (const pass of passes)` / `currentPassIdx`) umstellen auf `Promise.allSettled(passes.map(dispatchOnePass))` — jeder Pass enthält bereits seinen eigenen `pass.idx`, `pass.coords`, `audio_url`, eigene Preclip-Render-ID und sein eigenes Sync.so-Polling.

Konkrete Massnahmen:
1. Pass-Body (Preclip-Render + Face-Gate + Sync.so-Dispatch + DB-Write) in eine async-Funktion `dispatchPass(pass, ctx)` extrahieren.
2. Statt `for`-Loop: `await Promise.allSettled(passes.map((p) => dispatchPass(p, ctx)))`.
3. **Concurrency-Cap = 4** (genau Anzahl Sprecher in Praxis): kein zusätzlicher Sync.so-Rate-Limit-Druck (4 parallele Jobs sind innerhalb Plan), kein Lambda-Worker-Druck (Preclip = 1 Worker pro Render, Sync.so läuft extern).
4. Idempotenz ist bereits gegeben (`pass.preclip_url` wird vor erneutem Render geprüft, line 3576), also Re-Tries einzelner Passes brechen nichts.
5. `logSyncDispatch`, `syncso_dispatch_log` und der ASD-Fingerprint bleiben pro Pass — die Logs werden weiterhin nach `pass_idx` indiziert und sind in der Cockpit-UI sortierbar.

Erwartung: 4 Passes parallel → Wand-Zeit ≈ max(Pass-Latenz) ≈ **2:30–3:00 min statt 12:30**. Audio-Mux-Render läuft danach unverändert seriell.

### Akzeptanzkriterien

- Final-MP4: nur der aktive Sprecher pro Audio-Fenster bewegt den Mund; die drei anderen Köpfe sind eingefroren auf Frame 0 ihrer eigenen Master-Plate-Region. Keine sichtbaren Mini-Plates / Ghost-Kopien mehr.
- `syncso_dispatch_log` zeigt 4 `DISPATCHED`-Einträge innerhalb < 60 s Spanne (statt 8 min).
- Gesamtrender (compose-dialog-segments → render-sync-segments-audio-mux) für 4-Sprecher / 9 s Szene < 5 min.
- Bestehende 1- und 2-Sprecher-Szenen unverändert (1 Pass → trivial-parallel, 0 Silent-Slots → unverändert).

### Dateien

- `src/remotion/templates/DialogStitchVideo.tsx` — `SilentFaceFreeze` Crop-Math
- `supabase/functions/compose-dialog-segments/index.ts` — Pass-Schleife → `Promise.allSettled` mit `dispatchPass`-Wrapper
- `supabase/migrations/<ts>_v165_reset_dialog_scene.sql` — Reset `becaa5ce-e4c3-47b7-933d-766e83807b9c` für Re-Run
- `mem/architecture/lipsync/v165-silent-face-crop-and-parallel-dispatch.md` — Architektur-Notiz
- `mem/index.md` — Pointer zu v165
- Remotion-Bundle muss nach dem TSX-Fix neu deployed werden (`scripts/deploy-remotion-bundle.sh`)

### Nicht im Scope

- Sync.so-Pricing / Engine-Wechsel.
- Master-Plate-Regenerierung.
- Änderung am `bbox-url-pro` ASD-Format (v163 bleibt).
