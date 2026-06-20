## Beweislage (was wir nach v139.1 wissen)

**Sync.so OpenAPI (offizielle Quelle, gerade nachgeschlagen):**
```yaml
coordinates: { type: array, items: { type: integer } }
# Description: "Reference point [x, y] on the speaker's face"
```
→ **Flat `[x, y]` ist 100% korrekt.** Es gibt **kein `minItems`** im Schema. Die Fehlermeldung *"must contain at least 2 elements"* ist Sync.so-Laufzeit-Prosa und bedeutet schlicht: *die zwei Zahlen x und y müssen beide da sein*. v139.1 hat also die richtige Richtung — aber das 400 kommt trotzdem.

**Was die Logs zum letzten Run (10:44 Uhr) zeigen:**
- ❌ **Kein einziges `v139…`- oder `coords_shape…`-Log**. Unser v139.1-Pre-Dispatch-Assert hat nie gefeuert.
- Nur `v1291_preclip_sync3` (alt) und `v130` taucht im Strategy-Log auf.
- pass=1 dispatched mit `coords=[300,144]` (flat, sieht OK aus) — aber `centered_coord` im Strategy-Log war `[360,360]`. Zwei verschiedene Werte → **ein anderer Code-Pfad** als der v139.1-gepatchte hat die finalen Coords gesetzt.
- pass=0 → Sync.so 400 "at least 2 elements". Unser Assert (der das 400 vorher abfangen würde) hat nicht geblockt → **entweder Deploy nicht aktiv ODER pass=0 läuft an dispatchToSyncSo komplett vorbei**.

**Root-Cause-Verdacht:** Es gibt **mindestens 7 Stellen** im File die `syncOptions.active_speaker_detection` setzen (Zeilen 4118, 4157, 4243, 4320, 4339, 4351, 5038) plus Forensik-Pfade (5467). v139.1 hat nur **eine** davon (4157) gefixt. Die anderen sind teilweise schon flat, aber **wir haben keinen Beweis welcher Pfad pass=0 nimmt**, weil zwischen Strategy-Override und Wire-Dispatch zu viele Mutations-Punkte liegen.

---

## v139.2 — Plan (3 Etappen, jede einzeln verifizierbar)

### Etappe A — Deployment-Wahrheit & Wire-Forensik (~30 Zeilen)

Ziel: **Beweisen welche Version läuft und was Sync.so tatsächlich als JSON sieht.**

1. **Boot-Log** in `compose-dialog-segments/index.ts`: einmaliges `console.log` beim Modul-Load mit `COMPOSE_DIALOG_SEGMENTS_VERSION` + Datei-Hash (`Date.now()` reicht als "deploy marker"). So sehen wir sofort ob Edge-Runtime die alte Version cached.
2. **Wire-Forensik-Log unmittelbar vor `fetch(${SYNC_API_BASE}/generate)`** (Zeile 5245): `console.log(... WIRE_PAYLOAD options=${JSON.stringify(payload.options)} pass=${currentPassIdx})`. Das zeigt uns die **exakte** Bytes, die Sync.so sieht — kein Raten mehr.
3. **Wire-Forensik-Log bei der 400-Response**: zusätzlich das `payload.options` mitloggen damit Request+Response in einer Zeile korreliert sind.
4. Re-Deploy, eine 4-Speaker-Szene laufen lassen, Logs ziehen.

→ Aus diesen Logs wissen wir innerhalb von **einem Run** ob:
   - (a) die Coords als `[[x,y]]` rausgehen (Regression an anderer Stelle),
   - (b) die Coords komplett fehlen (`undefined`/leeres Array),
   - (c) die Coords flat sind aber Sync.so wegen anderem Feld 400t (z. B. `frame_number` out-of-range, `auto_detect:false` mit leeren Boxes).

### Etappe B — Single-Setter-Refactor (~80 Zeilen netto, ~250 Zeilen gelöscht)

Ziel: **Aus 7 parallelen ASD-Mutation-Punkten wird genau einer.** Die Konsolidierung die du wolltest, aber chirurgisch nur für ASD.

1. Neue Helper-Funktion `buildAsdPayload(strategy, pass, preclipMeta) → { auto_detect, coordinates?, frame_number?, bounding_boxes_url? }`:
   - Single Source of Truth — implementiert die volle Doc-Strict-Logik einmal.
   - Returnt **immer** ein doc-konformes Objekt (entweder `{auto_detect:true}` oder `{auto_detect:false, frame_number:N, coordinates:[x,y]}` oder `{auto_detect:false, bounding_boxes_url:"..."}`).
   - Eingebauter Self-Check: wirft synchron wenn Shape illegal — keine Möglichkeit dass ein illegaler Wert das File verlässt.
2. **Alle 7 bestehenden Assignment-Stellen entfernen** und durch genau einen Call vor dem Dispatch ersetzen: `syncOptions.active_speaker_detection = buildAsdPayload(...)`.
3. v131.5-Override / v136-Sanitizer / v139.1-Assert: alle drei in `buildAsdPayload` zusammenführen — kein Late-Mutation mehr.
4. Re-Deploy.

### Etappe C — Verifikation & Memory-Update

1. 4-Speaker-Szene laufen.
2. Erwartetes Log-Pattern: `v139.2_boot version=v139.2`, dann pro Pass `WIRE_PAYLOAD options={...}` mit `"coordinates":[x,y]` flat, dann `v139_fanout_active cap=2`, dann 4× Sync.so 201 (kein 400 mehr).
3. Memory: `mem/architecture/lipsync/v136-coords-shape-canonical.md` updaten mit der finalen Single-Setter-Regel; `mem/index.md` Eintrag erweitern.

---

## Technische Details

**Was NICHT angefasst wird (bleibt 1:1):**
- v138 Plan-D Fan-out Logik, v139 Coord-Refresh-Scoping, Batch-Preclip-Defaults, Sync.so Webhook, Stitch, Audio-Normalisierung, Wallet/Refund-Pfad, Frontend.
- Die Plate-Identity / v117 SOFT-WARN-Logik (orthogonal zum Shape-Problem).

**Was deployed wird:**
- Nur `supabase/functions/compose-dialog-segments/index.ts`.
- Keine DB-Migration, kein Frontend-Build, keine neuen Secrets.

**Risiko:**
- Niedrig. Etappe A ist nur Logging (read-only). Etappe B ist eine reine Refactoring-Konsolidierung — die *vorhandene* doc-strict Logik bleibt erhalten, nur die Duplikate verschwinden. Wenn Etappe A bereits einen unerwarteten Cause aufdeckt (z. B. `frame_number` zu groß), pivotieren wir bevor wir B machen.

**Abbruch-Kriterium für Etappe B:**
- Falls die Wire-Forensik aus Etappe A zeigt dass das Problem gar nicht die Coord-Shape ist sondern ein anderes Feld (z. B. `frame_number > preclip_frame_count`), wird Etappe B abgesagt und stattdessen der echte Cause gefixt.

---

## Reihenfolge der Ausführung

1. Etappe A (Logging + Re-Deploy)
2. Du startest eine Szene → wir lesen die `WIRE_PAYLOAD`-Logs
3. Auf Basis des Beweises: Etappe B ODER Pivot
4. Etappe C (Verifikation + Memory)

Soll ich mit **Etappe A** beginnen?
